import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

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

// Pull the supplier BOM out of the saved quote JSON. Multi-option quotes use
// the recommended tier (the one customers accept unless told otherwise).
function extractBom(generatedQuote: string): BomLine[] {
  try {
    const data = JSON.parse(generatedQuote)
    if (data?.type === 'multi-option' && Array.isArray(data.options)) {
      const option =
        data.options.find((o: { tier?: string }) => o.tier === 'recommended') ?? data.options[0]
      return Array.isArray(option?.supplierBom) ? option.supplierBom : []
    }
    return Array.isArray(data?.supplierBom) ? data.supplierBom : []
  } catch {
    return []
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden — only managers can create jobs', { status: 403 })
  }

  const body = await req.json()
  const quoteRequestId = String(body.quoteRequestId ?? '')
  if (!quoteRequestId) return new Response('Missing quoteRequestId', { status: 400 })

  const { data: quote, error: quoteError } = await supabase
    .from('quote_requests').select('*').eq('id', quoteRequestId).single()
  if (quoteError || !quote) {
    return new Response(quoteError?.message ?? 'Quote request not found', { status: 404 })
  }
  if (!quote.generated_quote) {
    return new Response('Quote has no saved calculation — calculate and save it first', { status: 400 })
  }

  // Idempotent: one job per quote
  const { data: existing } = await supabase
    .from('jobs').select('id').eq('quote_request_id', quoteRequestId).maybeSingle()
  if (existing) {
    return NextResponse.json({ jobId: existing.id, created: false })
  }

  // Link to a customer site when the quote email matches a registered customer
  let siteId: string | null = null
  if (quote.customer_email) {
    const { data: customer } = await supabase
      .from('user_profiles')
      .select('id')
      .ilike('email', quote.customer_email)
      .eq('role', 'customer')
      .maybeSingle()

    if (customer) {
      const { data: site } = await supabase
        .from('sites')
        .select('id')
        .eq('customer_id', customer.id)
        .ilike('address', quote.address ?? '')
        .maybeSingle()

      if (site) {
        siteId = site.id
      } else {
        const { data: newSite } = await supabase
          .from('sites')
          .insert({
            customer_id: customer.id,
            name: `${quote.customer_name} — Site ${quote.site_number ?? 1}`,
            address: quote.address ?? '',
            system_type: 'Solar PV',
            status: 'pending',
          })
          .select('id')
          .single()
        siteId = newSite?.id ?? null
      }
    }
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      site_id: siteId,
      assigned_to: user.id,
      created_by: user.id,
      quote_request_id: quoteRequestId,
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
    return new Response(jobError?.message ?? 'Could not create job', { status: 400 })
  }

  const { error: tasksError } = await supabase.from('job_tasks').insert(
    INSTALL_CHECKLIST.map((description) => ({ job_id: job.id, description })),
  )

  const bom = extractBom(quote.generated_quote)
  const { error: materialsError } = bom.length
    ? await supabase.from('job_materials').insert(
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
    : { error: null }

  return NextResponse.json({
    jobId: job.id,
    created: true,
    materialsSeeded: bom.length,
    warnings: [
      ...(tasksError ? [`Checklist not created: ${tasksError.message}`] : []),
      ...(materialsError ? [`Materials not seeded: ${materialsError.message}`] : []),
      ...(bom.length === 0 ? ['No supplier BOM found in saved quote — recalculate and save, then re-link.'] : []),
      ...(siteId ? [] : ['No registered customer account matched this quote — job is not yet visible to the customer portal.']),
    ],
  })
}
