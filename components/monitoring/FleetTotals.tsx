'use client'

/**
 * Fleet-wide energy totals for a date range — the "all installations" version of
 * the per-system Power history card. Totals, a daily stacked bar chart, and a
 * per-site breakdown, all served by /api/monitoring/fleet-totals (which is
 * RLS-scoped, so this component is safe on a customer page too).
 */

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Sun, Home, Plug, BatteryCharging, Gauge, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface Energy {
  production_kwh: number
  consumption_kwh: number
  grid_import_kwh: number
  grid_export_kwh: number
  battery_charge_kwh: number
  battery_discharge_kwh: number
}

interface SystemTotals extends Energy {
  system_id: string
  site_name: string | null
  customer_name: string | null
  label: string | null
  brand: string
  capacity_kw: number | null
  battery_kwh: number | null
  enabled: boolean
  readings: number
  pv_peak_w: number | null
}

interface FleetTotalsResponse {
  start: string
  end: string
  days: number
  systems_reporting: number
  systems_total: number
  totals: Energy & { pv_peak_w: number | null; load_peak_w: number | null }
  daily: Array<{ day: string } & Energy>
  by_system: SystemTotals[]
}

const SAST_MS = 2 * 60 * 60 * 1000
/** Today in SAST (the fleet's timezone) — independent of the browser's zone. */
function todaySast() { return new Date(Date.now() + SAST_MS).toISOString().slice(0, 10) }
function addDays(day: string, delta: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
function startOfMonth(day: string) { return `${day.slice(0, 7)}-01` }
function endOfMonth(day: string) {
  const d = new Date(`${startOfMonth(day)}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return addDays(d.toISOString().slice(0, 10), -1)
}
function clampMax(day: string, max: string) { return day > max ? max : day }

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}
function kwh(v: number) {
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: v >= 100 ? 0 : 1 })} kWh`
}

/** Range presets. Each returns [start, end] in SAST calendar days. */
const PRESETS: Array<{ label: string; range: (today: string) => [string, string] }> = [
  { label: 'Today',      range: (t) => [t, t] },
  { label: '7d',         range: (t) => [addDays(t, -6), t] },
  { label: '30d',        range: (t) => [addDays(t, -29), t] },
  { label: 'This month', range: (t) => [startOfMonth(t), t] },
  { label: 'Last month', range: (t) => {
      const lastMonthDay = addDays(startOfMonth(t), -1)
      return [startOfMonth(lastMonthDay), endOfMonth(lastMonthDay)]
    } },
  { label: 'This year',  range: (t) => [`${t.slice(0, 4)}-01-01`, t] },
]

const BAR_SERIES: Array<{ key: keyof Energy; name: string; color: string }> = [
  { key: 'production_kwh',        name: 'Solar',          color: '#eab308' },
  { key: 'consumption_kwh',       name: 'Consumption',    color: '#a855f7' },
  { key: 'grid_import_kwh',       name: 'Grid import',    color: '#3b82f6' },
  { key: 'grid_export_kwh',       name: 'Grid export',    color: '#06b6d4' },
  { key: 'battery_charge_kwh',    name: 'Batt charge',    color: '#22c55e' },
  { key: 'battery_discharge_kwh', name: 'Batt discharge', color: '#f97316' },
]

interface TipEntry { name?: string; value?: number | string | null; color?: string }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TipEntry[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((e) => e.value != null)
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 font-semibold text-foreground">{formatDay(String(label))}</div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
        {rows.map((e, i) => (
          <Fragment key={i}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
            <span className="text-muted-foreground">{e.name}</span>
            <span className="text-right font-semibold tabular-nums text-foreground">{kwh(Number(e.value))}</span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function Kpi({ label, icon: Icon, color, value, footer }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  value: string
  footer?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {footer && <div className="mt-auto border-t border-border/60 pt-2 text-xs text-muted-foreground">{footer}</div>}
    </div>
  )
}

export function FleetTotals() {
  const today = todaySast()
  const [start, setStart] = useState(() => addDays(todaySast(), -6))
  const [end, setEnd] = useState(today)
  const [data, setData] = useState<FleetTotalsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const [s, e] = preset.range(today)
    setStart(s)
    setEnd(e)
  }

  const activePreset = PRESETS.find((p) => {
    const [s, e] = p.range(today)
    return s === start && e === end
  })?.label

  useEffect(() => {
    // `loading` tracks the fetch below, so it can't be derived during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- entering the loading state for the fetch started below
    setLoading(true)
    let cancelled = false
    fetch(`/api/monitoring/fleet-totals?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((json: FleetTotalsResponse | { error: string }) => {
        if (cancelled) return
        if ('error' in json) { setError(json.error); setData(null) }
        else { setError(null); setData(json) }
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end])

  const toggleSeries = useCallback((key: string) => {
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const t = data?.totals
  // Self-sufficiency: the share of what the fleet consumed that did NOT come
  // off the grid (solar direct + battery discharge), which is the number that
  // actually maps to money not paid to the utility.
  const selfSufficiency = t && t.consumption_kwh > 0
    ? Math.max(0, Math.min(100, ((t.consumption_kwh - t.grid_import_kwh) / t.consumption_kwh) * 100))
    : null
  const dailyAvg = data && data.days > 0 && t ? t.production_kwh / data.days : null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Fleet energy totals</CardTitle>
            <CardDescription>
              Every monitored installation added together
              {data && ` · ${data.systems_reporting} of ${data.systems_total} systems reported in this range`}
            </CardDescription>
          </div>
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Range presets + explicit start/end pickers */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  activePreset === p.label ? 'bg-foreground text-background' : 'border border-border hover:bg-muted'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="date" aria-label="From" value={start} max={end}
              onChange={(e) => { if (e.target.value) setStart(clampMax(e.target.value, end)) }}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            />
            <span>to</span>
            <input
              type="date" aria-label="To" value={end} min={start} max={today}
              onChange={(e) => {
                if (!e.target.value) return
                const next = clampMax(e.target.value, today)
                setEnd(next)
                if (next < start) setStart(next)
              }}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Could not load fleet totals: {error}
          </p>
        )}

        {t && (
          <>
            {/* Totals for the selected range */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Kpi
                label="Solar produced" icon={Sun} color="text-yellow-500"
                value={kwh(t.production_kwh)}
                footer={dailyAvg != null && <>Avg <span className="font-semibold text-foreground">{kwh(dailyAvg)}</span> / day</>}
              />
              <Kpi
                label="Consumption" icon={Home} color="text-purple-500"
                value={kwh(t.consumption_kwh)}
                footer={t.load_peak_w != null && <>Peak <span className="font-semibold text-foreground">{(t.load_peak_w / 1000).toFixed(1)} kW</span></>}
              />
              <Kpi
                label="From grid" icon={Plug} color="text-blue-500"
                value={kwh(t.grid_import_kwh)}
                footer={<>Exported <span className="font-semibold text-foreground">{kwh(t.grid_export_kwh)}</span></>}
              />
              <Kpi
                label="Battery cycled" icon={BatteryCharging} color="text-green-500"
                value={kwh(t.battery_discharge_kwh)}
                footer={<>Charged <span className="font-semibold text-foreground">{kwh(t.battery_charge_kwh)}</span></>}
              />
              <Kpi
                label="Self-sufficiency" icon={Gauge} color="text-accent"
                value={selfSufficiency == null ? '—' : `${selfSufficiency.toFixed(0)}%`}
                footer={<>of consumption not bought from the grid</>}
              />
            </div>

            {/* Daily fleet totals */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
                  <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11 }} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11 }} width={52} unit=" kWh" />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, cursor: 'pointer' }}
                    onClick={(o: { dataKey?: unknown }) => toggleSeries(String(o?.dataKey ?? ''))}
                  />
                  {BAR_SERIES.map((s) => (
                    <Bar
                      key={s.key} dataKey={s.key} name={s.name} fill={s.color}
                      hide={hidden.has(s.key)} radius={[2, 2, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Per-site breakdown */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Site</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Solar</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Consumption</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">From grid</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">To grid</th>
                    <th className="hidden md:table-cell px-3 py-2 text-right font-medium text-muted-foreground">Batt out</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Self-suff.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_system.map((s) => {
                    const ss = s.consumption_kwh > 0
                      ? Math.max(0, Math.min(100, ((s.consumption_kwh - s.grid_import_kwh) / s.consumption_kwh) * 100))
                      : null
                    return (
                      <tr key={s.system_id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <a href={`/portal/employee/monitoring/${s.system_id}`} className="font-medium hover:underline">
                            {s.site_name ?? s.label ?? 'Unnamed system'}
                          </a>
                          {s.customer_name && <p className="text-xs text-muted-foreground">{s.customer_name}</p>}
                          {s.readings === 0 && <p className="text-xs text-muted-foreground">No data in this range</p>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{kwh(s.production_kwh)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{kwh(s.consumption_kwh)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{kwh(s.grid_import_kwh)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{kwh(s.grid_export_kwh)}</td>
                        <td className="hidden md:table-cell px-3 py-2 text-right font-mono tabular-nums">{kwh(s.battery_discharge_kwh)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{ss == null ? '—' : `${ss.toFixed(0)}%`}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-3 py-2">Fleet total</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{kwh(t.production_kwh)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{kwh(t.consumption_kwh)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{kwh(t.grid_import_kwh)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{kwh(t.grid_export_kwh)}</td>
                    <td className="hidden md:table-cell px-3 py-2 text-right font-mono tabular-nums">{kwh(t.battery_discharge_kwh)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{selfSufficiency == null ? '—' : `${selfSufficiency.toFixed(0)}%`}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Totals are integrated from the stored 5-minute readings over SAST calendar days; gaps longer than an hour
              are skipped rather than filled in, so a site that stopped reporting under-reports for that period.
            </p>
          </>
        )}

        {!t && !error && !loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">No readings in this range.</p>
        )}
      </CardContent>
    </Card>
  )
}
