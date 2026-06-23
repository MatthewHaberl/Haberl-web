'use client'

import { useMemo } from 'react'
import { resolveEnergy, ENERGY_SOURCE_LABEL, type CurvePreset } from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { SectionCard, NumberField } from '../section-ui'

const PRESETS: Array<{ key: Exclude<CurvePreset, 'custom'>; label: string; hint: string }> = [
  { key: 'home_all_day', label: 'At home all day', hint: 'steady base, morning + evening' },
  { key: 'business_9_5', label: 'Business 9–5', hint: 'daytime heavy' },
  { key: 'evening_peak', label: 'Evening peak', hint: 'low day, strong evening' },
]

export function EnergySection() {
  const { design, dispatch, record } = useDesign()
  const e = design.energy
  const resolved = useMemo(() => resolveEnergy(e, record), [e, record])

  // Grid shows hand-entered hourly, else the curve preview, else zeros.
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

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Energy demand"
        subtitle="Fill in any one figure — or pick a usage pattern — and the rest is inferred. The most granular value wins."
      >
        {/* Resolved readout */}
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">
            {resolved.dailyKwh != null ? resolved.dailyKwh.toFixed(1) : '—'}
          </span>
          <span className="text-sm text-muted-foreground">kWh/day · {ENERGY_SOURCE_LABEL[resolved.source]}</span>
        </div>

        {/* Curve presets */}
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Usage pattern</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => dispatch({ type: 'setEnergy', patch: { curvePreset: p.key } })}
              className={`rounded-lg border px-3 py-1.5 text-left transition-colors ${
                e.curvePreset === p.key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/40'
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

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <NumberField label="Daily" suffix="kWh" value={e.dailyKwh} onChange={(v) => dispatch({ type: 'setEnergy', patch: { dailyKwh: v } })} />
          <NumberField label="Weekly" suffix="kWh" value={e.weeklyKwh} onChange={(v) => dispatch({ type: 'setEnergy', patch: { weeklyKwh: v } })} />
          <NumberField label="Monthly" suffix="kWh" value={e.monthlyKwh} onChange={(v) => dispatch({ type: 'setEnergy', patch: { monthlyKwh: v } })} />
          <NumberField label="Annual" suffix="kWh" value={e.annualKwh} onChange={(v) => dispatch({ type: 'setEnergy', patch: { annualKwh: v } })} />
          <NumberField label="Essential load" suffix="kW" value={e.essentialLoadKw} onChange={(v) => dispatch({ type: 'setEnergy', patch: { essentialLoadKw: v } })} />
        </div>
      </SectionCard>

      <SectionCard
        title="Hourly profile"
        subtitle="As granular as you like — leave blank to use the pattern above, or type real meter readings per hour."
        action={
          e.hourly != null ? (
            <button
              type="button"
              onClick={() => dispatch({ type: 'clearHourly' })}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear hourly
            </button>
          ) : resolved.hourly ? (
            <button
              type="button"
              onClick={() => dispatch({ type: 'setEnergy', patch: { hourly: resolved.hourly!.slice(), curvePreset: 'custom' } })}
              className="text-xs text-primary hover:underline"
            >
              Edit from pattern
            </button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
          {gridValues.map((v: number, h: number) => (
            <label key={h} className="flex flex-col gap-0.5">
              <span className="text-[10px] font-mono text-muted-foreground">{String(h).padStart(2, '0')}:00</span>
              <input
                type="number"
                min={0}
                step="any"
                value={v ? +v.toFixed(2) : ''}
                placeholder="0"
                onChange={(ev) => setCell(h, ev.target.value === '' ? 0 : Number(ev.target.value))}
                className="h-8 w-full rounded border border-border bg-background px-1.5 text-xs text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              />
            </label>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
