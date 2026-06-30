import { emailButton, emailLayout, sendEmail, type SendResult } from './send'

/**
 * Customer-facing emails fired when a job moves into a notable stage.
 * Only these three stages email the customer; every other transition is silent.
 */
const NOTIFY_STAGES = new Set(['scheduled', 'installation', 'handover'])

/**
 * Master kill-switch for automatic job-stage emails. OFF by default — these
 * emails stay silent until someone deliberately sets JOB_STAGE_EMAILS_ENABLED
 * to "true" in the environment (Vercel). Flip the env var to turn them on; no
 * code change needed.
 */
export function jobStageEmailsEnabled(): boolean {
  return process.env.JOB_STAGE_EMAILS_ENABLED === 'true'
}

export function jobStageEmailEnabled(stage: string): boolean {
  return NOTIFY_STAGES.has(stage)
}

export interface JobStageEmailFields {
  customer_name: string | null
  customer_email: string | null
  quote_number: string | null
  scheduled_date: string | null
}

function portalButton(baseUrl: string): string {
  return emailButton(`${baseUrl.replace(/\/$/, '')}/portal`, 'Track your installation')
}

function portalUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/portal`
}

function formatDate(date: string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export async function sendJobStageEmail(
  stage: string,
  job: JobStageEmailFields,
  baseUrl: string,
): Promise<SendResult> {
  if (!jobStageEmailsEnabled()) return { sent: false }
  if (!NOTIFY_STAGES.has(stage)) return { sent: false }
  if (!job.customer_email) return { sent: false, error: 'No customer email on this job' }

  const name = job.customer_name || 'there'
  const ref = job.quote_number ? ` (${job.quote_number})` : ''
  const refSubject = job.quote_number ? ` — ${job.quote_number}` : ''

  let title: string
  let subject: string
  let bodyHtml: string
  let text: string

  if (stage === 'scheduled') {
    const whenHtml = job.scheduled_date ? ` for <strong>${formatDate(job.scheduled_date)}</strong>` : ''
    const whenText = job.scheduled_date ? ` for ${formatDate(job.scheduled_date)}` : ''
    title = 'Your installation is booked'
    subject = `Your solar installation is booked${refSubject}`
    bodyHtml = `<p style="font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="font-size:15px;line-height:1.6;">Good news — your solar installation${ref} is booked${whenHtml}. Our team will arrive on the day to fit and commission your system.</p>
      <p style="font-size:15px;line-height:1.6;">We'll be in touch as the date approaches. You can follow every step in your portal:</p>
      ${portalButton(baseUrl)}`
    text = `Hi ${name},\n\nYour solar installation${ref} is booked${whenText}. Our team will arrive on the day to fit and commission your system.\n\nTrack progress: ${portalUrl(baseUrl)}\n\nHaberl Electrical & Solar`
  } else if (stage === 'installation') {
    title = 'Installation day'
    subject = `We're installing your solar system today${refSubject}`
    bodyHtml = `<p style="font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="font-size:15px;line-height:1.6;">Our team is installing your solar system today. We'll commission and test everything before we leave, and let you know the moment it's up and running.</p>
      <p style="font-size:15px;line-height:1.6;">You can follow progress here:</p>
      ${portalButton(baseUrl)}`
    text = `Hi ${name},\n\nOur team is installing your solar system today. We'll commission and test everything before we leave.\n\nTrack progress: ${portalUrl(baseUrl)}\n\nHaberl Electrical & Solar`
  } else {
    // handover
    title = 'Your solar system is ready'
    subject = `Your solar system is handed over${refSubject}`
    bodyHtml = `<p style="font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="font-size:15px;line-height:1.6;">Your installation is complete and your system is now yours to enjoy. Your handover pack — including your compliance documents and equipment details — is available in your portal.</p>
      ${portalButton(baseUrl)}
      <p style="font-size:13px;color:#6b7280;">Thank you for choosing Haberl. If you have any questions about your new system, just reply to this email or call us on +27 61 519 3016.</p>`
    text = `Hi ${name},\n\nYour installation is complete and your system is now yours to enjoy. Your handover pack and documents are in your portal: ${portalUrl(baseUrl)}\n\nThank you for choosing Haberl.\n\nHaberl Electrical & Solar`
  }

  const html = emailLayout(title, bodyHtml)
  return sendEmail({ to: [job.customer_email], subject, html, text, replyTo: 'info@haberl.co.za' })
}
