'use client'

import { useMemo } from 'react'
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

          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {gridValues.map((v: number, h: number) => (
              <label key={h} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">{String(h).padStart(2, '0')}:00</span>
                <input
                  type="number" min={0} step="any"
                  value={v ? +v.toFixed(2) : ''}
                  placeholder="0"
                  onChange={(ev) => setCell(h, ev.target.value === '' ? 0 : Number(ev.target.value))}
                  className="h-8 w-full rounded border border-border bg-background px-1.5 text-xs text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                />
              </label>
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
