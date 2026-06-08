/**
 * Email notifications via Resend.
 * Install: npm install resend
 * Set RESEND_API_KEY in .env.local
 */

interface AlertEmailPayload {
  to: string[]
  subject: string
  body: string
}

export async function sendAlertEmail({ to, subject, body }: AlertEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[monitoring/email] RESEND_API_KEY not set — skipping email')
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'alerts@haberl.co.za',
      to,
      subject,
      html:    `<p>${body.replace(/\n/g, '<br/>')}</p>`,
      text:    body,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[monitoring/email] Resend error:', err)
  }
}
