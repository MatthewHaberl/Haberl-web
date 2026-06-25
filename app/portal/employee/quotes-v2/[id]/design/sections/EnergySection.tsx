'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  resolveEnergy, ENERGY_SOURCE_LABEL, seasonalMonthly, MONTH_LABELS,
  type CurvePreset, type EnergyMode, type EnergyProfileField,
} from '@/lib/solar/system-design'
import { HOURLY_BAR_COLOR } from '@/lib/solar/canvas-theme'
import { useDesign } from '../DesignProvider'
import { SectionCard, NumberField, EmptyHint } from '../section-ui'

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEK_LABELS = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5']

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

/** Compact value label for the per-bar readout: 1, 0.5 → ".5", 2.45 → "2.5". */
function fmtCell(v: number): string {
  if (v >= 10) return Math.round(v).toString()
  const s = (Math.round(v * 10) / 10).toString() // one decimal at most
  return s.startsWith('0.') ? s.slice(1) : s      // ".5" reads cleaner than "0.5"
}

/** A bar colour derived from the single canvas-theme amber: a darker base for the
 *  gradient foot, the theme colour for the cap. One colour, no per-chart picker. */
const BAR_GRADIENT = `linear-gradient(to top, ${HOURLY_BAR_COLOR}cc, ${HOURLY_BAR_COLOR})`

/** Reusable N-cell profile editor (item 40). Drag a bar up/down to set a cell, or
 *  type the value in the paired number grid below — both stay bound to `values`.
 *  Generalised from the original 24-hour hourly chart: pass any cell count via
 *  `values`, a `unit`, a per-cell `cellLabel`, optional axis `ticks`, and a grid
 *  column count so weekly (7), monthly (4–5), annual (12) and hourly (24) all share
 *  the exact same drag + numeric editing UX. */
function ProfileEditor({
  values, onSet, unit, cellLabel, ticks, gridCols = 2, hint,
}: {
  values: number[]
  onSet: (index: number, value: number) => void
  unit: string
  /** Long label for the bar tooltip + a short axis tick, per cell index. */
  cellLabel: (i: number) => string
  /** Optional evenly-spaced axis labels under the bars (e.g. clock hours). When
   *  omitted, each cell gets a short label drawn beneath it instead. */
  ticks?: string[]
  /** Numeric-grid column count; cells flow down each column in order. */
  gridCols?: number
  hint?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const count = values.length
  const maxScale = useMemo(() => niceCeil(Math.max(...values, 0.5)), [values])

  const apply = useCallback((clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (r.bottom - clientY) / r.height))
    const index = Math.min(count - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * count)))
    onSet(index, +(frac * maxScale).toFixed(2))
  }, [maxScale, onSet, count])

  useEffect(() => {
    if (!dragging) return
    const move = (ev: PointerEvent) => apply(ev.clientX, ev.clientY)
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [dragging, apply])

  // Lay the numeric grid out column-major so each column holds a contiguous run.
  const perCol = Math.ceil(count / gridCols)

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="font-mono">{maxScale.toFixed(maxScale < 1 ? 2 : 1)} {unit}</span>
        {hint && <span className="hidden sm:inline">{hint}</span>}
      </div>
      <div
        ref={ref}
        onPointerDown={(ev) => { ev.preventDefault(); setDragging(true); apply(ev.clientX, ev.clientY) }}
        className="relative flex touch-none items-end gap-px rounded-md border border-border bg-muted/30 px-1 py-1 cursor-ns-resize"
        style={{ height: 150 }}
      >
        {/* midline guide */}
        <div className="pointer-events-none absolute inset-x-1 top-1/2 border-t border-dashed border-border/70" />
        {values.map((v, i) => {
          const frac = Math.min(1, v / maxScale)
          const inside = frac > 0.16 // tall enough to hold the label inside the bar
          return (
            <div
              key={i}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
              title={`${cellLabel(i)} — ${v.toFixed(2)} ${unit}`}
            >
              {v > 0 && !inside && (
                <span className="pointer-events-none mb-0.5 font-mono text-[10px] leading-none tabular-nums text-muted-foreground">
                  {fmtCell(v)}
                </span>
              )}
              <div
                className="relative w-full rounded-t transition-[height] hover:brightness-110"
                style={{ height: `${frac * 100}%`, minHeight: v > 0 ? 2 : 0, background: BAR_GRADIENT }}
              >
                {v > 0 && inside && (
                  <span className="pointer-events-none absolute inset-x-0 top-px text-center font-mono text-[10px] font-semibold leading-none tabular-nums text-white/95">
                    {fmtCell(v)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {ticks ? (
        <div className="mt-0.5 flex justify-between font-mono text-[9px] text-muted-foreground">
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      ) : (
        <div className="mt-0.5 flex gap-px">
          {values.map((_, i) => (
            <span key={i} className="flex-1 text-center font-mono text-[9px] text-muted-foreground">{cellLabel(i)}</span>
          ))}
        </div>
      )}

      {/* Paired numeric grid — column-major so labels sit beside their value. */}
      <div className="mt-3 mx-auto grid max-w-md gap-x-6 gap-y-1" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
        {Array.from({ length: gridCols }).map((_, col) => (
          <div key={col} className="flex flex-col gap-1">
            {values.slice(col * perCol, col * perCol + perCol).map((v, idx) => {
              const i = col * perCol + idx
              return (
                <label key={i} className="flex items-center justify-center gap-1.5">
                  <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{cellLabel(i)}</span>
                  <input
                    type="number" min={0} step="any"
                    value={v ? +v.toFixed(2) : ''}
                    placeholder="0"
                    onChange={(ev) => onSet(i, ev.target.value === '' ? 0 : Number(ev.target.value))}
                    className="h-7 w-16 rounded border border-border bg-background px-1.5 text-xs text-center tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  />
                  <span className="shrink-0 text-[10px] text-muted-foreground">{unit}</span>
                </label>
              )
            })}
          </div>
        ))}
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

  // Shaping overlays (items 37–40). Each shares the SAME drag + numeric editing as
  // the hourly chart; they redistribute the total without changing it.
  const PROFILE_LENGTH: Record<EnergyProfileField, number> = { weekly: 7, monthlyProfile: 5, annualProfile: 12 }
  function profileValues(field: EnergyProfileField): number[] {
    const arr = e[field]
    const len = PROFILE_LENGTH[field]
    if (Array.isArray(arr) && arr.length) return Array.from({ length: len }, (_, i) => arr[i] ?? 0)
    return new Array(len).fill(0)
  }
  function setProfileCell(field: EnergyProfileField, index: number, value: number) {
    dispatch({ type: 'setProfileCell', field, index, value })
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
                e.mode === t.mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
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
              <span className="self-center rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                Custom hourly profile in use
              </span>
            )}
          </div>

          {/* Drag-to-edit bar chart + paired numeric grid — same reusable editor used
              by the weekly/monthly/annual shaping profiles below (item 40). */}
          <ProfileEditor
            values={gridValues}
            onSet={setCell}
            unit="kW"
            cellLabel={(h) => `${String(h).padStart(2, '0')}:00`}
            ticks={['00:00', '06:00', '12:00', '18:00', '24:00']}
            gridCols={2}
            hint="Drag the bars to shape the day"
          />
        </SectionCard>
      )}

      {/* Weekly → day-of-week profile (item 37) */}
      {e.mode === 'weekly' && (
        <SectionCard
          title="Day-of-week profile"
          subtitle="Drag or type to shape usage across the week — heavier weekdays, lighter weekends, however it falls."
          action={
            e.weekly != null ? (
              <button type="button" onClick={() => dispatch({ type: 'clearProfile', field: 'weekly' })} className="text-xs text-muted-foreground hover:text-foreground underline">
                Clear profile
              </button>
            ) : undefined
          }
        >
          <ProfileEditor
            values={profileValues('weekly')}
            onSet={(i, v) => setProfileCell('weekly', i, v)}
            unit="kWh"
            cellLabel={(i) => DOW_LABELS[i]}
            gridCols={2}
            hint="Drag the bars to shape the week"
          />
        </SectionCard>
      )}

      {/* Monthly → seasonal year graph + per-week profile (item 38) */}
      {e.mode === 'monthly' && (
        <>
          <SectionCard title="Seasonal spread" subtitle="How the monthly figure typically rises in winter and dips in summer.">
            <SeasonalGraph avgMonthly={monthlyForGraph} />
          </SectionCard>
          <SectionCard
            title="Per-week profile"
            subtitle="Shape usage across the weeks of a month — leave flat for an even spread."
            action={
              e.monthlyProfile != null ? (
                <button type="button" onClick={() => dispatch({ type: 'clearProfile', field: 'monthlyProfile' })} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear profile
                </button>
              ) : undefined
            }
          >
            <ProfileEditor
              values={profileValues('monthlyProfile')}
              onSet={(i, v) => setProfileCell('monthlyProfile', i, v)}
              unit="kWh"
              cellLabel={(i) => WEEK_LABELS[i]}
              gridCols={1}
              hint="Drag the bars to shape the month"
            />
          </SectionCard>
        </>
      )}

      {/* Annual → 12-month seasonal profile (item 39) */}
      {e.mode === 'annual' && (
        <SectionCard
          title="Monthly profile"
          subtitle="Shape usage across the year — seasonal highs and lows. Leave flat for an even spread."
          action={
            e.annualProfile != null ? (
              <button type="button" onClick={() => dispatch({ type: 'clearProfile', field: 'annualProfile' })} className="text-xs text-muted-foreground hover:text-foreground underline">
                Clear profile
              </button>
            ) : undefined
          }
        >
          <ProfileEditor
            values={profileValues('annualProfile')}
            onSet={(i, v) => setProfileCell('annualProfile', i, v)}
            unit="kWh"
            cellLabel={(i) => MONTH_LABELS[i]}
            gridCols={3}
            hint="Drag the bars to shape the year"
          />
        </SectionCard>
      )}
    </div>
  )
}
