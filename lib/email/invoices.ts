// ─────────────────────────────────────────────────────────────────────────────
// Invoice emails. Same Resend transport and brand wrapper as the quote emails
// in ./quotes — an invoice should arrive looking like it came from the same
// business as the quote it follows.
// ─────────────────────────────────────────────────────────────────────────────

import { emailButton, emailLayout, formatCents, sendEmail, type SendResult } from './send'
import { escapeHtml } from '@/lib/utils'
import { KIND_LABEL, type InvoiceKind } from '@/lib/invoices/invoice'
import type { BankingDetails } from './quotes'

/** The slice of an invoice row these emails need. */
export interface InvoiceEmailFields {
  invoice_number: string | null
  bill_to_name: string
  bill_to_email: string | null
  kind: InvoiceKind
  total_cents: number
  amount_paid_cents: number
  due_date: string | null
  share_token: string
}

const invoiceLink = (baseUrl: string, token: string) => `${baseUrl.replace(/\/$/, '')}/i/${token}`

const dateZA = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })

function bankingHtml(banking: BankingDetails | null, reference: string, amountCents: number): string {
  if (!banking || !Object.values(banking).some(Boolean)) return ''
  const row = (label: string, value: string | undefined) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;">${label}</td><td style="padding:4px 0;font-size:14px;font-weight:bold;">${escapeHtml(value)}</td></tr>`
      : ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:16px 0;width:100%;">
    <tr><td style="padding:12px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        ${row('Bank', banking.bank)}
        ${row('Account name', banking.account_name)}
        ${row('Account number', banking.account_number)}
        ${row('Branch code', banking.branch_code)}
        ${row('Amount', formatCents(amountCents))}
        ${row('Reference', reference)}
      </table>
    </td></tr>
  </table>`
}

/**
 * The invoice itself, as a link rather than an attachment.
 *
 * A link, not a PDF, for the same reason a quote goes out as one: the customer
 * can open it on a phone without downloading anything, and the page it lands on
 * is the frozen document that was issued — not a copy that can drift.
 */
export async function sendInvoiceEmail(
  invoice: InvoiceEmailFields,
  baseUrl: string,
  opts: { banking?: BankingDetails | null; jobTitle?: string | null } = {},
): Promise<SendResult> {
  if (!invoice.bill_to_email) return { sent: false, error: 'No customer email on this invoice' }

  const ref = invoice.invoice_number ?? 'your invoice'
  const due = Math.max(0, invoice.total_cents - invoice.amount_paid_cents)
  const link = invoiceLink(baseUrl, invoice.share_token)
  const kindWord = KIND_LABEL[invoice.kind].toLowerCase()
  const forWork = opts.jobTitle ? ` for ${escapeHtml(opts.jobTitle)}` : ''

  const dueLine = invoice.due_date
    ? `<p style="font-size:13px;color:#6b7280;">Payment is due by <strong>${dateZA(invoice.due_date)}</strong>.</p>`
    : `<p style="font-size:13px;color:#6b7280;">Payment is due on receipt.</p>`

  const html = emailLayout(
    `${ref} — ${formatCents(due)} due`,
    `<p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(invoice.bill_to_name)},</p>
     <p style="font-size:15px;line-height:1.6;">Here is your ${escapeHtml(kindWord)} invoice${forWork}. The amount due is <strong>${formatCents(due)}</strong>.</p>
     ${emailButton(link, 'View your invoice')}
     ${bankingHtml(opts.banking ?? null, invoice.invoice_number ?? '', due)}
     ${dueLine}
     <p style="font-size:13px;color:#6b7280;">Please use <strong>${escapeHtml(invoice.invoice_number ?? '')}</strong> as your payment reference. Any questions, just reply to this email.</p>`,
  )

  const text = `Hi ${invoice.bill_to_name},

Here is your ${kindWord} invoice ${ref}${opts.jobTitle ? ` for ${opts.jobTitle}` : ''}.
Amount due: ${formatCents(due)}${invoice.due_date ? `, due by ${dateZA(invoice.due_date)}` : ', due on receipt'}.

View it here: ${link}

Please use ${invoice.invoice_number ?? ref} as your payment reference.

Haberl Electrical & Solar`

  return sendEmail({
    to: [invoice.bill_to_email],
    subject: `Invoice ${ref} — ${formatCents(due)} due`,
    html,
    text,
    replyTo: 'info@haberl.co.za',
  })
}

/** Sent when an invoice is settled — the closing half of the money conversation. */
export async function sendInvoiceReceiptEmail(
  invoice: InvoiceEmailFields,
  baseUrl: string,
): Promise<SendResult> {
  if (!invoice.bill_to_email) return { sent: false, error: 'No customer email on this invoice' }
  const ref = invoice.invoice_number ?? 'your invoice'
  const link = invoiceLink(baseUrl, invoice.share_token)

  const html = emailLayout(
    `Payment received — ${ref}`,
    `<p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(invoice.bill_to_name)},</p>
     <p style="font-size:15px;line-height:1.6;">Thank you — we have received <strong>${formatCents(invoice.amount_paid_cents)}</strong> against ${escapeHtml(ref)}. It is settled in full.</p>
     ${emailButton(link, 'View your invoice')}
     <p style="font-size:13px;color:#6b7280;">Keep this for your records.</p>`,
  )
  const text = `Hi ${invoice.bill_to_name},

Thank you — we have received ${formatCents(invoice.amount_paid_cents)} against ${ref}. It is settled in full.

${link}

Haberl Electrical & Solar`

  return sendEmail({
    to: [invoice.bill_to_email],
    subject: `Payment received — ${ref}`,
    html,
    text,
    replyTo: 'info@haberl.co.za',
  })
}
