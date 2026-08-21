// ─────────────────────────────────────────────────────────────────────────────
// The one place an invoice row becomes a customer document.
//
// Split out of the issue route the moment a PREVIEW existed, for the same
// reason lib/quotes/build-quote-document.ts is shared between the generate
// route and the staff preview: a preview that built its own document would
// eventually lie, and the whole point of previewing is that it doesn't.
//
// A draft has no frozen document_html yet, so its preview is rendered from the
// live rows here. Issuing renders through this same function and freezes the
// result — so what was checked is what goes out, byte for byte.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Invoice, InvoiceLine } from '@/types/database'
import { workTypeFor } from '@/lib/quotes/work-types'
import { loadInvoiceCompany, type InvoiceCompany } from './query'
import { renderInvoice, type InvoiceDocumentData } from './render-invoice'

/** What the document needs from around the invoice — the job and the quote. */
export interface InvoiceSurroundings {
  quoteNumber: string | null
  workLabel: string | null
  jobTitle: string | null
}

export async function loadInvoiceSurroundings(
  supabase: SupabaseClient,
  invoice: Pick<Invoice, 'job_id' | 'quote_request_id'>,
): Promise<InvoiceSurroundings> {
  let workLabel: string | null = null
  let jobTitle: string | null = null
  let quoteNumber: string | null = null

  const [job, quote] = await Promise.all([
    invoice.job_id
      ? supabase.from('jobs').select('title, work_type').eq('id', invoice.job_id).maybeSingle()
      : Promise.resolve({ data: null }),
    invoice.quote_request_id
      ? supabase
          .from('quote_requests')
          .select('quote_number')
          .eq('id', invoice.quote_request_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (job.data) {
    jobTitle = (job.data as { title: string | null }).title ?? null
    const code = (job.data as { work_type: string | null }).work_type
    workLabel = code ? (workTypeFor(code)?.label ?? null) : null
  }
  if (quote.data) quoteNumber = (quote.data as { quote_number: string | null }).quote_number ?? null

  return { quoteNumber, workLabel, jobTitle }
}

/** Invoice + lines + company + surroundings → exactly what renderInvoice() takes. */
export function invoiceDocumentData(
  invoice: Invoice,
  lines: InvoiceLine[],
  company: InvoiceCompany,
  around: InvoiceSurroundings,
): InvoiceDocumentData {
  return {
    // A draft has no number yet. It still has to LOOK like an invoice, so the
    // preview says DRAFT in the place the number will occupy rather than
    // leaving a hole the eye reads as a rendering fault — and `draft` tells the
    // renderer not to print that word anywhere a reference is expected.
    invoiceNumber: invoice.invoice_number ?? 'DRAFT',
    draft: invoice.status === 'draft',
    kind: invoice.kind,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    billToName: invoice.bill_to_name,
    billToEmail: invoice.bill_to_email,
    billToPhone: invoice.bill_to_phone,
    billToAddress: invoice.bill_to_address,
    siteAddress: invoice.site_address,
    quoteNumber: around.quoteNumber,
    workLabel: around.workLabel,
    lines: [...lines]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({
        description: l.description,
        detail: l.detail,
        qty: Number(l.qty),
        unit: l.unit,
        unitPriceCents: Number(l.unit_price_cents),
        amountCents: Number(l.amount_cents),
      })),
    totalCents: invoice.total_cents,
    amountPaidCents: invoice.amount_paid_cents,
    notes: invoice.notes,
    terms: invoice.terms ?? company.invoiceTerms,
    banking: company.banking,
    company: {
      name: company.name,
      phone: company.phone,
      email: company.email,
      site: company.site,
    },
  }
}

/**
 * The document for this invoice, exactly as the customer will read it.
 *
 * An ISSUED invoice serves its frozen HTML — what was sent is what is served,
 * however far the template has moved since. A draft is rendered live, which is
 * the preview.
 */
export async function invoiceDocumentHtml(
  supabase: SupabaseClient,
  invoice: Invoice,
  lines: InvoiceLine[],
): Promise<string> {
  if (invoice.status !== 'draft' && invoice.document_html) return invoice.document_html
  const [company, around] = await Promise.all([
    loadInvoiceCompany(supabase),
    loadInvoiceSurroundings(supabase, invoice),
  ])
  return renderInvoice(invoiceDocumentData(invoice, lines, company, around))
}
