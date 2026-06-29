'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { ChevronLeft, ChevronRight, LineChart as LineIcon, BarChart3 } from 'lucide-react'

interface Reading {
  recorded_at: string
  pv_power_w: number | null
  battery_power_w: number | null
  grid_power_w: number | null
  load_power_w: number | null
}

interface ChartPoint {
  time: string
  solar: number
  battery: number
  grid: number
  load: number
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

// Minimal shape of the recharts mouse-state we read (avoids importing internals).
interface ChartMouseState { activeCoordinate?: { x: number; y: number } }

const SAST_MS = 2 * 60 * 60 * 1000
/** Today's date in SAST (the fleet's timezone), YYYY-MM-DD — browser-tz-independent. */
function todaySast() { return new Date(Date.now() + SAST_MS).toISOString().slice(0, 10) }
/** Shift a YYYY-MM-DD by whole days. */
function addDays(day: string, delta: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

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

interface Props {
  systemId: string
  hours?: number
}

const RANGES: { label: string; hours: number }[] = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]

const BAR_SERIES: { key: keyof Omit<DailyTotal, 'day'>; name: string; color: string }[] = [
  { key: 'production_kwh',        name: 'Production',     color: '#eab308' },
  { key: 'consumption_kwh',       name: 'Consumption',   color: '#a855f7' },
  { key: 'grid_import_kwh',       name: 'Grid import',   color: '#3b82f6' },
  { key: 'grid_export_kwh',       name: 'Grid export',   color: '#06b6d4' },
  { key: 'battery_charge_kwh',    name: 'Batt charge',   color: '#22c55e' },
  { key: 'battery_discharge_kwh', name: 'Batt discharge', color: '#f97316' },
]

export function EnergyChart({ systemId, hours: initialHours = 24 }: Props) {
  const [hours, setHours] = useState(initialHours)
  const [view, setView] = useState<'line' | 'bar'>('line')
  const [day, setDay] = useState(todaySast)
  const [data, setData] = useState<ChartPoint[]>([])
  const [daily, setDaily] = useState<DailyTotal[]>([])
  const [loading, setLoading] = useState(true)
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | undefined>(undefined)

  const today = todaySast()
  const isToday = day === today
  const showBars = hours > 24 && view === 'bar'

  // Switch range: pick a sensible default view and reset the 24h day.
  function selectRange(h: number) {
    setHours(h)
    setView(h >= 24 * 30 ? 'bar' : 'line')
    setDay(today)
  }

  useEffect(() => {
    setLoading(true)
    if (showBars) {
      fetch(`/api/monitoring/readings?systemId=${systemId}&dailyTotals=1&days=${Math.round(hours / 24)}`)
        .then((r) => r.json())
        .then((d: DailyTotal[]) => setDaily(Array.isArray(d) ? d : []))
        .finally(() => setLoading(false))
      return
    }
    // Line view. For 24h, a past day uses ?day=; today keeps the rolling window.
    const qs = hours === 24 && !isToday
      ? `day=${day}`
      : `hours=${hours}`
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
          }))
        )
      })
      .finally(() => setLoading(false))
  }, [systemId, hours, view, day, isToday, showBars])

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

  const dateControls = hours === 24 && (
    <div className="flex items-center gap-1">
      <button
        type="button" aria-label="Previous day"
        onClick={() => setDay((d) => addDays(d, -1))}
        className="rounded-md border border-border p-1 hover:bg-muted"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date" value={day} max={today}
        onChange={(e) => { if (e.target.value) setDay(e.target.value) }}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      />
      <button
        type="button" aria-label="Next day" disabled={isToday}
        onClick={() => setDay((d) => addDays(d, 1))}
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

  const controls = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      {rangeButtons}
      <div className="flex flex-wrap items-center gap-2">
        {dateControls}
        {viewToggle}
      </div>
    </div>
  )

  if (loading) {
    return <>{controls}<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Loading chart…</div></>
  }

  const empty = showBars ? daily.length === 0 : data.length === 0
  if (empty) {
    return (
      <>
        {controls}
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          {hours === 24 && !isToday
            ? `No readings for ${formatDay(day)}.`
            : 'No readings in this window — import history below to fill it in.'}
        </div>
      </>
    )
  }

  // Make the tooltip follow the cursor on both axes (x snaps to the point, y to
  // the pointer) so it doesn't stay pinned under the large filled areas.
  const trackTip = (s: ChartMouseState) => {
    if (s?.activeCoordinate) setTipPos({ x: s.activeCoordinate.x, y: s.activeCoordinate.y })
  }
  const clearTip = () => setTipPos(undefined)

  const tooltipCommon = {
    position: tipPos,
    allowEscapeViewBox: { x: false as const, y: true as const },
    contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 },
    wrapperStyle: { zIndex: 50 },
  }

  // ── Bar view: per-day kWh totals ───────────────────────────────────────
  if (showBars) {
    return (
      <>
        {controls}
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={daily} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} onMouseMove={trackTip} onMouseLeave={clearTip}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} unit=" kWh" width={56} />
            <Tooltip
              {...tooltipCommon}
              labelFormatter={(d) => formatDay(String(d))}
              formatter={(val, name) => [`${Number(val).toLocaleString('en-ZA')} kWh`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {BAR_SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </>
    )
  }

  // ── Line view: 5-minute power flow ─────────────────────────────────────
  return (
    <>
    {controls}
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} onMouseMove={trackTip} onMouseLeave={clearTip}>
        <defs>
          <linearGradient id="solar"   x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#eab308" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#eab308" stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="load"    x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#a855f7" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} unit=" W" tickFormatter={(v) => Number(v).toLocaleString('en-ZA')} width={56} />
        <Tooltip
          {...tooltipCommon}
          formatter={(val, name) => [`${Number(val).toLocaleString('en-ZA')} W`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="solar"   name="Solar"   stroke="#eab308" fill="url(#solar)"   strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="load"    name="Load"    stroke="#a855f7" fill="url(#load)"    strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="battery" name="Battery" stroke="#22c55e" fill="none"          strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Area type="monotone" dataKey="grid"    name="Grid"    stroke="#3b82f6" fill="none"          strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
    </>
  )
}
