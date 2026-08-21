import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randsToCents, issueBlocker, type InvoiceLineDraft } from '@/lib/invoices/invoice'
import { loadInvoiceCompany, loadInvoiceWithLines } from '@/lib/invoices/query'
import { renderInvoice } from '@/lib/invoices/render-invoice'
import { sendInvoiceEmail, sendInvoiceReceiptEmail } from '@/lib/email/invoices'
import { getBaseUrl } from '@/lib/quotes/server'
import { workTypeFor } from '@/lib/quotes/work-types'
import type { Invoice, InvoiceLine } from '@/types/database'

export const runtime = 'nodejs'

/**
 * The whole life of one invoice after it is drafted.
 *
 *   issue   consume a number, freeze the document, and send it
 *   payment record money received (partial or in full)
 *   void    withdraw it — the only way to correct one that has gone out
 *
 * The database enforces the freeze (migration 133's guard triggers), not this
 * route. What lives here is the ORDER of operations, and one rule worth
 * spelling out: the number is consumed LAST, after the document renders. A
 * render that throws must not burn a number, because a gap in an invoice
 * sequence is a question somebody has to answer at year end.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden — only managers can change an invoice', { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const loaded = await loadInvoiceWithLines(supabase, id)
  if (!loaded) return new Response('Invoice not found', { status: 404 })
  const { invoice, lines } = loaded

  switch (action) {
    case 'issue':
      return issue(supabase, invoice, lines, user.id, {
        method: ['email', 'whatsapp', 'manual'].includes(String(body.method)) ? String(body.method) : 'manual',
      })

    case 'payment': {
      if (invoice.status === 'draft') {
        return new Response('Issue the invoice before recording a payment against it', { status: 400 })
      }
      if (invoice.status === 'void') {
        return new Response('That invoice was voided', { status: 400 })
      }
      // 'full' settles whatever is left, which is the button people actually
      // press. A typed amount ADDS to what has already been received.
      const remaining = Math.max(0, invoice.total_cents - invoice.amount_paid_cents)
      const add = body.full ? remaining : randsToCents(body.amountRands)
      if (add <= 0) return new Response('Enter an amount received', { status: 400 })

      const paid = Math.min(invoice.total_cents, invoice.amount_paid_cents + add)
      const { error } = await supabase
        .from('invoices')
        // The trigger decides sent-vs-paid off the balance, so this never has
        // to guess: send the money, let the status follow.
        .update({ amount_paid_cents: paid, status: 'sent' })
        .eq('id', id)
      if (error) return new Response(error.message, { status: 400 })

      let emailSent = false
      if (paid >= invoice.total_cents && body.notify !== false) {
        try {
          const result = await sendInvoiceReceiptEmail(
            { ...invoice, amount_paid_cents: paid },
            getBaseUrl(),
          )
          emailSent = result.sent
        } catch (err) {
          console.error('[invoices] receipt email failed', err)
        }
      }
      return NextResponse.json({ ok: true, paidCents: paid, settled: paid >= invoice.total_cents, emailSent })
    }

    case 'void': {
      if (invoice.status === 'void') return NextResponse.json({ ok: true, alreadyVoid: true })
      const reason = String(body.reason ?? '').trim()
      if (!reason) return new Response('Say why it is being voided — it stays on the record', { status: 400 })
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'void',
          voided_at: new Date().toISOString(),
          voided_by: user.id,
          void_reason: reason,
        })
        .eq('id', id)
      if (error) return new Response(error.message, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    case 'resend': {
      if (invoice.status === 'draft') return new Response('Issue it first', { status: 400 })
      if (invoice.status === 'void') return new Response('That invoice was voided', { status: 400 })
      const company = await loadInvoiceCompany(supabase)
      const result = await sendInvoiceEmail(invoice, getBaseUrl(), { banking: company.banking })
      if (!result.sent) return new Response(result.error ?? 'Email not sent', { status: 400 })
      await supabase
        .from('invoices')
        .update({ sent_at: new Date().toISOString(), sent_method: 'email', sent_by: user.id })
        .eq('id', id)
      return NextResponse.json({ ok: true, emailSent: true })
    }

    default:
      return new Response(`Unknown action "${action}"`, { status: 400 })
  }
}

/** A draft is disposable. Anything issued is a record and is voided, not deleted. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data: invoice } = await supabase
    .from('invoices').select('id, status').eq('id', id).maybeSingle()
  if (!invoice) return new Response('Invoice not found', { status: 404 })
  if (invoice.status !== 'draft') {
    return new Response('An issued invoice is voided, not deleted', { status: 400 })
  }

  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 400 })
  return NextResponse.json({ ok: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any

async function issue(
  supabase: Client,
  invoice: Invoice,
  lines: InvoiceLine[],
  userId: string,
  opts: { method: string },
) {
  if (invoice.status !== 'draft') {
    return new Response('That invoice has already been issued', { status: 400 })
  }

  const drafts: InvoiceLineDraft[] = lines.map((l) => ({
    description: l.description,
    detail: l.detail,
    qty: Number(l.qty),
    unit: l.unit,
    unitPriceCents: Number(l.unit_price_cents),
    amountCents: Number(l.amount_cents),
    source: l.source,
    sourceRef: l.source_ref,
  }))
  const blocker = issueBlocker(drafts, { name: invoice.bill_to_name })
  if (blocker) return new Response(blocker, { status: 400 })

  if (opts.method === 'email' && !invoice.bill_to_email) {
    return new Response('This invoice has no email address to send to', { status: 400 })
  }

  const company = await loadInvoiceCompany(supabase)

  // Work label for the document, from the job behind the invoice.
  let workLabel: string | null = null
  let jobTitle: string | null = null
  if (invoice.job_id) {
    const { data: job } = await supabase
      .from('jobs').select('title, work_type').eq('id', invoice.job_id).maybeSingle()
    jobTitle = job?.title ?? null
    workLabel = job?.work_type ? (workTypeFor(job.work_type)?.label ?? null) : null
  }

  let quoteNumber: string | null = null
  if (invoice.quote_request_id) {
    const { data: quote } = await supabase
      .from('quote_requests').select('quote_number').eq('id', invoice.quote_request_id).maybeSingle()
    quoteNumber = quote?.quote_number ?? null
  }

  // Number LAST of the read steps: everything above can fail without consuming
  // one. From here on a failure leaves a gap, so nothing else is allowed to
  // fail between the number and the write.
  const { data: number, error: numberError } = await supabase.rpc('next_invoice_number')
  if (numberError || !number) {
    return new Response(numberError?.message ?? 'Could not allocate an invoice number', { status: 500 })
  }

  const documentHtml = renderInvoice({
    invoiceNumber: number as string,
    kind: invoice.kind,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    billToName: invoice.bill_to_name,
    billToEmail: invoice.bill_to_email,
    billToPhone: invoice.bill_to_phone,
    billToAddress: invoice.bill_to_address,
    siteAddress: invoice.site_address,
    quoteNumber,
    workLabel,
    lines: drafts.map((l) => ({
      description: l.description,
      detail: l.detail,
      qty: l.qty,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      amountCents: l.amountCents,
    })),
    totalCents: invoice.total_cents,
    amountPaidCents: invoice.amount_paid_cents,
    notes: invoice.notes,
    terms: invoice.terms ?? company.invoiceTerms,
    banking: company.banking,
    company: { name: company.name, phone: company.phone, email: company.email, site: company.site },
  })

  const { error } = await supabase
    .from('invoices')
    .update({
      invoice_number: number,
      document_html: documentHtml,
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_method: opts.method,
      sent_by: userId,
    })
    .eq('id', invoice.id)
  if (error) return new Response(error.message, { status: 400 })

  let emailSent = false
  let emailError: string | null = null
  if (opts.method === 'email') {
    try {
      const result = await sendInvoiceEmail(
        { ...invoice, invoice_number: number as string },
        getBaseUrl(),
        { banking: company.banking, jobTitle },
      )
      emailSent = result.sent
      emailError = result.error ?? null
    } catch (err) {
      // The invoice IS issued — the number is spent and the document is frozen.
      // A failed email is a resend, not a rollback.
      console.error('[invoices] send failed', err)
      emailError = err instanceof Error ? err.message : 'Email send failed'
    }
  }

  return NextResponse.json({ ok: true, invoiceNumber: number, emailSent, emailError })
}
