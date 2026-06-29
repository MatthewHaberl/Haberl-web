import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'

async function requireStaff() {
  const user = await getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, supabase }
}

/**
 * GET /api/monitoring/systems/[systemId]/settings/history
 * The captured settings snapshots (newest last), each with its full raw_payload,
 * so the client can show every field's current value, plot numeric fields over
 * time, and diff consecutive snapshots into a change-log. Daily captures ⇒ small.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('monitoring_settings_snapshots')
    .select('id, captured_at, source, raw_payload')
    .eq('system_id', systemId)
    .order('captured_at', { ascending: true })
    .limit(400)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
