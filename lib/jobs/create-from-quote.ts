import type { SupabaseClient } from '@supabase/supabase-js'

// Standard install checklist — the process every accepted quote runs through.
// Order matters: it mirrors the pipeline stages on the job detail page.
const INSTALL_CHECKLIST = [
  'Deposit invoice sent to customer',
  'Deposit received & reconciled',
  'Starred equipment ordered from supplier',
  'Stock received — checked against picking list',
  'Installation date agreed with customer',
  'Body corporate / HOA approval confirmed (if applicable)',
  'Site prep check: roof access, DB space, monitoring signal',
  'Panels & mounting installed',
  'Inverter & battery mounted and wired',
  'DB integration, earthing & surge protection complete',
  'System commissioned — monitoring set up for customer',
  'COC issued and filed',
  'Handover pack sent (quote, COC, warranties, user guide)',
  'Follow-up call — 7 days after handover',
]

interface BomLine {
  section?: string
  sku?: string
  description?: string
  quantity?: number
  unitCostRands?: number
  unitSellRands?: number
}

/**
 * Find (or create) the site for this quote's customer. Sites now belong to the
 * CRM customer record (quote_requests.customer_id), so a site can exist before
 * the customer has a login — it becomes visible in their portal the moment they
 * register (auth_user_id links them). Returns null only when the quote has no
 * customer linked at all.
 */
async function resolveCustomerSite(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: Record<string, any>,
): Promise<string | null> {
  const customerId = quote.customer_id as string | null
  if (!customerId) return null

  const { data: site } = await supabase
    .from('sites')
    .select('id')
    .eq('customer_id', customerId)
    .ilike('address', quote.address ?? '')
    .maybeSingle()

  if (site) return site.id

  const { data: newSite } = await supabase
    .from('sites')
    .insert({
      customer_id: customerId,
      name: `${quote.customer_name} - Site ${quote.site_number ?? 1}`,
      address: quote.address ?? '',
      system_type: 'Solar PV',
      status: 'pending',
    })
    .select('id')
    .single()

  return newSite?.id ?? null
}

// Pull the supplier BOM out of the saved quote JSON. Multi-option quotes use
// the tier the customer accepted, falling back to recommended.
function extractBom(generatedQuote: string, acceptedTier?: string | null): BomLine[] {
  try {
    const data = JSON.parse(generatedQuote)
    if (data?.type === 'multi-option' && Array.isArray(data.options)) {
      const wanted = acceptedTier ?? 'recommended'
      const option =
        data.options.find((o: { tier?: string }) => o.tier === wanted) ??
        data.options.find((o: { tier?: string }) => o.tier === 'recommended') ??
        data.options[0]
      return Array.isArray(option?.supplierBom) ? option.supplierBom : []
    }
    return Array.isArray(data?.supplierBom) ? data.supplierBom : []
  } catch {
    return []
  }
}

export interface CreateJobFromQuoteResult {
  ok: true
  jobId: string
  created: boolean
  materialsSeeded: number
  warnings: string[]
}

export interface CreateJobFromQuoteError {
  ok: false
  error: string
  status: number
}

/**
 * Quote accepted → job with pipeline stage, install checklist, and the BOM
 * copied into job_materials. Idempotent: one job per quote.
 *
 * Works with either an RLS-scoped client (admin portal) or the service-role
 * client (public acceptance page). `actorId` becomes assigned_to/created_by
 * (NOT NULL columns) — for public acceptance pass the quote's generated_by
 * or submitted_by.
 */
export async function createJobFromQuote(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: Record<string, any>,
  actorId: string,
): Promise<CreateJobFromQuoteResult | CreateJobFromQuoteError> {
  if (!quote.generated_quote) {
    return { ok: false, error: 'Quote has no saved calculation — calculate and save it first', status: 400 }
  }

  // Idempotent: one job per quote
  const { data: existing } = await supabase
    .from('jobs').select('id, site_id').eq('quote_request_id', quote.id).maybeSingle()
  if (existing) {
    let linkedSiteId = existing.site_id as string | null
    if (!linkedSiteId) {
      linkedSiteId = await resolveCustomerSite(supabase, quote)
      if (linkedSiteId) {
        await supabase
          .from('jobs')
          .update({ site_id: linkedSiteId })
          .eq('id', existing.id)
          .is('site_id', null)
      }
    }

    return {
      ok: true,
      jobId: existing.id,
      created: false,
      materialsSeeded: 0,
      warnings: linkedSiteId
        ? []
        : ['No customer linked to this quote — link a customer so the job appears in their portal.'],
    }
  }

  // Link to (or create) the customer's site via the quote's customer record.
  const siteId = await resolveCustomerSite(supabase, quote)

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      site_id: siteId,
      assigned_to: actorId,
      created_by: actorId,
      quote_request_id: quote.id,
      title: `Solar Installation — ${quote.quote_number ?? quote.customer_name}`,
      description: [
        quote.customer_name,
        quote.address,
        quote.quote_number,
        quote.total_amount != null ? `Total R ${(quote.total_amount / 100).toLocaleString('en-ZA')}` : null,
        quote.deposit_amount != null ? `Deposit R ${(quote.deposit_amount / 100).toLocaleString('en-ZA')}` : null,
      ].filter(Boolean).join(' · '),
      stage: 'deposit_pending',
      priority: 'medium',
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return { ok: false, error: jobError?.message ?? 'Could not create job', status: 400 }
  }

  const { error: tasksError } = await supabase.from('job_tasks').insert(
    INSTALL_CHECKLIST.map((description) => ({ job_id: job.id, description })),
  )
  if (tasksError) {
    await supabase.from('jobs').delete().eq('id', job.id)
    return { ok: false, error: `Checklist not created: ${tasksError.message}`, status: 500 }
  }

  // Design lock: a frozen bom_snapshot beats the live quote — procurement
  // buys exactly what was locked, even if the quote was recalculated since.
  const bomSource = quote.bom_snapshot
    ? JSON.stringify(quote.bom_snapshot)
    : quote.generated_quote
  const bom = extractBom(bomSource, quote.accepted_tier)
  if (bom.length) {
    const { error: materialsError } = await supabase.from('job_materials').insert(
      bom.map((line, index) => ({
        job_id: job.id,
        section: line.section ?? '',
        sku: line.sku ?? '',
        description: line.description ?? '',
        qty_planned: line.quantity ?? 0,
        unit_cost_cents: Math.round((line.unitCostRands ?? 0) * 100),
        unit_sell_cents: Math.round((line.unitSellRands ?? 0) * 100),
        sort_order: index,
      })),
    )
    if (materialsError) {
      await supabase.from('jobs').delete().eq('id', job.id)
      return { ok: false, error: `Materials not seeded: ${materialsError.message}`, status: 500 }
    }
  }

  return {
    ok: true,
    jobId: job.id,
    created: true,
    materialsSeeded: bom.length,
    warnings: [
      ...(bom.length === 0 ? ['No supplier BOM found in saved quote — recalculate and save, then re-link.'] : []),
      ...(siteId ? [] : ['No customer linked to this quote — link a customer so the job appears in their portal.']),
    ],
  }
}
