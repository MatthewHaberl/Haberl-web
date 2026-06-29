import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, emailLayout } from '@/lib/email/send'
import { getBaseUrl } from '@/lib/quotes/server'

export const runtime = 'nodejs'

const CATEGORIES = ['issue', 'idea', 'question'] as const
const CATEGORY_LABEL: Record<string, string> = {
  issue: 'issue',
  idea: 'suggestion',
  question: 'question',
}

/** Where new-ticket notifications go. Override with TICKETS_NOTIFY_EMAIL. */
const TEAM_EMAIL = process.env.TICKETS_NOTIFY_EMAIL || 'matthew@haberl.co.za'

/**
 * Submit a portal ticket (the floating "Report an issue" widget). Open to any
 * signed-in portal user. Saves via the service-role client (the table is
 * RLS-locked) and emails the team. Email failure never fails the submission —
 * the ticket is already saved and visible in the admin Tickets tab.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  let body: { message?: string; category?: string; page_url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const message = (body.message || '').trim()
  if (!message) return NextResponse.json({ error: 'A description is required.' }, { status: 400 })
  if (message.length > 4000) return NextResponse.json({ error: 'That description is too long.' }, { status: 400 })

  const category = CATEGORIES.includes((body.category || '') as (typeof CATEGORIES)[number])
    ? (body.category as string)
    : 'issue'

  const { data: profile } = await supabase
    .from('user_profiles').select('full_name, role').eq('id', user.id).maybeSingle()

  const reporterName = profile?.full_name || user.email || 'Unknown user'
  const reporterRole = profile?.role || 'customer'
  const pageUrl = typeof body.page_url === 'string' ? body.page_url.slice(0, 500) : null

  const admin = createAdminClient()
  const { data: ticket, error } = await admin
    .from('portal_tickets')
    .insert({
      message,
      category,
      page_url: pageUrl,
      user_agent: req.headers.get('user-agent'),
      reported_by: user.id,
      reporter_name: reporterName,
      reporter_email: user.email,
      reporter_role: reporterRole,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[tickets] insert failed:', error)
    return NextResponse.json({ error: 'Could not save your report.' }, { status: 500 })
  }

  try {
    const ticketsUrl = `${getBaseUrl()}/portal/employee/tickets`
    const label = CATEGORY_LABEL[category] ?? 'issue'
    await sendEmail({
      to: [TEAM_EMAIL],
      replyTo: user.email || undefined,
      subject: `New portal ${label} from ${reporterName}`,
      text:
        `${reporterName} (${reporterRole}) reported a ${label}:\n\n` +
        `${message}\n\nPage: ${pageUrl || '—'}\n\nReview: ${ticketsUrl}`,
      html: emailLayout(
        `New portal ${label}`,
        `<p style="margin:0 0 12px;"><strong>${escapeHtml(reporterName)}</strong> (${escapeHtml(reporterRole)}) reported a ${label}:</p>
         <p style="margin:0 0 16px;padding:12px 14px;background:#f4f5f7;border-radius:6px;white-space:pre-wrap;">${escapeHtml(message)}</p>
         <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Page: ${escapeHtml(pageUrl || '—')}</p>
         <p style="margin:16px 0 0;"><a href="${ticketsUrl}" style="color:#f97316;font-weight:bold;">Review in the Tickets tab →</a></p>`,
      ),
    })
  } catch (e) {
    console.error('[tickets] notify email failed:', e)
  }

  return NextResponse.json({ ok: true, id: ticket.id })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
