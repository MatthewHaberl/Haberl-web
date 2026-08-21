import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  dueDateFrom,
  jobBilling,
  linesForBasis,
  linesTotalCents,
  randsToCents,
  type InvoiceBasis,
  type InvoiceKind,
  type InvoiceLineDraft,
  type MaterialPick,
} from '@/lib/invoices/invoice'
import {
  loadInvoiceCompany,
  loadJobInvoiceContext,
  loadJobInvoiceSummaries,
} from '@/lib/invoices/query'
import { workTypeFor } from '@/lib/quotes/work-types'

export const runtime = 'nodejs'

/**
 * Raise an invoice against a job.
 *
 * Always creates a DRAFT — no number is consumed and nothing is frozen until
 * somebody issues it. That separation is the point: a draft can be corrected,
 * an issued invoice cannot, and a number burnt on a mistake is a gap in the
 * sequence an accountant will ask about.
 *
 * The lines come from one of five bases (see linesForBasis) plus anything the
 * caller adds by hand. Everything the customer will read is snapshotted onto
 * the invoice here, so a customer who moves house next year does not silently
 * rewrite what was billed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden — only managers can invoice', { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const basis = String(body.basis ?? 'amount') as InvoiceBasis
  const kind = (['deposit', 'progress', 'final'].includes(String(body.kind))
    ? String(body.kind)
    : basis === 'deposit'
      ? 'deposit'
      : basis === 'final'
        ? 'final'
        : 'progress') as InvoiceKind

  const ctx = await loadJobInvoiceContext(supabase, jobId)
  if (!ctx) return new Response('Job not found', { status: 404 })

  const company = await loadInvoiceCompany(supabase)
  const summaries = await loadJobInvoiceSummaries(supabase, jobId)
  const billing = jobBilling({
    contractCents: ctx.contractCents,
    invoices: summaries,
    quoteDepositCents: ctx.quoteDepositCents,
    depositConfirmed: ctx.depositConfirmed,
  })

  // 'materials' bills lines off the job's own BOM. Read the picked rows back
  // from the database rather than trusting the prices the browser posted —
  // a sell price is not the client's to decide.
  let materials: MaterialPick[] = []
  const materialPicks = Array.isArray(body.materials) ? body.materials : []
  if (basis === 'materials' && materialPicks.length > 0) {
    const ids = materialPicks.map((m: { id?: string }) => String(m?.id ?? '')).filter(Boolean)
    const qtyById = new Map<string, number>(
      materialPicks
        .filter((m: { id?: string }) => !!m?.id)
        .map((m: { id: string; qty?: number }) => [String(m.id), Number(m.qty) || 0]),
    )
    const { data: rows } = await supabase
      .from('job_materials')
      .select('id, section, description, qty_planned, unit_sell_cents')
      .eq('job_id', jobId)
      .in('id', ids)
    materials = (rows ?? []).map((r) => ({
      id: r.id as string,
      section: (r.section as string) ?? '',
      description: (r.description as string) ?? '',
      // Never bill more of a line than the job plans to use.
      qty: Math.min(qtyById.get(r.id as string) ?? 0, Number(r.qty_planned) || 0),
      unitSellCents: Number(r.unit_sell_cents) || 0,
    }))
  }

  const workLabel = workTypeFor(ctx.workType)?.label ?? 'Electrical work'
  const generated = linesForBasis(
    basis,
    {
      billing,
      quoteNumber: ctx.quoteNumber,
      quoteDepositCents: ctx.quoteDepositCents,
      workLabel,
    },
    {
      percent: Number(body.percent) || 0,
      amountCents: randsToCents(body.amountRands),
      description: typeof body.description === 'string' ? body.description : undefined,
      materials,
    },
  )

  // Extra lines typed by hand. A negative amount is a credit — money back, a
  // goodwill discount — and is labelled as such so the document can show it in
  // the positive colour rather than as a mistake.
  const extra: InvoiceLineDraft[] = (Array.isArray(body.extraLines) ? body.extraLines : [])
    .map((l: Record<string, unknown>) => {
      const qty = Number(l.qty) || 1
      const unitPriceCents = randsToCents(l.unitPriceRands as string)
      const amountCents =
        l.amountRands != null ? randsToCents(l.amountRands as string) : Math.round(qty * unitPriceCents)
      return {
        description: String(l.description ?? '').trim(),
        detail: l.detail ? String(l.detail) : null,
        qty,
        unit: l.unit ? String(l.unit) : null,
        unitPriceCents,
        amountCents,
        source: amountCents < 0 ? ('credit' as const) : ('manual' as const),
        sourceRef: null,
      }
    })
    .filter((l: InvoiceLineDraft) => l.description.length > 0)

  const lines = [...generated, ...extra]
  if (lines.length === 0) return new Response('An invoice needs at least one line', { status: 400 })
  if (!ctx.billToName.trim()) {
    return new Response(
      'This job has no customer on it — link a customer to the quote or the site before invoicing',
      { status: 400 },
    )
  }

  const issueDate = typeof body.issueDate === 'string' && body.issueDate
    ? body.issueDate
    : new Date().toISOString().slice(0, 10)

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      job_id: jobId,
      quote_request_id: ctx.quoteRequestId,
      customer_id: ctx.customerId,
      bill_to_name: ctx.billToName,
      bill_to_email: ctx.billToEmail,
      bill_to_phone: ctx.billToPhone,
      bill_to_address: ctx.billToAddress,
      site_address: ctx.siteAddress,
      kind,
      status: 'draft',
      issue_date: issueDate,
      due_date: dueDateFrom(issueDate, company.invoiceDueDays),
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
      terms: company.invoiceTerms,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !invoice) {
    return new Response(error?.message ?? 'Could not create the invoice', { status: 400 })
  }

  const { error: linesError } = await supabase.from('invoice_lines').insert(
    lines.map((l, index) => ({
      invoice_id: invoice.id,
      description: l.description,
      detail: l.detail ?? null,
      qty: l.qty,
      unit: l.unit ?? null,
      unit_price_cents: l.unitPriceCents,
      amount_cents: l.amountCents,
      source: l.source,
      source_ref: l.sourceRef ?? null,
      sort_order: index,
    })),
  )
  if (linesError) {
    // A header with no lines is an invoice for nothing. Roll it back rather
    // than leave a R0 draft on the job for somebody to puzzle over.
    await supabase.from('invoices').delete().eq('id', invoice.id)
    return new Response(`Invoice lines not saved: ${linesError.message}`, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    invoiceId: invoice.id,
    totalCents: linesTotalCents(lines),
  })
}
