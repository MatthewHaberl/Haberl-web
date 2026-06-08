/**
 * SMS notifications via BulkSMS SA (https://www.bulksms.com).
 * No SDK needed — plain HTTP POST.
 * Set BULKSMS_USERNAME and BULKSMS_PASSWORD in .env.local
 */

export async function sendSms(to: string, message: string): Promise<void> {
  const username = process.env.BULKSMS_USERNAME
  const password = process.env.BULKSMS_PASSWORD

  if (!username || !password) {
    console.warn('[monitoring/sms] BULKSMS_USERNAME / BULKSMS_PASSWORD not set — skipping SMS')
    return
  }

  // Normalise SA numbers: 0821234567 → +27821234567
  const normalised = to.startsWith('+') ? to : `+27${to.replace(/^0/, '')}`

  const res = await fetch('https://api.bulksms.com/v1/messages', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ to: normalised, body: message }]),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[monitoring/sms] BulkSMS error:', err)
  }
}
