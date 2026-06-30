import { sendEmail, emailLayout, type SendResult } from './send'
import { kindLabel } from '@/lib/calendar/events'
import type { CalendarEvent } from '@/types/database'

/**
 * Manual appointment confirmation — fired only when staff click "Email
 * confirmation" on an event (auto-comms are deliberately off). Reuses the
 * brand email frame and the live Resend sender.
 */
export async function sendEventConfirmation(
  event: CalendarEvent,
  toEmail: string,
): Promise<SendResult> {
  const when = new Date(event.starts_at).toLocaleString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const kind = kindLabel(event.type)
  const greeting = event.contact_name ? `Hi ${event.contact_name},` : 'Hi there,'

  const rows: string[] = [
    `<tr><td style="padding:4px 0;color:#6b7280;width:90px;">When</td><td style="padding:4px 0;font-weight:bold;">${when}</td></tr>`,
    `<tr><td style="padding:4px 0;color:#6b7280;">What</td><td style="padding:4px 0;">${kind}</td></tr>`,
  ]
  if (event.location) {
    rows.push(`<tr><td style="padding:4px 0;color:#6b7280;">Where</td><td style="padding:4px 0;">${event.location}</td></tr>`)
  }

  const body = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">This confirms your upcoming appointment with Haberl:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 16px;">
      ${rows.join('')}
    </table>
    ${event.notes ? `<p style="margin:0 0 16px;color:#374151;">${event.notes}</p>` : ''}
    <p style="margin:0;">If you need to reschedule, just reply to this email or give us a call.</p>
  `

  const text = [
    greeting,
    '',
    'This confirms your upcoming appointment with Haberl:',
    `When:  ${when}`,
    `What:  ${kind}`,
    event.location ? `Where: ${event.location}` : '',
    event.notes ? `\n${event.notes}` : '',
    '',
    'If you need to reschedule, just reply to this email or give us a call.',
  ].filter(Boolean).join('\n')

  return sendEmail({
    to: [toEmail],
    subject: `Appointment confirmed — ${kind}, ${new Date(event.starts_at).toLocaleDateString('en-ZA')}`,
    html: emailLayout('Appointment confirmation', body),
    text,
    replyTo: 'info@haberl.co.za',
  })
}
