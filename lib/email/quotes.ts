import { emailButton, emailLayout, formatCents, sendEmail, type SendResult } from './send'

/** The slice of a quote_requests row the emails need. */
export interface QuoteEmailFields {
  customer_name: string
  customer_email: string | null
  quote_number: string | null
  total_amount: number | null
  deposit_amount: number | null
  share_token: string
  expiry_date: string | null
}

export interface BankingDetails {
  bank?: string
  account_name?: string
  account_number?: string
  branch_code?: string
  account_type?: string
}

function quoteLink(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/$/, '')}/q/${token}`
}

function expiryLine(expiryDate: string | null): string {
  if (!expiryDate) return ''
  const formatted = new Date(expiryDate).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  return `<p style="font-size:13px;color:#6b7280;">This quote is valid until <strong>${formatted}</strong>.</p>`
}

export function bankingHtml(banking: BankingDetails, reference: string, amountCents: number | null): string {
  const row = (label: string, value: string | undefined) =>
    value ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;">${label}</td><td style="padding:4px 0;font-size:14px;font-weight:bold;">${value}</td></tr>` : ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin:12px 0;width:100%;">
    <tr><td style="padding:12px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        ${row('Bank', banking.bank)}
        ${row('Account name', banking.account_name)}
        ${row('Account number', banking.account_number)}
        ${row('Branch code', banking.branch_code)}
        ${row('Account type', banking.account_type)}
        ${row('Amount', formatCents(amountCents))}
        ${row('Reference', reference)}
      </table>
    </td></tr>
  </table>
  <p style="font-size:13px;color:#b45309;background:#fef3c7;border-radius:6px;padding:10px 12px;">
    Please use <strong>${reference}</strong> as your payment reference so we can match your deposit immediately.
  </p>`
}

// ── Customer-facing ───────────────────────────────────────────────────────────

export async function sendQuoteEmail(quote: QuoteEmailFields, baseUrl: string): Promise<SendResult> {
  if (!quote.customer_email) return { sent: false, error: 'No customer email on this quote' }
  const link = quoteLink(baseUrl, quote.share_token)
  const ref = quote.quote_number ?? 'your quote'
  const html = emailLayout(
    `Your solar quote ${quote.quote_number ?? ''}`.trim(),
    `<p style="font-size:15px;line-height:1.6;">Hi ${quote.customer_name},</p>
     <p style="font-size:15px;line-height:1.6;">Your solar installation quote is ready. The total comes to <strong>${formatCents(quote.total_amount)}</strong>${quote.deposit_amount != null ? ` with a deposit of <strong>${formatCents(quote.deposit_amount)}</strong>` : ''}.</p>
     <p style="font-size:15px;line-height:1.6;">View the full quote online — you can accept it there in one step, no login needed:</p>
     ${emailButton(link, 'View your quote')}
     ${expiryLine(quote.expiry_date)}
     <p style="font-size:13px;color:#6b7280;">Questions? Just reply to this email or call us.</p>`,
  )
  const text = `Hi ${quote.customer_name},\n\nYour solar quote ${ref} is ready. Total: ${formatCents(quote.total_amount)}.\n\nView and accept it here: ${link}\n\nHaberl Electrical & Solar`
  return sendEmail({ to: [quote.customer_email], subject: `Your solar quote ${quote.quote_number ?? ''} — Haberl Solar`.replace('  ', ' '), html, text, replyTo: 'info@haberl.co.za' })
}

export async function sendFollowUpEmail(quote: QuoteEmailFields, baseUrl: string, reminderNumber: number): Promise<SendResult> {
  if (!quote.customer_email) return { sent: false, error: 'No customer email' }
  const link = quoteLink(baseUrl, quote.share_token)
  const intro = reminderNumber === 1
    ? 'Just a friendly reminder that your solar quote is ready for review.'
    : 'Your solar quote is still open — we wanted to check in before it expires.'
  const html = emailLayout(
    'Your solar quote is waiting',
    `<p style="font-size:15px;line-height:1.6;">Hi ${quote.customer_name},</p>
     <p style="font-size:15px;line-height:1.6;">${intro}</p>
     ${emailButton(link, 'View your quote')}
     ${expiryLine(quote.expiry_date)}
     <p style="font-size:13px;color:#6b7280;">If anything is unclear or you'd like changes, just reply — we're happy to adjust.</p>`,
  )
  const text = `Hi ${quote.customer_name},\n\n${intro}\n\n${link}\n\nHaberl Electrical & Solar`
  return sendEmail({ to: [quote.customer_email], subject: `Reminder: your solar quote ${quote.quote_number ?? ''} — Haberl Solar`.replace('  ', ' '), html, text, replyTo: 'info@haberl.co.za' })
}

export async function sendDepositReceiptEmail(quote: QuoteEmailFields): Promise<SendResult> {
  if (!quote.customer_email) return { sent: false, error: 'No customer email' }
  const html = emailLayout(
    'Deposit received — thank you!',
    `<p style="font-size:15px;line-height:1.6;">Hi ${quote.customer_name},</p>
     <p style="font-size:15px;line-height:1.6;">We've received your deposit of <strong>${formatCents(quote.deposit_amount)}</strong> for quote <strong>${quote.quote_number ?? ''}</strong>. Your installation is now moving into procurement — we're ordering your equipment.</p>
     <p style="font-size:15px;line-height:1.6;">We'll be in touch shortly to confirm your installation date.</p>`,
  )
  const text = `Hi ${quote.customer_name},\n\nWe've received your deposit of ${formatCents(quote.deposit_amount)} for quote ${quote.quote_number ?? ''}. Equipment is being ordered — we'll confirm your installation date shortly.\n\nHaberl Electrical & Solar`
  return sendEmail({ to: [quote.customer_email], subject: `Deposit received — ${quote.quote_number ?? 'your solar installation'}`, html, text, replyTo: 'info@haberl.co.za' })
}

export async function sendProofRejectedEmail(quote: QuoteEmailFields, reason: string | null, baseUrl: string): Promise<SendResult> {
  if (!quote.customer_email) return { sent: false, error: 'No customer email' }
  const link = quoteLink(baseUrl, quote.share_token)
  const reasonHtml = reason
    ? `<p style="font-size:14px;line-height:1.6;background:#fef3c7;border-radius:6px;padding:10px 12px;color:#b45309;"><strong>Reason:</strong> ${reason}</p>`
    : ''
  const html = emailLayout(
    "We couldn't confirm your payment yet",
    `<p style="font-size:15px;line-height:1.6;">Hi ${quote.customer_name},</p>
     <p style="font-size:15px;line-height:1.6;">Thanks for sending your proof of payment for quote <strong>${quote.quote_number ?? ''}</strong>. Unfortunately we weren't able to confirm it.</p>
     ${reasonHtml}
     <p style="font-size:15px;line-height:1.6;">Please double-check the details and upload your proof of payment again — it only takes a moment:</p>
     ${emailButton(link, 'Upload proof of payment')}
     <p style="font-size:13px;color:#6b7280;">If you think this is a mistake or need a hand, just reply to this email or call us on +27 61 519 3016.</p>`,
  )
  const text = `Hi ${quote.customer_name},\n\nWe weren't able to confirm your proof of payment for quote ${quote.quote_number ?? ''}.${reason ? `\n\nReason: ${reason}` : ''}\n\nPlease check the details and upload it again here: ${link}\n\nHaberl Electrical & Solar`
  return sendEmail({ to: [quote.customer_email], subject: `Action needed: proof of payment for ${quote.quote_number ?? 'your solar installation'}`, html, text, replyTo: 'info@haberl.co.za' })
}

// ── Admin notifications ───────────────────────────────────────────────────────

export async function sendCustomerPortalOnboardingEmail({
  customerEmail,
  customerName,
  quoteNumber,
  actionUrl,
  isInvite,
}: {
  customerEmail: string
  customerName: string
  quoteNumber: string | null
  actionUrl: string
  isInvite: boolean
}): Promise<SendResult> {
  const title = isInvite ? 'Set up your customer portal' : 'Your customer portal is ready'
  const cta = isInvite ? 'Set up portal access' : 'Open customer portal'
  const intro = isInvite
    ? 'Your quote has been accepted and your installation tracker is ready. Set a password to open your customer portal.'
    : 'Your quote has been accepted and your installation tracker is ready in your customer portal.'

  const html = emailLayout(
    title,
    `<p style="font-size:15px;line-height:1.6;">Hi ${customerName},</p>
     <p style="font-size:15px;line-height:1.6;">${intro}</p>
     ${quoteNumber ? `<p style="font-size:15px;line-height:1.6;">Quote reference: <strong>${quoteNumber}</strong></p>` : ''}
     ${emailButton(actionUrl, cta)}
     <p style="font-size:13px;color:#6b7280;">You can use the portal to follow installation progress and access handover documents as they become available.</p>`,
  )
  const text = `Hi ${customerName},\n\n${intro}\n\n${quoteNumber ? `Quote reference: ${quoteNumber}\n\n` : ''}${actionUrl}\n\nHaberl Electrical & Solar`

  return sendEmail({
    to: [customerEmail],
    subject: `${title} - Haberl Solar`,
    html,
    text,
    replyTo: 'info@haberl.co.za',
  })
}

export async function sendAdminNotice(
  adminEmail: string | string[] | null,
  subject: string,
  lines: string[],
  actionUrl?: string,
  actionLabel?: string,
): Promise<SendResult> {
  const to = (Array.isArray(adminEmail) ? adminEmail : [adminEmail])
    .filter((e): e is string => !!e && e.includes('@'))
  if (!to.length) return { sent: false, error: 'No admin email configured' }
  const html = emailLayout(
    subject,
    `${lines.map((l) => `<p style="font-size:15px;line-height:1.6;margin:6px 0;">${l}</p>`).join('')}
     ${actionUrl ? emailButton(actionUrl, actionLabel ?? 'Open') : ''}`,
  )
  return sendEmail({ to, subject, html, text: lines.join('\n') })
}
