import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { simulateEnergyBalance } from '@/lib/solar/energy-balance'
import { buildEnergyProfile } from '@/lib/monitoring/settings/profile'
import { parseSettings, emptySettings } from '@/lib/monitoring/settings/types'

export const maxDuration = 30

const DEFAULT_TARIFF = 3.5
const DEFAULT_FEED_IN = 1.2

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function usableFromSoc(minSoc: number, maxSoc: number) { return clamp((maxSoc - minSoc) / 100, 0.05, 0.95) }

/**
 * POST /api/monitoring/systems/[systemId]/simulate
 * "What-if": run the energy-balance for the CURRENT settings and for a proposed
 * override, and return both annual results so the UI can show the delta. The
 * override fields mirror the levers staff actually change on the inverter.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    tariffRate?: number
    feedInRate?: number
    feedInAvailable?: boolean
    generationMonthlyKwh?: number[]
    consumptionMonthlyKwh?: number[]
    // proposed overrides
    override?: {
      exportEnabled?: boolean
      batteryMinSocPct?: number
      batteryMaxSocPct?: number
      batteryKwh?: number          // model a different battery size (upgrade what-if)
    }
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
  const cur = snap ? parseSettings(snap.settings) : emptySettings()

  const validMonthly = (a?: number[]) => Array.isArray(a) && a.length === 12
  const prof = validMonthly(body.generationMonthlyKwh) && validMonthly(body.consumptionMonthlyKwh)
    ? { generationMonthlyKwh: body.generationMonthlyKwh!, consumptionMonthlyKwh: body.consumptionMonthlyKwh!, basis: 'measured' as const, measuredDays: 0 }
    : await buildEnergyProfile(supabase, system)

  const tariffRate = body.tariffRate ?? DEFAULT_TARIFF
  const feedInRate = body.feedInRate ?? DEFAULT_FEED_IN
  const feedInAvailable = body.feedInAvailable ?? false

  const curMin = cur.batteryMinSocPct ?? 10
  const curMax = cur.batteryMaxSocPct ?? 100
  const curExport = cur.exportEnabled === true

  const ov = body.override ?? {}
  const newMin = ov.batteryMinSocPct ?? curMin
  const newMax = ov.batteryMaxSocPct ?? curMax
  const newExport = ov.exportEnabled ?? curExport
  const newBatteryKwh = ov.batteryKwh ?? system.battery_kwh

  const balanceArgs = (allowExport: boolean, usable: number, batteryKwh: number | null) => ({
    generationMonthlyKwh: prof.generationMonthlyKwh,
    consumptionMonthlyKwh: prof.consumptionMonthlyKwh,
    tariffRate,
    feedInRate: allowExport && feedInAvailable ? feedInRate : 0,
    allowExport,
    battery: batteryKwh ? { capacityKwh: batteryKwh, usableFraction: usable } : null,
  })

  const current = simulateEnergyBalance(balanceArgs(curExport, usableFromSoc(curMin, curMax), system.battery_kwh))
  const proposed = simulateEnergyBalance(balanceArgs(newExport, usableFromSoc(newMin, newMax), newBatteryKwh))

  return NextResponse.json({
    profileBasis: prof.basis,
    measuredDays: prof.measuredDays,
    current: current.annual,
    proposed: proposed.annual,
    deltaSavingR: Math.round(proposed.annual.savingR - current.annual.savingR),
  })
}
