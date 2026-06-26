import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { fetchSystemSettings } from '@/lib/monitoring/collector'
import { AdapterError } from '@/lib/monitoring/types'
import { getSettingsCapability } from '@/lib/monitoring/settings/capabilities'
import { parseSettings, type InverterSettings } from '@/lib/monitoring/settings/types'
import type { MonitoringBrand } from '@/lib/monitoring/types'

export const maxDuration = 30

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
 * GET /api/monitoring/systems/[systemId]/settings
 * Latest captured settings for a system + that brand's capability info.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data: system } = await supabase
    .from('monitoring_systems')
    .select('id, brand')
    .eq('id', systemId)
    .single()
  if (!system) return NextResponse.json({ error: 'System not found' }, { status: 404 })

  const { data: snapshot } = await supabase
    .from('monitoring_settings_snapshots')
    .select('id, captured_at, source, settings, note')
    .eq('system_id', systemId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    brand: system.brand,
    capability: getSettingsCapability(system.brand as MonitoringBrand),
    snapshot: snapshot
      ? { ...snapshot, settings: parseSettings(snapshot.settings) }
      : null,
  })
}

/**
 * POST /api/monitoring/systems/[systemId]/settings
 *   { mode: 'cloud' }                       → read live from the brand cloud
 *   { mode: 'manual', settings, note }      → save what staff read off the app
 * Both append a row to monitoring_settings_snapshots (the newest = current).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const body = (await req.json()) as {
    mode: 'cloud' | 'manual'
    settings?: Partial<InverterSettings>
    note?: string
  }

  let settings: InverterSettings
  let source: 'cloud' | 'manual'
  let raw: Record<string, unknown> | null = null

  if (body.mode === 'cloud') {
    try {
      const result = await fetchSystemSettings(
        supabase as unknown as Parameters<typeof fetchSystemSettings>[0],
        systemId,
      )
      settings = result.settings
      raw = result.raw
      source = 'cloud'
    } catch (err) {
      const message = err instanceof AdapterError || err instanceof Error ? err.message : String(err)
      // Expected outcome (brand unsupported / creds) — 200 ok:false so the UI
      // can nudge the user to manual capture inline.
      return NextResponse.json({ ok: false, error: message })
    }
  } else {
    settings = parseSettings(body.settings)
    source = 'manual'
  }

  const { data: inserted, error } = await supabase
    .from('monitoring_settings_snapshots')
    .insert({
      system_id: systemId,
      source,
      settings,
      raw_payload: raw,
      note: body.note ?? null,
      captured_by: user.id,
    })
    .select('id, captured_at, source, settings, note')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, snapshot: { ...inserted, settings: parseSettings(inserted.settings) } })
}
