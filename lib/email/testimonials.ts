import { emailButton, emailLayout, sendEmail, type SendResult } from './send'

/**
 * The testimonial ask (S7). Sent by hand from the job page, not by a cron — a
 * request for a favour lands better when a person chose to send it, and Matthew
 * knows which customers actually enjoyed the install.
 */

function captureUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/testimonial/${token}`
}

export async function sendTestimonialRequest({
  to, customerName, token, baseUrl, reminder = false,
}: {
  to: string
  customerName: string | null
  token: string
  baseUrl: string
  reminder?: boolean
}): Promise<SendResult> {
  const hi = customerName ? `Hi ${customerName.split(' ')[0]},` : 'Hi there,'
  const url = captureUrl(baseUrl, token)

  const subject = reminder
    ? 'A quick reminder — how has your solar system been?'
    : 'How has your solar system been treating you?'

  const opening = reminder
    ? `<p>${hi}</p>
       <p>Just a gentle nudge on this one — no pressure at all if you'd rather not.</p>`
    : `<p>${hi}</p>
       <p>Now that your system has been running a little while, we'd love to hear how it's going.</p>`

  const html = emailLayout(subject, `
    ${opening}
    <p>
      If you're happy with the work, a short review would mean a great deal to us. It takes
      about two minutes, and <strong>a quick video from your phone</strong> — even 20 seconds,
      filmed standing next to the inverter — is worth more than anything we could write ourselves.
    </p>
    ${emailButton(url, 'Leave a review')}
    <p style="font-size:13px;color:#6b7280">
      You choose what we may do with it: nothing is published unless you tick the box, and you can
      leave feedback privately if you'd prefer we keep it in-house. If something isn't right with
      the system, tell us there too — we'd far rather hear it from you than not at all.
    </p>
  `)

  const text = [
    hi,
    '',
    reminder
      ? "Just a gentle nudge — no pressure at all if you'd rather not."
      : "Now that your system has been running a little while, we'd love to hear how it's going.",
    '',
    "If you're happy with the work, a short review would mean a great deal. A quick phone video — even 20 seconds — is worth more than anything we could write ourselves.",
    '',
    url,
    '',
    "Nothing is published unless you tick the box, and you can leave feedback privately if you'd prefer. If something isn't right, please tell us there too.",
  ].join('\n')

  return sendEmail({ to: [to], subject, html, text, replyTo: 'matthew@haberl.co.za' })
}

/** Internal ping when a customer submits, so it gets reviewed while it's warm. */
export async function sendTestimonialSubmittedNotice({
  to, customerName, rating, jobId, baseUrl,
}: {
  to: string[]
  customerName: string | null
  rating: number | null
  jobId: string
  baseUrl: string
}): Promise<SendResult> {
  const who = customerName ?? 'A customer'
  const stars = rating ? `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` : 'no rating'
  const subject = `${who} left a review (${stars})`
  const link = `${baseUrl.replace(/\/$/, '')}/portal/employee/jobs/${jobId}`

  const html = emailLayout(subject, `
    <p><strong>${who}</strong> just submitted a testimonial — ${stars}.</p>
    <p>It stays private until someone approves it.</p>
    ${emailButton(link, 'Review it')}
  `)
  const text = `${who} submitted a testimonial (${stars}). It stays private until approved.\n\n${link}`

  return sendEmail({ to, subject, html, text })
}
