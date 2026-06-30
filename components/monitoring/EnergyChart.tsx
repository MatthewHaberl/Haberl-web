'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Brush,
} from 'recharts'
import {
  ChevronLeft, ChevronRight, LineChart as LineIcon, BarChart3,
  Maximize2, Minimize2, Sun, BatteryCharging, Plug, Home,
} from 'lucide-react'

interface Reading {
  recorded_at: string
  pv_power_w: number | null
  battery_power_w: number | null
  grid_power_w: number | null
  load_power_w: number | null
  battery_soc_pct?: number | null
}

interface ChartPoint {
  time: string
  solar: number
  battery: number
  grid: number
  load: number
  soc: number | null
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

interface SeriesStat { min: number | null; max: number | null }
interface RangeSummary {
  count: number
  solar: SeriesStat & { total_kwh: number }
  load: SeriesStat & { total_kwh: number }
  battery: SeriesStat & { charge_kwh: number; discharge_kwh: number }
  grid: SeriesStat & { import_kwh: number; export_kwh: number }
  soc: SeriesStat
}

// Minimal shapes of the recharts callback payloads we read (avoids internals).
interface ChartMouseState { activeCoordinate?: { x: number; y: number } }
interface LegendPayload { dataKey?: unknown }

const SAST_MS = 2 * 60 * 60 * 1000
/** Today's date in SAST (the fleet's timezone), YYYY-MM-DD — browser-tz-independent. */
function todaySast() { return new Date(Date.now() + SAST_MS).toISOString().slice(0, 10) }
/** Shift a YYYY-MM-DD by whole days. */
function addDays(day: string, delta: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
/** Never let a YYYY-MM-DD exceed `max` (string compare is valid for ISO dates). */
function clampMax(day: string, max: string) { return day > max ? max : day }

function formatTime(iso: string, hours: number) {
  const d = new Date(iso)
  if (hours <= 24) {
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}
function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

/** Whole watts — no kW rounding, so small loads aren't lost to 0.1 kW steps. */
function toW(w: number | null) { return Math.round(w ?? 0) }

/** Summary-table cell formatters. */
function fmtW(v: number | null) { return v == null ? '—' : `${v.toLocaleString('en-ZA')} W` }
function fmtPct(v: number | null) { return v == null ? '—' : `${v}%` }
function fmtKwh(v: number) { return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} kWh` }

/** Range-summary block, styled to match the live-flow gauges: big total up top,
 * min (bottom-left) and max (bottom-right) along the footer. */
function SummaryCard({
  label, icon: Icon, color, children, min, max, unit = 'W',
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  children: React.ReactNode
  min: number | null
  max: number | null
  unit?: 'W' | '%'
}) {
  const fmt = unit === '%' ? fmtPct : fmtW
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className={`tabular-nums ${color}`}>{children}</div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
        <span>Min <span className="font-semibold tabular-nums text-foreground">{fmt(min)}</span></span>
        <span>Max <span className="font-semibold tabular-nums text-foreground">{fmt(max)}</span></span>
      </div>
    </div>
  )
}

interface Props {
  systemId: string
  hours?: number
}

const RANGES: { label: string; hours: number }[] = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]

const SIZES = { S: 240, M: 380, L: 560 } as const
type SizeKey = keyof typeof SIZES

const LINE_SERIES: { key: string; name: string; color: string; axis: 'left' | 'right'; fill: string; dash?: string }[] = [
  { key: 'solar',   name: 'Solar',   color: '#eab308', axis: 'left',  fill: 'url(#solar)' },
  { key: 'load',    name: 'Load',    color: '#a855f7', axis: 'left',  fill: 'url(#load)' },
  { key: 'battery', name: 'Battery', color: '#22c55e', axis: 'left',  fill: 'none', dash: '4 2' },
  { key: 'grid',    name: 'Grid',    color: '#3b82f6', axis: 'left',  fill: 'none', dash: '4 2' },
  { key: 'soc',     name: 'SOC',     color: '#06b6d4', axis: 'right', fill: 'none' },
]

const BAR_SERIES: { key: string; name: string; color: string }[] = [
  { key: 'production_kwh',        name: 'Production',     color: '#eab308' },
  { key: 'consumption_kwh',       name: 'Consumption',   color: '#a855f7' },
  { key: 'grid_import_kwh',       name: 'Grid import',   color: '#3b82f6' },
  { key: 'grid_export_kwh',       name: 'Grid export',   color: '#06b6d4' },
  { key: 'battery_charge_kwh',    name: 'Batt charge',   color: '#22c55e' },
  { key: 'battery_discharge_kwh', name: 'Batt discharge', color: '#f97316' },
]

// Daily battery SoC range — plotted as lines on a right-hand % axis over the bars.
const BAR_SOC_SERIES: { key: string; name: string; color: string; dash?: string }[] = [
  { key: 'soc_max', name: 'Batt max %', color: '#0891b2' },
  { key: 'soc_min', name: 'Batt min %', color: '#0ea5e9', dash: '4 2' },
]

export function EnergyChart({ systemId, hours: initialHours = 24 }: Props) {
  const [hours, setHours] = useState(initialHours)
  const [view, setView] = useState<'line' | 'bar'>('line')
  const [anchor, setAnchor] = useState(todaySast)  // 24h: the day; 7d/30d: window end day
  const [data, setData] = useState<ChartPoint[]>([])
  const [daily, setDaily] = useState<DailyTotal[]>([])
  const [summary, setSummary] = useState<RangeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | undefined>(undefined)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [size, setSize] = useState<SizeKey>('M')
  const [fullscreen, setFullscreen] = useState(false)

  const today = todaySast()
  const windowDays = Math.round(hours / 24)
  const stepDays = hours === 24 ? 1 : windowDays
  const atToday = anchor === today
  const showBars = hours > 24 && view === 'bar'

  // Switch range: sensible default view, reset window to "latest".
  function selectRange(h: number) {
    setHours(h)
    setView(h >= 24 * 30 ? 'bar' : 'line')
    setAnchor(today)
  }

  function toggleSeries(key: string) {
    if (!key) return
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Exit fullscreen on Escape.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  useEffect(() => {
    setLoading(true)
    if (showBars) {
      fetch(`/api/monitoring/readings?systemId=${systemId}&dailyTotals=1&days=${windowDays}&end=${anchor}`)
        .then((r) => r.json())
        .then((d: DailyTotal[]) => setDaily(Array.isArray(d) ? d : []))
        .finally(() => setLoading(false))
      return
    }
    // Line view. 24h "today" keeps the live rolling window; otherwise anchor a
    // single day (24h) or an N-day window ending on `anchor` (7d/30d).
    const qs = hours === 24
      ? (atToday ? `hours=24` : `day=${anchor}`)
      : `days=${windowDays}&end=${anchor}`
    fetch(`/api/monitoring/readings?systemId=${systemId}&${qs}`)
      .then((r) => r.json())
      .then((readings: Reading[]) => {
        setData(
          (Array.isArray(readings) ? readings : []).map((r) => ({
            time: formatTime(r.recorded_at, hours),
            solar:   toW(r.pv_power_w),
            battery: toW(r.battery_power_w),
            grid:    toW(r.grid_power_w),
            load:    toW(r.load_power_w),
            soc:     r.battery_soc_pct ?? null,
          }))
        )
      })
      .finally(() => setLoading(false))
  }, [systemId, hours, view, anchor, atToday, showBars, windowDays])

  // Range-summary roll-up (totals + peaks for the selected window). View-independent:
  // the same figures back both the line and totals views.
  useEffect(() => {
    const qs = hours === 24
      ? (atToday ? `hours=24` : `day=${anchor}`)
      : `days=${windowDays}&end=${anchor}`
    let cancelled = false
    fetch(`/api/monitoring/readings?systemId=${systemId}&summary=1&${qs}`)
      .then((r) => r.json())
      .then((s: RangeSummary | { error: string }) => {
        if (!cancelled) setSummary('count' in s ? s : null)
      })
      .catch(() => { if (!cancelled) setSummary(null) })
    return () => { cancelled = true }
  }, [systemId, hours, anchor, atToday, windowDays])

  // ── Controls row ───────────────────────────────────────────────────────
  const rangeButtons = (
    <div className="flex gap-1">
      {RANGES.map((r) => (
        <button
          key={r.label}
          onClick={() => selectRange(r.hours)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            hours === r.hours ? 'bg-foreground text-background' : 'border border-border hover:bg-muted'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )

  const dateControls = (
    <div className="flex items-center gap-1">
      <button
        type="button" aria-label="Earlier"
        onClick={() => setAnchor((a) => addDays(a, -stepDays))}
        className="rounded-md border border-border p-1 hover:bg-muted"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date" value={anchor} max={today}
        onChange={(e) => { if (e.target.value) setAnchor(clampMax(e.target.value, today)) }}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      />
      <button
        type="button" aria-label="Later" disabled={atToday}
        onClick={() => setAnchor((a) => clampMax(addDays(a, stepDays), today))}
        className="rounded-md border border-border p-1 hover:bg-muted disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )

  const viewToggle = hours > 24 && (
    <div className="flex gap-1">
      <button
        type="button" onClick={() => setView('line')}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          view === 'line' ? 'bg-foreground text-background' : 'border border-border hover:bg-muted'
        }`}
      >
        <LineIcon className="h-3.5 w-3.5" /> Line
      </button>
      <button
        type="button" onClick={() => setView('bar')}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          view === 'bar' ? 'bg-foreground text-background' : 'border border-border hover:bg-muted'
        }`}
      >
        <BarChart3 className="h-3.5 w-3.5" /> Totals
      </button>
    </div>
  )

  const sizeControl = !fullscreen && (
    <div className="flex gap-1">
      {(Object.keys(SIZES) as SizeKey[]).map((s) => (
        <button
          key={s} type="button" onClick={() => setSize(s)}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            size === s ? 'bg-foreground text-background' : 'border border-border hover:bg-muted'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  )

  const fullscreenButton = (
    <button
      type="button" aria-label="Toggle fullscreen"
      onClick={() => setFullscreen((f) => !f)}
      className="rounded-md border border-border p-1.5 hover:bg-muted"
    >
      {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  )

  const controls = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      {rangeButtons}
      <div className="flex flex-wrap items-center gap-2">
        {dateControls}
        {viewToggle}
        {sizeControl}
        {fullscreenButton}
      </div>
    </div>
  )

  // Make the tooltip follow the cursor on both axes (x snaps to the point, y to
  // the pointer) so it doesn't stay pinned under the large filled areas.
  const trackTip = (s: ChartMouseState) => {
    if (s?.activeCoordinate) setTipPos({ x: s.activeCoordinate.x, y: s.activeCoordinate.y })
  }
  const clearTip = () => setTipPos(undefined)

  const tooltipCommon = {
    position: tipPos,
    allowEscapeViewBox: { x: false as const, y: true as const },
    // Translucent + blurred so the labels stay readable but you can still see
    // the graph trending behind the box.
    contentStyle: {
      background: 'hsl(var(--card) / 0.78)',
      backdropFilter: 'blur(3px)',
      WebkitBackdropFilter: 'blur(3px)',
      border: '1px solid hsl(var(--border) / 0.6)',
      borderRadius: '8px',
      fontSize: 12,
      boxShadow: '0 2px 10px hsl(var(--foreground) / 0.12)',
    },
    wrapperStyle: { zIndex: 50 },
  }

  // Click a legend entry to hide/show that series; hidden entries dim.
  const legendCommon = {
    wrapperStyle: { fontSize: 12, cursor: 'pointer' },
    onClick: (o: LegendPayload) => toggleSeries(String(o?.dataKey ?? '')),
    formatter: (value: string, entry: unknown) => {
      const key = String((entry as LegendPayload)?.dataKey ?? '')
      return <span style={{ opacity: hidden.has(key) ? 0.35 : 1 }}>{value}</span>
    },
  }

  const chartHeight = fullscreen ? ('100%' as const) : SIZES[size]
  const empty = showBars ? daily.length === 0 : data.length === 0
  const emptyMsg = !atToday
    ? (hours === 24 ? `No readings for ${formatDay(anchor)}.` : `No readings for this ${windowDays}-day window.`)
    : 'No readings in this window — import history below to fill it in.'

  const barChart = (
    <ComposedChart data={daily} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} onMouseMove={trackTip} onMouseLeave={clearTip}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
      <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit=" kWh" width={56} />
      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} width={40} />
      <Tooltip
        {...tooltipCommon}
        labelFormatter={(d) => formatDay(String(d))}
        formatter={(val, name) =>
          typeof name === 'string' && name.includes('%')
            ? [`${Number(val).toLocaleString('en-ZA')}%`, name]
            : [`${Number(val).toLocaleString('en-ZA')} kWh`, name]
        }
      />
      <Legend {...legendCommon} />
      {BAR_SERIES.map((s) => (
        <Bar key={s.key} yAxisId="left" dataKey={s.key} name={s.name} fill={s.color} radius={[2, 2, 0, 0]} hide={hidden.has(s.key)} />
      ))}
      {BAR_SOC_SERIES.map((s) => (
        <Line
          key={s.key} yAxisId="right" type="monotone" dataKey={s.key} name={s.name}
          stroke={s.color} strokeWidth={1.5} dot={false} connectNulls
          strokeDasharray={s.dash} hide={hidden.has(s.key)}
        />
      ))}
      <Brush dataKey="day" height={16} travellerWidth={8} stroke="hsl(var(--muted-foreground))" tickFormatter={formatDay} />
    </ComposedChart>
  )

  const lineChart = (
    <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} onMouseMove={trackTip} onMouseLeave={clearTip}>
      <defs>
        <linearGradient id="solar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor="#eab308" stopOpacity={0.22} />
          <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="load" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.18} />
          <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
      <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit=" W" tickFormatter={(v) => Number(v).toLocaleString('en-ZA')} width={56} />
      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} width={40} />
      <Tooltip
        {...tooltipCommon}
        formatter={(val, name) =>
          name === 'SOC'
            ? [`${Number(val).toLocaleString('en-ZA')}%`, name]
            : [`${Number(val).toLocaleString('en-ZA')} W`, name]
        }
      />
      <Legend {...legendCommon} />
      {LINE_SERIES.map((s) => (
        <Area
          key={s.key} yAxisId={s.axis} type="monotone" dataKey={s.key} name={s.name}
          stroke={s.color} fill={s.fill} strokeWidth={1.5} dot={false}
          strokeDasharray={s.dash} connectNulls={s.key === 'soc'} hide={hidden.has(s.key)}
        />
      ))}
      <Brush dataKey="time" height={18} travellerWidth={8} stroke="hsl(var(--muted-foreground))" />
    </AreaChart>
  )

  // Totals + peaks for the selected range, as gauge-style blocks mirroring the
  // live power flow above. Total up top; min/max along the footer.
  const summaryCards = summary && summary.count > 0 && (
    <div className="mb-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Solar generation" icon={Sun} color="text-yellow-500" min={summary.solar.min} max={summary.solar.max}>
          <span className="text-2xl font-bold">{fmtKwh(summary.solar.total_kwh)}</span>
          <span className="ml-1 text-xs font-medium text-muted-foreground">produced</span>
        </SummaryCard>

        <SummaryCard label="Battery" icon={BatteryCharging} color="text-green-500" min={summary.battery.min} max={summary.battery.max}>
          <div className="text-lg font-bold leading-tight">{fmtKwh(summary.battery.charge_kwh)} <span className="text-xs font-medium text-muted-foreground">charged</span></div>
          <div className="text-lg font-bold leading-tight">{fmtKwh(summary.battery.discharge_kwh)} <span className="text-xs font-medium text-muted-foreground">discharged</span></div>
          {(summary.soc.min != null || summary.soc.max != null) && (
            <div className="text-xs font-medium text-muted-foreground">SOC {fmtPct(summary.soc.min)} – {fmtPct(summary.soc.max)}</div>
          )}
        </SummaryCard>

        <SummaryCard label="Grid" icon={Plug} color="text-blue-500" min={summary.grid.min} max={summary.grid.max}>
          <div className="text-lg font-bold leading-tight">{fmtKwh(summary.grid.import_kwh)} <span className="text-xs font-medium text-muted-foreground">imported</span></div>
          <div className="text-lg font-bold leading-tight">{fmtKwh(summary.grid.export_kwh)} <span className="text-xs font-medium text-muted-foreground">exported</span></div>
        </SummaryCard>

        <SummaryCard label="Load consumption" icon={Home} color="text-purple-500" min={summary.load.min} max={summary.load.max}>
          <span className="text-2xl font-bold">{fmtKwh(summary.load.total_kwh)}</span>
          <span className="ml-1 text-xs font-medium text-muted-foreground">consumed</span>
        </SummaryCard>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        Totals and peaks for the selected range. Min/max are instantaneous power; negative is export (grid) or discharge (battery).
      </p>
    </div>
  )

  return (
    <div className={fullscreen ? 'fixed inset-0 z-[60] flex flex-col gap-1 bg-background p-4' : ''}>
      {controls}
      {!fullscreen && summaryCards}
      {loading ? (
        <div className="flex h-48 flex-1 items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
      ) : empty ? (
        <div className="flex h-48 flex-1 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          {emptyMsg}
        </div>
      ) : (
        <div className={fullscreen ? 'min-h-0 flex-1' : ''}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            {showBars ? barChart : lineChart}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
