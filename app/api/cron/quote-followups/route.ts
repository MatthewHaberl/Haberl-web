import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAdminNotice, sendFollowUpEmail } from '@/lib/email/quotes'
import { getBaseUrl, getCompanySettings } from '@/lib/quotes/server'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Follow-up automation for sent quotes. Schedule daily, e.g.:
 *   curl "https://<host>/api/cron/quote-followups?secret=$CRON_SECRET"
 * (VPS crontab or Vercel cron — same pattern as /api/monitoring/collect.)
 *
 * Cadence per quote (guarded by reminder_count):
 *   day 3  → customer nudge #1
 *   day 7  → customer nudge #2
 *   day 10 → admin alert (no response after two nudges)
 *   expiry → admin alert, no further customer email
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
  const { data: quotes, error } = await supabase
    .from('quote_requests')
    .select('id, customer_name, customer_email, quote_number, total_amount, deposit_amount, share_token, expiry_date, sent_at, reminder_count')
    .eq('status', 'sent')
    .not('sent_at', 'is', null)
    .lt('reminder_count', 3)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const settings = await getCompanySettings(supabase)
  const adminEmail = settings?.contact_email ?? null
  const baseUrl = getBaseUrl()
  const now = Date.now()

  let nudged = 0
  let adminAlerts = 0
  const failures: string[] = []

  for (const quote of quotes ?? []) {
    try {
      const daysSinceSent = (now - new Date(quote.sent_at).getTime()) / 86_400_000
      const expired = quote.expiry_date
        ? now > new Date(`${quote.expiry_date}T23:59:59`).getTime()
        : false

      let nextCount: number | null = null

      if (expired) {
        await sendAdminNotice(
          adminEmail,
          `Quote expired without response — ${quote.quote_number ?? quote.customer_name}`,
          [
            `Quote <strong>${quote.quote_number ?? ''}</strong> for <strong>${quote.customer_name}</strong> expired on ${quote.expiry_date}.`,
            'Consider a fresh follow-up call or a refreshed quote.',
          ],
          `${baseUrl}/portal/employee/quotes/${quote.id}`,
          'Open quote',
        )
        adminAlerts++
        nextCount = 3
      } else if (daysSinceSent >= 10 && quote.reminder_count === 2) {
        await sendAdminNotice(
          adminEmail,
          `No response after 2 reminders — ${quote.quote_number ?? quote.customer_name}`,
          [
            `<strong>${quote.customer_name}</strong> hasn't responded to quote <strong>${quote.quote_number ?? ''}</strong> after two reminders.`,
            'A personal call usually lands better from here.',
          ],
          `${baseUrl}/portal/employee/quotes/${quote.id}`,
          'Open quote',
        )
        adminAlerts++
        nextCount = 3
      } else if (daysSinceSent >= 7 && quote.reminder_count === 1) {
        const result = await sendFollowUpEmail(quote, baseUrl, 2)
        if (result.sent) {
          nudged++
          nextCount = 2
        }
      } else if (daysSinceSent >= 3 && quote.reminder_count === 0) {
        const result = await sendFollowUpEmail(quote, baseUrl, 1)
        if (result.sent) {
          nudged++
          nextCount = 1
        }
      }

      if (nextCount != null) {
        await supabase
          .from('quote_requests')
          .update({ reminder_count: nextCount, last_reminder_at: new Date().toISOString() })
          .eq('id', quote.id)
      }
    } catch (err) {
      failures.push(`${quote.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    checked: quotes?.length ?? 0,
    customerNudges: nudged,
    adminAlerts,
    failures,
  })
}
