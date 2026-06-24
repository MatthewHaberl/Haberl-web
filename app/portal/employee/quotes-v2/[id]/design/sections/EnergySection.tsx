'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  resolveEnergy, ENERGY_SOURCE_LABEL, seasonalMonthly, MONTH_LABELS,
  type CurvePreset, type EnergyMode,
} from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { SectionCard, NumberField, EmptyHint } from '../section-ui'

const TABS: Array<{ mode: EnergyMode; label: string }> = [
  { mode: 'daily', label: 'Daily' },
  { mode: 'weekly', label: 'Weekly' },
  { mode: 'monthly', label: 'Monthly' },
  { mode: 'annual', label: 'Annual' },
]

const PRESETS: Array<{ key: Exclude<CurvePreset, 'custom'>; label: string; hint: string }> = [
  { key: 'home_all_day', label: 'At home all day', hint: 'steady base, morning + evening' },
  { key: 'business_9_5', label: 'Business 9–5', hint: 'daytime heavy' },
  { key: 'evening_peak', label: 'Evening peak', hint: 'low day, strong evening' },
]

function SeasonalGraph({ avgMonthly }: { avgMonthly: number | null }) {
  if (!avgMonthly || avgMonthly <= 0) {
    return <EmptyHint>Enter a monthly figure above to see the seasonal spread across the year.</EmptyHint>
  }
  const months = seasonalMonthly(avgMonthly)
  const max = Math.max(...months, 1)
  const annual = months.reduce((a, b) => a + b, 0)
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 128 }}>
        {months.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[9px] text-muted-foreground mb-0.5">{v}</span>
            <div
              className="w-full rounded-t bg-primary/70"
              style={{ height: `${(v / max) * 100}%` }}
              title={`${MONTH_LABELS[i]}: ${v} kWh`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {MONTH_LABELS.map((m) => (
          <span key={m} className="flex-1 text-center text-[9px] text-muted-foreground">{m}</span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Estimated annual <strong className="text-foreground">{annual.toLocaleString('en-ZA')}</strong> kWh ·
        winter-heavy SA pattern (illustrative)
      </p>
    </div>
  )
}

/** Round a peak value up to a clean axis maximum (0.5, 1, 2, 5, 10…). */
function niceCeil(x: number): number {
  if (x <= 0) return 0.5
  const pow = Math.pow(10, Math.floor(Math.log10(x)))
  const n = x / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

/** Draggable 24-hour bar chart. Drag a bar up/down to set that hour's kW. */
function HourlyBarChart({ values, onSet }: { values: number[]; onSet: (hour: number, value: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const maxScale = useMemo(() => niceCeil(Math.max(...values, 0.5)), [values])

  const apply = useCallback((clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (r.bottom - clientY) / r.height))
    const hour = Math.min(23, Math.max(0, Math.floor(((clientX - r.left) / r.width) * 24)))
    onSet(hour, +(frac * maxScale).toFixed(2))
  }, [maxScale, onSet])

  useEffect(() => {
    if (!dragging) return
    const move = (ev: PointerEvent) => apply(ev.clientX, ev.clientY)
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [dragging, apply])

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono">{maxScale.toFixed(maxScale < 1 ? 2 : 1)} kW</span>
        <span>Drag the bars to shape the day</span>
      </div>
      <div
        ref={ref}
        onPointerDown={(ev) => { ev.preventDefault(); setDragging(true); apply(ev.clientX, ev.clientY) }}
        className="relative flex touch-none items-end gap-px rounded-md border border-border bg-muted/30 px-1 py-1 cursor-ns-resize"
        style={{ height: 150 }}
      >
        {/* midline guide */}
        <div className="pointer-events-none absolute inset-x-1 top-1/2 border-t border-dashed border-border/70" />
        {values.map((v, h) => {
          const frac = Math.min(1, v / maxScale)
          return (
            <div key={h} className="flex h-full flex-1 items-end" title={`${String(h).padStart(2, '0')}:00 — ${v.toFixed(2)} kW`}>
              <div
                className="w-full rounded-t bg-primary/70 transition-[height] hover:bg-primary"
                style={{ height: `${frac * 100}%`, minHeight: v > 0 ? 2 : 0 }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
      </div>
    </div>
  )
}

export function EnergySection() {
  const { design, dispatch, record } = useDesign()
  const e = design.energy
  const resolved = useMemo(() => resolveEnergy(e, record), [e, record])

  const gridValues = e.hourly ?? resolved.hourly ?? new Array(24).fill(0)

  function setCell(hour: number, value: number) {
    if (e.hourly == null) {
      const base = (resolved.hourly ?? new Array(24).fill(0)).slice()
      base[hour] = Math.max(0, value)
      dispatch({ type: 'setEnergy', patch: { hourly: base, curvePreset: 'custom' } })
    } else {
      dispatch({ type: 'setHour', hour, value })
    }
  }

  const monthlyForGraph = e.monthlyKwh && e.monthlyKwh > 0
    ? e.monthlyKwh
    : (resolved.dailyKwh != null ? resolved.dailyKwh * 30.4 : null)

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Energy demand"
        subtitle="Pick one way to enter usage — the others stay out of your way. Everything rolls up to a daily figure."
      >
        {/* Resolved readout + essential load */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">
              {resolved.dailyKwh != null ? resolved.dailyKwh.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">kWh/day · {ENERGY_SOURCE_LABEL[resolved.source]}</span>
          </div>
          <NumberField
            label="Essential (backup) load"
            suffix="kW"
            value={e.essentialLoadKw}
            onChange={(v) => dispatch({ type: 'setEnergy', patch: { essentialLoadKw: v } })}
            className="w-44"
          />
        </div>

        {/* Granularity tabs */}
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 mb-4">
          {TABS.map((t) => (
            <button
              key={t.mode}
              type="button"
              onClick={() => dispatch({ type: 'setEnergy', patch: { mode: t.mode } })}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                e.mode === t.mode ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mode-specific input */}
        {e.mode === 'daily' && (
          <div className="max-w-xs">
            <NumberField label="Daily usage" suffix="kWh/day" value={e.dailyKwh} onChange={(v) => dispatch({ type: 'setEnergy', patch: { dailyKwh: v } })} />
            <p className="mt-1.5 text-xs text-muted-foreground">Add an hourly profile below to shape the day.</p>
          </div>
        )}
        {e.mode === 'weekly' && (
          <div className="max-w-xs">
            <NumberField label="Weekly usage" suffix="kWh/week" value={e.weeklyKwh} onChange={(v) => dispatch({ type: 'setEnergy', patch: { weeklyKwh: v } })} />
            <p className="mt-1.5 text-xs text-muted-foreground">A single total for the week — averaged to {e.weeklyKwh ? (e.weeklyKwh / 7).toFixed(1) : '0'} kWh/day.</p>
          </div>
        )}
        {e.mode === 'monthly' && (
          <div className="max-w-xs">
            <NumberField label="Monthly usage" suffix="kWh/month" value={e.monthlyKwh} onChange={(v) => dispatch({ type: 'setEnergy', patch: { monthlyKwh: v } })} />
            <p className="mt-1.5 text-xs text-muted-foreground">A typical month — see the year spread below.</p>
          </div>
        )}
        {e.mode === 'annual' && (
          <div className="max-w-xs">
            <NumberField label="Annual usage" suffix="kWh/year" value={e.annualKwh} onChange={(v) => dispatch({ type: 'setEnergy', patch: { annualKwh: v } })} />
            <p className="mt-1.5 text-xs text-muted-foreground">Spread evenly — {e.annualKwh ? (e.annualKwh / 365).toFixed(1) : '0'} kWh/day.</p>
          </div>
        )}
      </SectionCard>

      {/* Daily → hourly profile */}
      {e.mode === 'daily' && (
        <SectionCard
          title="Hourly profile"
          subtitle="Pick a usage pattern, or type real meter readings per hour."
          action={
            e.hourly != null ? (
              <button type="button" onClick={() => dispatch({ type: 'clearHourly' })} className="text-xs text-muted-foreground hover:text-foreground underline">
                Clear hourly
              </button>
            ) : resolved.hourly ? (
              <button type="button" onClick={() => dispatch({ type: 'setEnergy', patch: { hourly: resolved.hourly!.slice(), curvePreset: 'custom' } })} className="text-xs text-primary hover:underline">
                Edit from pattern
              </button>
            ) : undefined
          }
        >
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Usage pattern</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => dispatch({ type: 'setEnergy', patch: { curvePreset: p.key } })}
                className={`rounded-lg border px-3 py-1.5 text-left transition-colors ${
                  e.curvePreset === p.key ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/40'
                }`}
              >
                <span className="block text-xs font-semibold">{p.label}</span>
                <span className="block text-[11px] text-muted-foreground">{p.hint}</span>
              </button>
            ))}
            {e.curvePreset === 'custom' && (
              <span className="self-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
                Custom hourly profile in use
              </span>
            )}
          </div>

          {/* Drag-to-edit bar chart — values stay bound to the inputs below */}
          <HourlyBarChart values={gridValues} onSet={setCell} />

          {/* Numeric grid: 00:00–11:00 left, 12:00–23:00 right */}
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-1">
            {[0, 1].map((col) => (
              <div key={col} className="flex flex-col gap-1">
                {gridValues.slice(col * 12, col * 12 + 12).map((v: number, idx: number) => {
                  const h = col * 12 + idx
                  return (
                    <label key={h} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}:00</span>
                      <input
                        type="number" min={0} step="any"
                        value={v ? +v.toFixed(2) : ''}
                        placeholder="0"
                        onChange={(ev) => setCell(h, ev.target.value === '' ? 0 : Number(ev.target.value))}
                        className="h-7 w-full rounded border border-border bg-background px-1.5 text-xs text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      />
                      <span className="shrink-0 text-[10px] text-muted-foreground">kW</span>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Monthly → seasonal year graph */}
      {e.mode === 'monthly' && (
        <SectionCard title="Seasonal spread" subtitle="How the monthly figure typically rises in winter and dips in summer.">
          <SeasonalGraph avgMonthly={monthlyForGraph} />
        </SectionCard>
      )}
    </div>
  )
}
