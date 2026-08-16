import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * GET /api/monitoring/fleet-totals?start=2026-08-01&end=2026-08-16
 *
 * Energy totals across every system the caller can see, for a SAST date range
 * (inclusive both ends). Returns the whole-window roll-up, a per-day series for
 * the chart, and a per-system breakdown for the table.
 *
 * The integration happens in Postgres (monitoring_fleet_daily_totals, migration
 * 110) rather than here: a fleet-wide month is tens of thousands of samples, and
 * paginating those into the route just to add them up would be slow. The RPC is
 * SECURITY INVOKER, so staff get the fleet and a customer gets only their sites.
 */

// The fleet is all South Africa: SAST is a fixed UTC+02:00, no DST.
const SAST_OFFSET = '+02:00'
const MAX_DAYS = 366

const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Today in SAST (YYYY-MM-DD). */
function todaySast(): string {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
}

interface RpcRow {
  system_id: string
  day: string
  production_kwh: number
  consumption_kwh: number
  grid_import_kwh: number
  grid_export_kwh: number
  battery_charge_kwh: number
  battery_discharge_kwh: number
  pv_peak_w: number | null
  load_peak_w: number | null
  soc_min: number | null
  soc_max: number | null
  readings: number
}

const ENERGY_KEYS = [
  'production_kwh', 'consumption_kwh', 'grid_import_kwh',
  'grid_export_kwh', 'battery_charge_kwh', 'battery_discharge_kwh',
] as const
type EnergyKey = (typeof ENERGY_KEYS)[number]

type Energy = Record<EnergyKey, number>
const zeroEnergy = (): Energy =>
  ({ production_kwh: 0, consumption_kwh: 0, grid_import_kwh: 0, grid_export_kwh: 0, battery_charge_kwh: 0, battery_discharge_kwh: 0 })

function addInto(acc: Energy, row: RpcRow) {
  for (const k of ENERGY_KEYS) acc[k] += Number(row[k] ?? 0)
}

const round2 = (n: number) => Math.round(n * 100) / 100
const roundEnergy = (e: Energy): Energy =>
  Object.fromEntries(ENERGY_KEYS.map((k) => [k, round2(e[k])])) as Energy

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const today = todaySast()
  const endRaw = searchParams.get('end')
  const startRaw = searchParams.get('start')

  // Default to the last 7 days ending today; clamp a future end back to today.
  let end = isDay(endRaw) ? endRaw : today
  if (end > today) end = today
  let start = isDay(startRaw) ? startRaw : addDays(end, -6)
  if (start > end) start = end
  if (daysBetween(start, end) > MAX_DAYS) start = addDays(end, -(MAX_DAYS - 1))

  const supabase = await createClient()

  // The RPC window is half-open: [start 00:00 SAST, day-after-end 00:00 SAST).
  const { data, error } = await supabase.rpc('monitoring_fleet_daily_totals', {
    p_since: `${start}T00:00:00${SAST_OFFSET}`,
    p_until: `${addDays(end, 1)}T00:00:00${SAST_OFFSET}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = ((data ?? []) as RpcRow[]).map((r) => ({
    ...r,
    day: String(r.day).slice(0, 10),   // date comes back as YYYY-MM-DD
  }))

  // Systems the caller can see — names for the breakdown, and so a site with no
  // readings in the window still shows up (as zeros) rather than vanishing.
  const { data: systems } = await supabase
    .from('monitoring_systems')
    .select('id, brand, label, capacity_kw, battery_kwh, enabled, sites ( name, customer:customers ( full_name ) )')
    .order('created_at')

  type SiteJoin = { name: string; customer: { full_name: string } | { full_name: string }[] | null }
  const meta = new Map<string, { brand: string; label: string | null; capacity_kw: number | null; battery_kwh: number | null; enabled: boolean; site_name: string | null; customer_name: string | null }>()
  for (const s of systems ?? []) {
    const siteRaw = s.sites as unknown as SiteJoin | SiteJoin[] | null
    const site = Array.isArray(siteRaw) ? siteRaw[0] : siteRaw
    const custRaw = site?.customer
    const cust = Array.isArray(custRaw) ? custRaw[0] : custRaw
    meta.set(s.id, {
      brand: s.brand,
      label: s.label,
      capacity_kw: s.capacity_kw,
      battery_kwh: s.battery_kwh,
      enabled: s.enabled,
      site_name: site?.name ?? null,
      customer_name: cust?.full_name ?? null,
    })
  }

  // ── Roll up: whole window, per day, per system ──────────────────────────
  const total = zeroEnergy()
  const perDay = new Map<string, Energy>()
  const perSystem = new Map<string, Energy & { readings: number; pv_peak_w: number | null; last_day: string | null }>()
  let pvPeakW: number | null = null
  let loadPeakW: number | null = null

  for (const row of rows) {
    addInto(total, row)

    let day = perDay.get(row.day)
    if (!day) { day = zeroEnergy(); perDay.set(row.day, day) }
    addInto(day, row)

    let sys = perSystem.get(row.system_id)
    if (!sys) { sys = { ...zeroEnergy(), readings: 0, pv_peak_w: null, last_day: null }; perSystem.set(row.system_id, sys) }
    addInto(sys, row)
    sys.readings += Number(row.readings ?? 0)
    if (row.pv_peak_w != null && (sys.pv_peak_w == null || row.pv_peak_w > sys.pv_peak_w)) sys.pv_peak_w = row.pv_peak_w
    if (sys.last_day == null || row.day > sys.last_day) sys.last_day = row.day

    if (row.pv_peak_w != null && (pvPeakW == null || row.pv_peak_w > pvPeakW)) pvPeakW = row.pv_peak_w
    if (row.load_peak_w != null && (loadPeakW == null || row.load_peak_w > loadPeakW)) loadPeakW = row.load_peak_w
  }

  // Every day in the range, so gaps render as zero-height bars, not as a gap.
  const daily: Array<{ day: string } & Energy> = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    daily.push({ day: d, ...roundEnergy(perDay.get(d) ?? zeroEnergy()) })
  }

  const bySystem = [...meta.entries()].map(([id, m]) => {
    const e = perSystem.get(id)
    return {
      system_id: id,
      site_name: m.site_name,
      customer_name: m.customer_name,
      label: m.label,
      brand: m.brand,
      capacity_kw: m.capacity_kw,
      battery_kwh: m.battery_kwh,
      enabled: m.enabled,
      readings: e?.readings ?? 0,
      pv_peak_w: e?.pv_peak_w ?? null,
      ...roundEnergy(e ?? zeroEnergy()),
    }
  }).sort((a, b) => b.production_kwh - a.production_kwh)

  return NextResponse.json({
    start,
    end,
    days: daysBetween(start, end),
    systems_reporting: perSystem.size,
    systems_total: meta.size,
    totals: { ...roundEnergy(total), pv_peak_w: pvPeakW, load_peak_w: loadPeakW },
    daily,
    by_system: bySystem,
  })
}
