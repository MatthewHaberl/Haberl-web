import { NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { pollAllNow } from '@/lib/monitoring/collector'

export const maxDuration = 60  // polling every system can take a while

/**
 * POST /api/monitoring/poll-all — fetch a fresh reading for EVERY enabled system
 * right now (the fleet-page "Poll all" button). Staff-only; runs as the logged-in
 * user so it relies on RLS, not the service-role key.
 */
export async function POST() {
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
    const results = await pollAllNow(
      supabase as unknown as Parameters<typeof pollAllNow>[0],
    )
    const ok = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok).length
    return NextResponse.json({ ok, failed, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
