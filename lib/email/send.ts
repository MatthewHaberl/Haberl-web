/**
 * Transactional email via Resend (same raw-fetch pattern as
 * lib/monitoring/notifications/email.ts — no SDK dependency).
 * Set RESEND_API_KEY in .env.local; without it, sends are skipped and
 * callers receive { sent: false } so the UI can fall back gracefully.
 */

const FROM = 'Haberl Solar <quotes@haberl.co.za>'

export interface SendResult {
  sent: boolean
  error?: string
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: {
  to: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping:', subject)
    return { sent: false, error: 'Email is not configured (RESEND_API_KEY missing)' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[email] Resend error:', err)
    return { sent: false, error: `Email send failed (${res.status})` }
  }
  return { sent: true }
}

/** Brand-styled wrapper. Inline styles only — email clients ignore stylesheets. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#1e3a5f;padding:20px 28px;">
            <span style="color:#ffffff;font-size:18px;font-weight:bold;">Haberl</span>
            <span style="color:#f97316;font-size:18px;font-weight:bold;"> Solar</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 16px;font-size:20px;color:#1e3a5f;">${title}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
            Haberl Electrical &amp; Solar · Designed to SANS 10142-1<br/>
            info@haberl.co.za · +27 61 519 3016
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="background:#f97316;border-radius:6px;">
      <a href="${href}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">${label}</a>
    </td></tr>
  </table>`
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
