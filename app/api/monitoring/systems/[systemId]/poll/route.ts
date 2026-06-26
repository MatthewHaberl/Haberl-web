import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { pollSystemNow } from '@/lib/monitoring/collector'

export const maxDuration = 30  // brand APIs can be slow; allow a generous timeout

/**
 * POST /api/monitoring/systems/[systemId]/poll — fetch a fresh reading for one
 * system right now (the "Poll now" button). Staff-only; runs as the logged-in
 * user so it relies on RLS, not the service-role key.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // The collector helper is typed against the supabase-js client; the SSR
    // server client is structurally compatible for these untyped queries.
    const result = await pollSystemNow(
      supabase as unknown as Parameters<typeof pollSystemNow>[0],
      systemId,
    )
    // A failed brand fetch is a 200 with ok:false so the button can show the
    // message inline (the poll_error is already recorded on the row).
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
