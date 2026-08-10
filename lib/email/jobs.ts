import { emailButton, emailLayout, sendEmail, type SendResult } from './send'
import { escapeHtml } from '@/lib/utils'

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
  /** Drives solar vs electrical wording (W97). Missing → solar. */
  work_type?: string | null
}

function portalButton(baseUrl: string, label = 'Track your installation'): string {
  return emailButton(`${baseUrl.replace(/\/$/, '')}/portal`, label)
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
  const safeName = escapeHtml(name) // HTML bodies only; plain-text keeps `name`
  const ref = job.quote_number ? ` (${job.quote_number})` : ''
  const refSubject = job.quote_number ? ` — ${job.quote_number}` : ''
  // Scope-engine jobs (electrical, CoC, …) drop the solar wording; handover
  // never fires for them (not in the lite pipeline), so only the first two
  // stages need electrical variants.
  const solar = !job.work_type || job.work_type === 'solar' || job.work_type === 'backup_inverter'
  const trackLabel = solar ? 'Track your installation' : 'Track your job'

  let title: string
  let subject: string
  let bodyHtml: string
  let text: string

  if (stage === 'scheduled') {
    const whenHtml = job.scheduled_date ? ` for <strong>${formatDate(job.scheduled_date)}</strong>` : ''
    const whenText = job.scheduled_date ? ` for ${formatDate(job.scheduled_date)}` : ''
    title = solar ? 'Your installation is booked' : 'Your work is booked'
    subject = solar ? `Your solar installation is booked${refSubject}` : `Your electrical work is booked${refSubject}`
    const doing = solar
      ? 'Our team will arrive on the day to fit and commission your system.'
      : 'Our team will arrive on the day to do the quoted work.'
    bodyHtml = `<p style="font-size:15px;line-height:1.6;">Hi ${safeName},</p>
      <p style="font-size:15px;line-height:1.6;">Good news — your ${solar ? 'solar installation' : 'job'}${ref} is booked${whenHtml}. ${doing}</p>
      <p style="font-size:15px;line-height:1.6;">We'll be in touch as the date approaches. You can follow every step in your portal:</p>
      ${portalButton(baseUrl, trackLabel)}`
    text = `Hi ${name},\n\nYour ${solar ? 'solar installation' : 'job'}${ref} is booked${whenText}. ${doing}\n\nTrack progress: ${portalUrl(baseUrl)}\n\nHaberl Electrical & Solar`
  } else if (stage === 'installation') {
    title = solar ? 'Installation day' : 'Work day'
    subject = solar ? `We're installing your solar system today${refSubject}` : `We're on site today${refSubject}`
    const doing = solar
      ? "Our team is installing your solar system today. We'll commission and test everything before we leave, and let you know the moment it's up and running."
      : "Our team is on site doing your quoted electrical work today. We'll test everything before we leave."
    bodyHtml = `<p style="font-size:15px;line-height:1.6;">Hi ${safeName},</p>
      <p style="font-size:15px;line-height:1.6;">${doing}</p>
      <p style="font-size:15px;line-height:1.6;">You can follow progress here:</p>
      ${portalButton(baseUrl, trackLabel)}`
    text = `Hi ${name},\n\n${doing}\n\nTrack progress: ${portalUrl(baseUrl)}\n\nHaberl Electrical & Solar`
  } else {
    // handover
    title = 'Your solar system is ready'
    subject = `Your solar system is handed over${refSubject}`
    bodyHtml = `<p style="font-size:15px;line-height:1.6;">Hi ${safeName},</p>
      <p style="font-size:15px;line-height:1.6;">Your installation is complete and your system is now yours to enjoy. Your handover pack — including your compliance documents and equipment details — is available in your portal.</p>
      ${portalButton(baseUrl)}
      <p style="font-size:13px;color:#6b7280;">Thank you for choosing Haberl. If you have any questions about your new system, just reply to this email or call us on +27 61 519 3016.</p>`
    text = `Hi ${name},\n\nYour installation is complete and your system is now yours to enjoy. Your handover pack and documents are in your portal: ${portalUrl(baseUrl)}\n\nThank you for choosing Haberl.\n\nHaberl Electrical & Solar`
  }

  const html = emailLayout(title, bodyHtml)
  return sendEmail({ to: [job.customer_email], subject, html, text, replyTo: 'info@haberl.co.za' })
}
