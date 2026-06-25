import { NextRequest, NextResponse } from 'next/server'
import { runCollector } from '@/lib/monitoring/collector'

export const maxDuration = 60  // allow up to 60s for multi-site polling

export async function GET(req: NextRequest) {
  // Accept either ?secret= (manual / external cron) or the Authorization: Bearer
  // header that Vercel Cron sends automatically. Reuse CRON_SECRET (already set
  // in prod for the quote cron) so the vercel.json entry authenticates with no
  // extra config; fall back to MONITORING_CRON_SECRET if that is used instead.
  const expected = process.env.CRON_SECRET ?? process.env.MONITORING_CRON_SECRET
  const querySecret = req.nextUrl.searchParams.get('secret')
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || (querySecret !== expected && bearer !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runCollector()
    const ok    = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok).length
    return NextResponse.json({ ok, failed, results })
  } catch (err) {
    console.error('[monitoring/collect]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
