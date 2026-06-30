import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * GET /api/monitoring/readings
 * ?systemId=...&latest=true        → single latest reading
 * ?systemId=...&hours=24           → last N hours of readings (rolling window)
 * ?systemId=...&day=2026-03-01     → one SAST calendar day of readings
 * ?systemId=...&days=7&end=2026-03-07 → readings for an N-day SAST window ending on `end`
 * ?systemId=...&dailyTotals=1&days=7&end=... → per-day kWh totals for that window
 * All multi-row modes paginate past PostgREST's ~1,000-row response cap.
 */

// Haberl's fleet is all South Africa: SAST is a fixed UTC+02:00, no DST.
const SAST_MS = 2 * 60 * 60 * 1000

/** SAST calendar-day string (YYYY-MM-DD) for a UTC instant. */
function sastDay(ms: number): string {
  return new Date(ms + SAST_MS).toISOString().slice(0, 10)
}

/** UTC instant of SAST 00:00 on the given date (or today when null/invalid). */
function sastMidnightUtc(dateStr: string | null): number {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return Date.parse(`${dateStr}T00:00:00+02:00`)
  }
  const nowSast = new Date(Date.now() + SAST_MS)
  return Date.UTC(nowSast.getUTCFullYear(), nowSast.getUTCMonth(), nowSast.getUTCDate()) - SAST_MS
}

/** [since, until) covering `days` full SAST days ending on `end` (default today). */
function windowFromDaysEnd(days: number, end: string | null): { since: string; until: string } {
  const endMidnight = sastMidnightUtc(end)
  return {
    since: new Date(endMidnight - (days - 1) * 86_400_000).toISOString(),
    until: new Date(endMidnight + 86_400_000).toISOString(),
  }
}

type ReadingsClient = Awaited<ReturnType<typeof createClient>>

/**
 * Fetch every reading in [since, until) by paging through `.range()`.
 * PostgREST caps a single response (~1,000 rows on this project), so a 30-day
 * window (~8,640 rows at 5-min resolution) must be paginated, not just `.limit()`-ed.
 * Advancing by the actual page length is safe whatever the server cap is.
 */
async function fetchAllReadings(
  supabase: ReadingsClient,
  systemId: string,
  columns: string,
  since: string,
  until: string | null,
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000
  const all: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    let q = supabase
      .from('monitoring_readings')
      .select(columns)
      .eq('system_id', systemId)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (until) q = q.lt('recorded_at', until)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    all.push(...rows)
    if (rows.length === 0 || all.length >= 200_000) break
    from += rows.length
  }
  return all
}

interface AggReading {
  recorded_at: string
  pv_power_w: number | null
  load_power_w: number | null
  grid_power_w: number | null
  battery_power_w: number | null
  battery_soc_pct: number | null
}

interface DailyTotal {
  day: string
  production_kwh: number
  consumption_kwh: number
  grid_import_kwh: number
  grid_export_kwh: number
  battery_charge_kwh: number
  battery_discharge_kwh: number
  soc_min: number | null
  soc_max: number | null
}

// One reading as the line chart consumes it (also the unit of downsampling).
interface LineRow {
  id?: unknown
  recorded_at: string
  pv_power_w: number | null
  battery_power_w: number | null
  grid_power_w: number | null
  load_power_w: number | null
  battery_soc_pct: number | null
  device_state?: unknown
}

const LINE_NUM_KEYS = ['pv_power_w', 'battery_power_w', 'grid_power_w', 'load_power_w', 'battery_soc_pct'] as const

/**
 * Bucket-average a dense series down to ~`target` points so long ranges (7d/30d)
 * render — and the cursor tooltip keeps up — without shipping ~8,600 points.
 * Short ranges (≤ target) are returned untouched at full resolution.
 */
function downsampleLine(rows: LineRow[], target: number): LineRow[] {
  if (rows.length <= target) return rows
  const bucket = rows.length / target
  const out: LineRow[] = []
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * bucket)
    const end = Math.min(rows.length, Math.floor((i + 1) * bucket))
    if (end <= start) continue
    const slice = rows.slice(start, end)
    const mid = slice[Math.floor(slice.length / 2)]
    const agg: LineRow = {
      id: mid.id, recorded_at: mid.recorded_at, device_state: mid.device_state,
      pv_power_w: null, battery_power_w: null, grid_power_w: null, load_power_w: null, battery_soc_pct: null,
    }
    for (const k of LINE_NUM_KEYS) {
      let sum = 0, n = 0
      for (const r of slice) { const v = r[k]; if (typeof v === 'number') { sum += v; n++ } }
      agg[k] = n ? (k === 'battery_soc_pct' ? Math.round((sum / n) * 10) / 10 : Math.round(sum / n)) : null
    }
    out.push(agg)
  }
  return out
}

const LINE_TARGET_POINTS = 800

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
            grid_export_kwh: 0, battery_charge_kwh: 0, battery_discharge_kwh: 0,
            soc_min: null, soc_max: null }
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

  // Daily battery SoC range — separate pass so every reading counts (not just pairs).
  for (const r of rows) {
    if (r.battery_soc_pct == null) continue
    const d = get(sastDay(new Date(r.recorded_at).getTime()))
    d.soc_min = d.soc_min == null ? r.battery_soc_pct : Math.min(d.soc_min, r.battery_soc_pct)
    d.soc_max = d.soc_max == null ? r.battery_soc_pct : Math.max(d.soc_max, r.battery_soc_pct)
  }

  const round = (n: number) => Math.round(n * 100) / 100
  const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10)
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
      soc_min: round1(d.soc_min),
      soc_max: round1(d.soc_max),
    }))
}

interface SeriesStat { min: number | null; max: number | null }
interface RangeSummary {
  count: number
  solar: SeriesStat & { total_kwh: number }
  load: SeriesStat & { total_kwh: number }
  battery: SeriesStat & { charge_kwh: number; discharge_kwh: number }
  grid: SeriesStat & { import_kwh: number; export_kwh: number }
  soc: SeriesStat
}

/**
 * Whole-window roll-up for the range-summary table: peak min/max (W) per series
 * plus total energy (kWh). Energy is trapezoidally integrated at full resolution
 * (same gap-aware method as `dailyTotals`) so totals and peaks are exact — this
 * runs on the raw rows, before the line chart's 800-point downsample.
 * Sign convention: grid +import/−export, battery +charge/−discharge; min/max are
 * over the signed series, so grid.max = peak import and grid.min = peak export.
 */
function windowSummary(rows: AggReading[]): RangeSummary {
  const solar: SeriesStat = { min: null, max: null }
  const load: SeriesStat = { min: null, max: null }
  const battery: SeriesStat = { min: null, max: null }
  const grid: SeriesStat = { min: null, max: null }
  const soc: SeriesStat = { min: null, max: null }
  const upd = (s: SeriesStat, v: number | null) => {
    if (v == null) return
    s.min = s.min == null ? v : Math.min(s.min, v)
    s.max = s.max == null ? v : Math.max(s.max, v)
  }
  for (const r of rows) {
    upd(solar, r.pv_power_w)
    upd(load, r.load_power_w)
    upd(battery, r.battery_power_w)
    upd(grid, r.grid_power_w)
    upd(soc, r.battery_soc_pct)
  }

  let production = 0, consumption = 0, gridImport = 0, gridExport = 0, battCharge = 0, battDischarge = 0
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    const dtH = (new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()) / 3_600_000
    if (!(dtH > 0) || dtH > 1) continue // skip zero/negative steps and >1h gaps
    const area = (v1: number, v2: number) => ((v1 + v2) / 2) * dtH / 1000
    const pos = (v: number | null) => Math.max(v ?? 0, 0)
    const neg = (v: number | null) => Math.max(-(v ?? 0), 0)
    production    += area(pos(a.pv_power_w),      pos(b.pv_power_w))
    consumption   += area(pos(a.load_power_w),    pos(b.load_power_w))
    gridImport    += area(pos(a.grid_power_w),    pos(b.grid_power_w))
    gridExport    += area(neg(a.grid_power_w),    neg(b.grid_power_w))
    battCharge    += area(pos(a.battery_power_w), pos(b.battery_power_w))
    battDischarge += area(neg(a.battery_power_w), neg(b.battery_power_w))
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  const rW = (n: number | null) => (n == null ? null : Math.round(n))
  const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10)
  return {
    count: rows.length,
    solar:   { min: rW(solar.min),   max: rW(solar.max),   total_kwh: r2(production) },
    load:    { min: rW(load.min),    max: rW(load.max),    total_kwh: r2(consumption) },
    battery: { min: rW(battery.min), max: rW(battery.max), charge_kwh: r2(battCharge), discharge_kwh: r2(battDischarge) },
    grid:    { min: rW(grid.min),    max: rW(grid.max),    import_kwh: r2(gridImport), export_kwh: r2(gridExport) },
    soc:     { min: r1(soc.min),     max: r1(soc.max) },
  }
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
    const { since, until } = windowFromDaysEnd(days, searchParams.get('end'))
    try {
      const rows = await fetchAllReadings(
        supabase, systemId,
        'recorded_at, pv_power_w, load_power_w, grid_power_w, battery_power_w, battery_soc_pct',
        since, until,
      )
      return NextResponse.json(dailyTotals(rows as unknown as AggReading[]))
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  // ── A single SAST day, an N-day SAST window, or a rolling N-hour window ─
  const day = searchParams.get('day')
  const daysParam = searchParams.get('days')
  let since: string
  let until: string | null = null
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const start = sastMidnightUtc(day)
    since = new Date(start).toISOString()
    until = new Date(start + 86_400_000).toISOString()
  } else if (daysParam) {
    const n = Math.min(Math.max(parseInt(daysParam, 10) || 1, 1), 90)
    const w = windowFromDaysEnd(n, searchParams.get('end'))
    since = w.since
    until = w.until
  } else {
    const hours = parseInt(searchParams.get('hours') ?? '24', 10)
    since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  }

  // ── Whole-window roll-up (range-summary table) ────────────────────────
  if (searchParams.get('summary')) {
    try {
      const rows = await fetchAllReadings(
        supabase, systemId,
        'recorded_at, pv_power_w, battery_power_w, grid_power_w, load_power_w, battery_soc_pct',
        since, until,
      )
      return NextResponse.json(windowSummary(rows as unknown as AggReading[]))
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  try {
    const rows = await fetchAllReadings(
      supabase, systemId,
      'id, recorded_at, pv_power_w, battery_power_w, grid_power_w, load_power_w, battery_soc_pct, device_state',
      since, until,
    )
    return NextResponse.json(downsampleLine(rows as unknown as LineRow[], LINE_TARGET_POINTS))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
