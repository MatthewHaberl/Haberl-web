import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCents, isOverdue, KIND_LABEL } from '@/lib/invoices/invoice'
import type { Invoice } from '@/types/database'
import { PublicShell } from '@/app/q/[token]/PublicShell'
import { QuoteFrame } from '@/app/q/[token]/QuoteFrame'
import { PrintQuoteButton } from '@/app/q/[token]/PrintQuoteButton'

export const metadata: Metadata = {
  title: 'Your Invoice — Haberl Electrical & Solar',
  robots: { index: false, follow: false },
}

/**
 * The customer's copy of an invoice. No login: the unguessable share_token is
 * the only credential, exactly as it is for a quote at /q/<token>.
 *
 * Only what was ISSUED is served. A draft is a working document and a voided
 * invoice has been withdrawn — both 404 rather than showing the customer a
 * figure that was never claimed or no longer stands.
 *
 * The document itself is the HTML frozen on the row at issue time, so what is
 * on this page is what was sent, however far the template has moved since.
 */
export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!/^[a-f0-9]{16,64}$/i.test(token)) notFound()

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('invoices')
    .select('*')
    .eq('share_token', token)
    .maybeSingle()

  if (!data) notFound()
  const invoice = data as Invoice
  if (invoice.status === 'draft' || invoice.status === 'void' || !invoice.document_html) notFound()

  const due = Math.max(0, invoice.total_cents - invoice.amount_paid_cents)
  const settled = invoice.status === 'paid' || due === 0
  const overdue = isOverdue({
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    kind: invoice.kind,
    status: invoice.status,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    total_cents: invoice.total_cents,
    amount_paid_cents: invoice.amount_paid_cents,
  })

  const dueDateText = invoice.due_date
    ? new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'on receipt'

  return (
    <PublicShell quoteNumber={invoice.invoice_number} solar={false}>
      <div>
        <h1 className="text-xl font-bold text-primary">
          {KIND_LABEL[invoice.kind]} invoice for {invoice.bill_to_name}
        </h1>
        {invoice.site_address && (
          <p className="text-sm text-muted-foreground mt-0.5">{invoice.site_address}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice total</p>
          <p className="text-lg font-bold text-primary mt-1">{formatCents(invoice.total_cents)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {settled ? 'Balance' : 'Amount due'}
          </p>
          <p className="text-lg font-bold text-primary mt-1">{formatCents(due)}</p>
        </div>
      </div>

      {settled ? (
        <div className="rounded-lg border border-green-300 dark:border-green-800/60 bg-green-50 dark:bg-green-950/40 px-4 py-3 text-sm text-green-800 dark:text-green-300">
          <strong>Paid in full</strong> — thank you. Nothing further is owing on this invoice.
        </div>
      ) : overdue ? (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          This invoice was due on <strong>{dueDateText}</strong>. If it has already been paid, please
          send us the proof of payment and we&apos;ll clear it — otherwise the banking details are on
          the invoice below.
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Payment due <strong className="text-foreground">{dueDateText}</strong>. Please use{' '}
          <strong className="text-foreground">{invoice.invoice_number}</strong> as your reference.
        </p>
      )}

      {invoice.amount_paid_cents > 0 && !settled && (
        <p className="text-xs text-muted-foreground">
          {formatCents(invoice.amount_paid_cents)} received so far, thank you.
        </p>
      )}

      <div className="flex justify-end">
        <PrintQuoteButton html={invoice.document_html} />
      </div>
      <QuoteFrame html={invoice.document_html} title="Invoice" />
    </PublicShell>
  )
}
