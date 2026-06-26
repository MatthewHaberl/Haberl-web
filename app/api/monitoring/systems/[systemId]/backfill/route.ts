import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { startBackfill, runBackfillChunk, previewBackfillDay } from '@/lib/monitoring/backfill'

export const maxDuration = 60  // a chunk fetches several days of brand history

type Sb = Parameters<typeof startBackfill>[0]

async function requireStaff() {
  const user = await getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, supabase: supabase as unknown as Sb }
}

/**
 * GET — latest backfill job for the system, or a dry-run preview of one day
 * (?preview=YYYY-MM-DD) to validate the brand endpoint before a full run.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  const auth = await requireStaff()
  if ('error' in auth) return auth.error

  const preview = req.nextUrl.searchParams.get('preview')
  if (preview) {
    try {
      return NextResponse.json(await previewBackfillDay(auth.supabase, systemId, preview))
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('monitoring_backfill_jobs')
    .select('*')
    .eq('system_id', systemId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return NextResponse.json({ job: data ?? null })
}

/**
 * POST { action: 'start' | 'continue' | 'cancel', maxDays?, jobId? }
 *  - start:    create/resume a job and process the first chunk
 *  - continue: process the next chunk of the running job (client loops this)
 *  - cancel:   stop the running job
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  const auth = await requireStaff()
  if ('error' in auth) return auth.error

  const body = await req.json().catch(() => ({})) as { action?: string; maxDays?: number; jobId?: string }
  const action = body.action ?? 'start'

  try {
    if (action === 'cancel') {
      const supabase = await createClient()
      await supabase
        .from('monitoring_backfill_jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('system_id', systemId)
        .eq('status', 'running')
      return NextResponse.json({ ok: true, cancelled: true })
    }

    let jobId = body.jobId
    if (action === 'start' || !jobId) {
      const job = await startBackfill(auth.supabase, systemId, auth.user.id)
      jobId = job.id
    }

    const job = await runBackfillChunk(auth.supabase, jobId, body.maxDays ?? 10)
    return NextResponse.json({ ok: true, job })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
