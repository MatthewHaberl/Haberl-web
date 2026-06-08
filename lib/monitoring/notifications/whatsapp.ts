/**
 * WhatsApp notifications via Twilio WhatsApp API.
 * Install: npm install twilio
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in .env.local
 * TWILIO_WHATSAPP_FROM format: whatsapp:+27821234567
 */

export async function sendWhatsApp(to: string, message: string): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_WHATSAPP_FROM

  if (!sid || !token || !from) {
    console.warn('[monitoring/whatsapp] Twilio env vars not set — skipping WhatsApp')
    return
  }

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: toFormatted, Body: message }).toString(),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('[monitoring/whatsapp] Twilio error:', err)
  }
}
