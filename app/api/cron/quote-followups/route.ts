import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFollowUpEmail } from '@/lib/email/quotes'
import { getBaseUrl, getCompanySettings } from '@/lib/quotes/server'
import {
  buildDailyBriefing,
  emailDailyBriefing,
  parseBriefingRecipients,
  planFollowup,
  isCustomerAction,
  nextReminderCount,
  type DailyBriefing,
} from '@/lib/quotes/daily-briefing'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Daily automation for the quote pipeline. Schedule once a day, e.g.:
 *   curl "https://<host>/api/cron/quote-followups?secret=$CRON_SECRET"
 * (Vercel cron sends Authorization: Bearer $CRON_SECRET automatically.)
 *
 * Two jobs each run:
 *   1. Email the operator(s) a single "daily briefing" — what's going out
 *      automatically today + what needs them (drafts, deposits, leads, POs).
 *      Recipients come from company_settings.briefing_emails (fallback: contact).
 *   2. Send the customer follow-ups (day 3 / day 7). Expired and no-response
 *      quotes are surfaced in the briefing's personal-follow-up list rather than
 *      as separate admin emails, so the morning inbox stays to one message.
 */
export async function GET(req: NextRequest) {
  // Accepts either ?secret= (VPS crontab style) or the Authorization: Bearer
  // header Vercel Cron sends automatically when CRON_SECRET is set.
  const expected = process.env.CRON_SECRET ?? process.env.MONITORING_CRON_SECRET
  const querySecret = req.nextUrl.searchParams.get('secret')
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || (querySecret !== expected && bearer !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const baseUrl = getBaseUrl()
  const now = Date.now()
  const settings = await getCompanySettings(supabase)
  const recipients = parseBriefingRecipients(settings?.briefing_emails, settings?.contact_email)

  // 1. Email the consolidated morning briefing first — one "here's your day"
  //    message to all recipients instead of scattered alerts.
  let briefing: DailyBriefing
  let briefingSent = false
  if (recipients.length) {
    const r = await emailDailyBriefing({ supabase, baseUrl, to: recipients, now })
    briefing = r.briefing
    briefingSent = r.sent
  } else {
    briefing = await buildDailyBriefing(supabase, now)
  }

  // 2. Run the follow-ups. Customer nudges email the customer; admin actions
  //    (expired / no-response) only advance the counter — the briefing already
  //    lists them under "personal follow-up", so there's no separate alert email.
  const { data: quotes, error } = await supabase
    .from('quote_requests')
    .select('id, customer_name, customer_email, quote_number, total_amount, deposit_amount, share_token, expiry_date, sent_at, reminder_count')
    .eq('status', 'sent')
    .not('sent_at', 'is', null)
    .lt('reminder_count', 3)
  if (error) {
    return NextResponse.json({ error: error.message, briefingSent }, { status: 500 })
  }

  let customerNudges = 0
  let flaggedForFollowup = 0
  const failures: string[] = []

  for (const quote of quotes ?? []) {
    try {
      const action = planFollowup(quote, now)
      if (!action) continue

      if (isCustomerAction(action)) {
        const result = await sendFollowUpEmail(quote, baseUrl, action === 'customer_nudge_2' ? 2 : 1)
        if (!result.sent) {
          failures.push(`${quote.id}: ${result.error ?? 'send failed'}`)
          continue
        }
        customerNudges++
      } else {
        flaggedForFollowup++
      }

      await supabase
        .from('quote_requests')
        .update({ reminder_count: nextReminderCount(action), last_reminder_at: new Date().toISOString() })
        .eq('id', quote.id)
    } catch (err) {
      failures.push(`${quote.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    briefingSent,
    recipients: recipients.length,
    checked: quotes?.length ?? 0,
    customerNudges,
    flaggedForFollowup,
    needsYou: briefing.totalAttention,
    failures,
  })
}
