import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * GET /api/monitoring/readings
 * ?systemId=...&latest=true        → single latest reading
 * ?systemId=...&hours=24           → last N hours of readings (rolling window)
 * ?systemId=...&day=2026-03-01     → one SAST calendar day of readings
 * ?systemId=...&dailyTotals=1&days=7 → per-day kWh totals over the last N SAST days
 */

// Haberl's fleet is all South Africa: SAST is a fixed UTC+02:00, no DST.
const SAST_MS = 2 * 60 * 60 * 1000

/** SAST calendar-day string (YYYY-MM-DD) for a UTC instant. */
function sastDay(ms: number): string {
  return new Date(ms + SAST_MS).toISOString().slice(0, 10)
}

interface AggReading {
  recorded_at: string
  pv_power_w: number | null
  load_power_w: number | null
  grid_power_w: number | null
  battery_power_w: number | null
}

interface DailyTotal {
  day: string
  production_kwh: number
  consumption_kwh: number
  grid_import_kwh: number
  grid_export_kwh: number
  battery_charge_kwh: number
  battery_discharge_kwh: number
}

/**
 * Trapezoidally integrate the power samples into per-SAST-day energy totals.
 * Each interval is credited to the day of its earlier sample. Gaps longer than
 * an hour (polling outages) are skipped so we don't draw energy through a hole.
 * Sign convention matches the adapters: grid +import/−export, battery +charge/−discharge.
 */
function dailyTotals(rows: AggReading[]): DailyTotal[] {
  const byDay = new Map<string, DailyTotal>()
  const get = (day: string): DailyTotal => {
    let d = byDay.get(day)
    if (!d) {
      d = { day, production_kwh: 0, consumption_kwh: 0, grid_import_kwh: 0,
            grid_export_kwh: 0, battery_charge_kwh: 0, battery_discharge_kwh: 0 }
      byDay.set(day, d)
    }
    return d
  }

  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    const t1 = new Date(a.recorded_at).getTime()
    const t2 = new Date(b.recorded_at).getTime()
    const dtH = (t2 - t1) / 3_600_000
    if (!(dtH > 0) || dtH > 1) continue // skip zero/negative steps and >1h gaps

    const d = get(sastDay(t1))
    // Trapezoidal area (avg of endpoints × dt), in kWh.
    const area = (v1: number, v2: number) => ((v1 + v2) / 2) * dtH / 1000
    const pos = (v: number | null) => Math.max(v ?? 0, 0)
    const neg = (v: number | null) => Math.max(-(v ?? 0), 0)

    d.production_kwh    += area(pos(a.pv_power_w),   pos(b.pv_power_w))
    d.consumption_kwh   += area(pos(a.load_power_w), pos(b.load_power_w))
    d.grid_import_kwh   += area(pos(a.grid_power_w),    pos(b.grid_power_w))
    d.grid_export_kwh   += area(neg(a.grid_power_w),    neg(b.grid_power_w))
    d.battery_charge_kwh    += area(pos(a.battery_power_w), pos(b.battery_power_w))
    d.battery_discharge_kwh += area(neg(a.battery_power_w), neg(b.battery_power_w))
  }

  const round = (n: number) => Math.round(n * 100) / 100
  return [...byDay.values()]
    .sort((x, y) => x.day.localeCompare(y.day))
    .map((d) => ({
      day: d.day,
      production_kwh: round(d.production_kwh),
      consumption_kwh: round(d.consumption_kwh),
      grid_import_kwh: round(d.grid_import_kwh),
      grid_export_kwh: round(d.grid_export_kwh),
      battery_charge_kwh: round(d.battery_charge_kwh),
      battery_discharge_kwh: round(d.battery_discharge_kwh),
    }))
}

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const systemId = searchParams.get('systemId')
  if (!systemId) return NextResponse.json({ error: 'systemId required' }, { status: 400 })

  const supabase = await createClient()

  // ── Single latest reading ─────────────────────────────────────────────
  if (searchParams.get('latest') === 'true') {
    const { data, error } = await supabase
      .from('monitoring_readings')
      .select('id, system_id, recorded_at, pv_power_w, battery_power_w, grid_power_w, load_power_w, battery_soc_pct, battery_voltage_v, grid_frequency_hz, inverter_temp_c, pv_strings, fault_codes, device_state')
      .eq('system_id', systemId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Per-day kWh totals (bar chart) ────────────────────────────────────
  if (searchParams.get('dailyTotals')) {
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '7', 10) || 7, 1), 90)
    // Start at SAST midnight, `days` calendar days ago.
    const nowSast = new Date(Date.now() + SAST_MS)
    const todayStartUtc = Date.UTC(nowSast.getUTCFullYear(), nowSast.getUTCMonth(), nowSast.getUTCDate()) - SAST_MS
    const since = new Date(todayStartUtc - (days - 1) * 86_400_000).toISOString()

    const { data, error } = await supabase
      .from('monitoring_readings')
      .select('recorded_at, pv_power_w, load_power_w, grid_power_w, battery_power_w')
      .eq('system_id', systemId)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(dailyTotals((data ?? []) as AggReading[]))
  }

  // ── One SAST calendar day, or a rolling N-hour window ─────────────────
  const day = searchParams.get('day')
  let since: string
  let until: string | null = null
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const start = Date.parse(`${day}T00:00:00+02:00`)
    since = new Date(start).toISOString()
    until = new Date(start + 86_400_000).toISOString()
  } else {
    const hours = parseInt(searchParams.get('hours') ?? '24', 10)
    since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  }

  let q = supabase
    .from('monitoring_readings')
    .select('id, recorded_at, pv_power_w, battery_power_w, grid_power_w, load_power_w, battery_soc_pct, device_state')
    .eq('system_id', systemId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true })
  if (until) q = q.lt('recorded_at', until)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
