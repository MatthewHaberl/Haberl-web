import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { buildRecommendations, type Recommendation } from '@/lib/monitoring/settings/recommendations'
import { buildEnergyProfile } from '@/lib/monitoring/settings/profile'
import { parseSettings, emptySettings } from '@/lib/monitoring/settings/types'

export const maxDuration = 30

// Sensible SA defaults; overridable per request from the What-if panel.
const DEFAULT_TARIFF = 3.5
const DEFAULT_FEED_IN = 1.2

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

const ACTED = ['applied', 'dismissed', 'snoozed']

function toRow(systemId: string, r: Recommendation) {
  return {
    system_id: systemId,
    code: r.code,
    category: r.category,
    severity: r.severity,
    title: r.title,
    rationale: r.rationale,
    current_value: r.currentValue,
    suggested_value: r.suggestedValue,
    projected_annual_saving_r: r.projectedAnnualSavingR,
    projected_self_consumption_delta_pct: r.projectedSelfConsumptionDeltaPct,
    updated_at: new Date().toISOString(),
  }
}

/** GET — current stored recommendations for a system. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  const auth = await requireStaff()
  if ('error' in auth) return auth.error

  const { data } = await auth.supabase
    .from('monitoring_recommendations')
    .select('*')
    .eq('system_id', systemId)
    .order('severity', { ascending: true })
    .order('projected_annual_saving_r', { ascending: false, nullsFirst: false })

  return NextResponse.json({ recommendations: data ?? [] })
}

/**
 * POST — recompute recommendations from the latest settings snapshot + energy
 * profile, persist them, and return the fresh set with the modelled baseline.
 * Recommendations already acted on (applied/dismissed/snoozed) keep their status.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const overrides = (await req.json().catch(() => ({}))) as {
    tariffRate?: number
    feedInRate?: number
    feedInAvailable?: boolean
    generationMonthlyKwh?: number[]
    consumptionMonthlyKwh?: number[]
  }

  const { data: system } = await supabase
    .from('monitoring_systems')
    .select('id, capacity_kw, battery_kwh')
    .eq('id', systemId)
    .single()
  if (!system) return NextResponse.json({ error: 'System not found' }, { status: 404 })

  const { data: snap } = await supabase
    .from('monitoring_settings_snapshots')
    .select('settings')
    .eq('system_id', systemId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const settings = snap ? parseSettings(snap.settings) : emptySettings()

  const validMonthly = (a?: number[]) => Array.isArray(a) && a.length === 12
  const profile = validMonthly(overrides.generationMonthlyKwh) && validMonthly(overrides.consumptionMonthlyKwh)
    ? { generationMonthlyKwh: overrides.generationMonthlyKwh!, consumptionMonthlyKwh: overrides.consumptionMonthlyKwh!, basis: 'measured' as const, measuredDays: 0 }
    : await buildEnergyProfile(supabase, system)

  const result = buildRecommendations({
    settings,
    batteryKwh: system.battery_kwh,
    tariffRate: overrides.tariffRate ?? DEFAULT_TARIFF,
    feedInRate: overrides.feedInRate ?? DEFAULT_FEED_IN,
    feedInAvailable: overrides.feedInAvailable ?? false,
    generationMonthlyKwh: profile.generationMonthlyKwh,
    consumptionMonthlyKwh: profile.consumptionMonthlyKwh,
    hasMeasuredData: profile.basis === 'measured',
  })

  // Reconcile with what's already stored, preserving acted-on statuses.
  const { data: existing } = await supabase
    .from('monitoring_recommendations')
    .select('id, code, status')
    .eq('system_id', systemId)
  const byCode = new Map((existing ?? []).map((r) => [r.code, r]))
  const freshCodes = new Set(result.recommendations.map((r) => r.code))

  for (const r of result.recommendations) {
    const ex = byCode.get(r.code)
    if (ex && ACTED.includes(ex.status)) {
      // keep the acted status, just refresh the modelled figures + copy
      await supabase.from('monitoring_recommendations').update(toRow(systemId, r)).eq('id', ex.id)
    } else {
      await supabase
        .from('monitoring_recommendations')
        .upsert({ ...toRow(systemId, r), status: 'open' }, { onConflict: 'system_id,code' })
    }
  }

  // Drop open recommendations that no longer apply.
  const stale = (existing ?? []).filter((e) => e.status === 'open' && !freshCodes.has(e.code)).map((e) => e.id)
  if (stale.length) await supabase.from('monitoring_recommendations').delete().in('id', stale)

  const { data: stored } = await supabase
    .from('monitoring_recommendations')
    .select('*')
    .eq('system_id', systemId)
    .order('severity', { ascending: true })
    .order('projected_annual_saving_r', { ascending: false, nullsFirst: false })

  return NextResponse.json({
    ok: true,
    baseline: result.baseline,
    profileBasis: profile.basis,
    measuredDays: profile.measuredDays,
    recommendations: stored ?? [],
  })
}

/** PATCH — move one recommendation through open → applied / dismissed / snoozed. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const body = (await req.json()) as { id: string; status: 'open' | 'applied' | 'dismissed' | 'snoozed' }
  if (!body.id || !['open', 'applied', 'dismissed', 'snoozed'].includes(body.status)) {
    return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    status: body.status,
    acted_by: user.id,
    updated_at: now,
    applied_at: body.status === 'applied' ? now : null,
    dismissed_at: body.status === 'dismissed' ? now : null,
  }

  const { error } = await supabase
    .from('monitoring_recommendations')
    .update(update)
    .eq('id', body.id)
    .eq('system_id', systemId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
