import { NextRequest, NextResponse } from 'next/server'
import { runCollector } from '@/lib/monitoring/collector'

export const maxDuration = 60  // allow up to 60s for multi-site polling

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.MONITORING_CRON_SECRET) {
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
