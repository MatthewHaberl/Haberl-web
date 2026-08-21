// ─────────────────────────────────────────────────────────────────────────────
// Invoices — the Supabase half. Shaping only; the arithmetic lives in
// ./invoice and the document in ./render-invoice.
//
// Client-agnostic like lib/crews/query.ts: it takes whichever SupabaseClient
// the caller already has, so the job page (RLS-scoped) and the API routes
// (service role, where they need to reach a customer's own record) read an
// invoice through exactly the same query.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Invoice, InvoiceLine } from '@/types/database'
import type { InvoiceSummaryRow } from './invoice'

export const INVOICE_SUMMARY_SELECT =
  'id, invoice_number, kind, status, issue_date, due_date, total_cents, amount_paid_cents'

export const INVOICE_FULL_SELECT = '*'

/** Every invoice raised against one job, newest first. */
export async function loadJobInvoices(
  supabase: SupabaseClient,
  jobId: string,
): Promise<Invoice[]> {
  const { data } = await supabase
    .from('invoices')
    .select(INVOICE_FULL_SELECT)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
  return (data ?? []) as Invoice[]
}

/** The summary slice jobBilling() needs — cheaper than the full rows. */
export async function loadJobInvoiceSummaries(
  supabase: SupabaseClient,
  jobId: string,
): Promise<InvoiceSummaryRow[]> {
  const { data } = await supabase
    .from('invoices')
    .select(INVOICE_SUMMARY_SELECT)
    .eq('job_id', jobId)
    .order('issue_date', { ascending: false })
  return (data ?? []) as unknown as InvoiceSummaryRow[]
}

export async function loadInvoiceLines(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<InvoiceLine[]> {
  const { data } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order')
  return (data ?? []) as InvoiceLine[]
}

/** An invoice and its lines in one call — what every document render needs. */
export async function loadInvoiceWithLines(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{ invoice: Invoice; lines: InvoiceLine[] } | null> {
  const { data } = await supabase
    .from('invoices')
    .select(INVOICE_FULL_SELECT)
    .eq('id', invoiceId)
    .maybeSingle()
  if (!data) return null
  return { invoice: data as Invoice, lines: await loadInvoiceLines(supabase, invoiceId) }
}

/**
 * Everything an invoice needs to know about the job it is billing.
 *
 * The customer details are read here and SNAPSHOTTED onto the invoice when it
 * is created — see the bill_to_* columns. The quote is the address of record:
 * it is what the customer signed, and it carries a name and address even when
 * no CRM customer row was ever linked.
 */
export interface JobInvoiceContext {
  jobId: string
  jobTitle: string
  workType: string
  quoteRequestId: string | null
  quoteNumber: string | null
  customerId: string | null
  billToName: string
  billToEmail: string | null
  billToPhone: string | null
  billToAddress: string | null
  siteAddress: string | null
  /** quote_requests.total_amount — the contract, in cents. */
  contractCents: number | null
  /** quote_requests.deposit_amount, in cents. */
  quoteDepositCents: number | null
  /** A deposit proof a manager has already accepted on this job. */
  depositConfirmed: boolean
}

/** The quote columns an invoice bills against. */
interface QuoteBillingRow {
  id: string
  quote_number: string | null
  customer_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  total_amount: number | null
  deposit_amount: number | null
}

/** The CRM fallback when a job has no quote behind it. */
interface CustomerBillingRow {
  id: string
  full_name: string
  email: string | null
  phone: string | null
}

export async function loadJobInvoiceContext(
  supabase: SupabaseClient,
  jobId: string,
): Promise<JobInvoiceContext | null> {
  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, work_type, quote_request_id, deposit_confirmed_at, site:sites(name, address, customer_id)')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return null

  const site = job.site as unknown as { name: string; address: string; customer_id: string | null } | null

  let quote: QuoteBillingRow | null = null
  if (job.quote_request_id) {
    const { data } = await supabase
      .from('quote_requests')
      .select('id, quote_number, customer_id, customer_name, customer_email, customer_phone, address, total_amount, deposit_amount')
      .eq('id', job.quote_request_id)
      .maybeSingle()
    quote = (data as QuoteBillingRow | null) ?? null
  }

  // No quote behind the job (a manual job): fall back to the CRM customer the
  // site belongs to, so a manual job can still be invoiced. Without either,
  // bill_to_name is blank and issueBlocker() refuses — which is the honest
  // answer, not an invoice addressed to nobody.
  let customer: CustomerBillingRow | null = null
  const customerId = quote?.customer_id ?? site?.customer_id ?? null
  if (!quote && customerId) {
    const { data } = await supabase
      .from('customers')
      .select('id, full_name, email, phone')
      .eq('id', customerId)
      .maybeSingle()
    customer = (data as CustomerBillingRow | null) ?? null
  }

  return {
    jobId: job.id as string,
    jobTitle: (job.title as string) ?? '',
    workType: (job.work_type as string) ?? 'solar',
    quoteRequestId: (job.quote_request_id as string | null) ?? null,
    quoteNumber: quote?.quote_number ?? null,
    customerId,
    billToName: quote?.customer_name ?? customer?.full_name ?? '',
    billToEmail: quote?.customer_email ?? customer?.email ?? null,
    billToPhone: quote?.customer_phone ?? customer?.phone ?? null,
    billToAddress: quote?.address ?? site?.address ?? null,
    siteAddress: site?.address ?? quote?.address ?? null,
    contractCents: quote?.total_amount ?? null,
    quoteDepositCents: quote?.deposit_amount ?? null,
    depositConfirmed: !!job.deposit_confirmed_at,
  }
}

/** The company block every invoice document prints. */
export interface InvoiceCompany {
  name: string
  phone: string
  email: string
  site: string
  banking: {
    bank?: string
    account_name?: string
    account_number?: string
    branch_code?: string
    account_type?: string
  } | null
  invoiceDueDays: number
  invoiceTerms: string | null
}

const COMPANY_FALLBACK = {
  name: 'Haberl Electrical & Solar',
  phone: '+27 61 519 3016',
  email: 'matthew@haberl.co.za',
  site: 'haberl.co.za',
}

export async function loadInvoiceCompany(supabase: SupabaseClient): Promise<InvoiceCompany> {
  const { data } = await supabase
    .from('company_settings')
    .select('contact_email, contact_phone, banking, invoice_due_days, invoice_terms')
    .eq('id', true)
    .maybeSingle()

  return {
    // The TRADING name, not company_settings.company_name — which is the short
    // internal label ("Haberl") and reads as a truncation on a document. The
    // quote hardcodes the same string, and the two have to look like one
    // business. Contact details do come from settings.
    name: COMPANY_FALLBACK.name,
    phone: data?.contact_phone || COMPANY_FALLBACK.phone,
    email: data?.contact_email || COMPANY_FALLBACK.email,
    site: COMPANY_FALLBACK.site,
    banking: (data?.banking as InvoiceCompany['banking']) ?? null,
    invoiceDueDays: Number(data?.invoice_due_days ?? 0),
    invoiceTerms: (data?.invoice_terms as string | null) ?? null,
  }
}
