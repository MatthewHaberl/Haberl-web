'use client'

import { useMemo } from 'react'
import { Gauge, Sun, BatteryCharging, Check, AlertTriangle, Info, CircleAlert } from 'lucide-react'
import { computeBalance, ENERGY_SOURCE_LABEL, type VerdictLevel } from '@/lib/solar/system-design'
import { useDesign } from './DesignProvider'

function fmt(value: number | null, digits = 1): string {
  if (value == null) return '—'
  return value.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const VERDICT_STYLE: Record<VerdictLevel, { cls: string; Icon: typeof Info }> = {
  ok:    { cls: 'border-success/40 bg-success/5 text-success',         Icon: Check },
  info:  { cls: 'border-border bg-muted/40 text-muted-foreground',     Icon: Info },
  warn:  { cls: 'border-amber-300 bg-amber-50 text-amber-800',         Icon: AlertTriangle },
  block: { cls: 'border-destructive/40 bg-destructive/5 text-destructive', Icon: CircleAlert },
}

function Figure({
  Icon, label, value, unit, sub, accent,
}: { Icon: typeof Sun; label: string; value: string; unit: string; sub: string; accent: string }) {
  return (
    <div className="flex-1 min-w-[140px] flex flex-col items-center text-center px-3">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} /> {label}
      </span>
      <span className="mt-1 text-2xl font-bold leading-none" style={{ color: accent }}>
        {value}<span className="text-sm font-semibold text-muted-foreground ml-1">{unit}</span>
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{sub}</span>
    </div>
  )
}

export function BalanceHeader() {
  const { design, record, saveState } = useDesign()
  const balance = useMemo(() => computeBalance(design, record), [design, record])
  const hasBackup = (design.energy.essentialLoadKw ?? 0) > 0

  const coverage = balance.coveragePct
  const coverageChip = coverage == null
    ? null
    : {
        text: `${coverage.toFixed(0)}% of daily usage`,
        cls: coverage >= 90
          ? 'border-success/40 bg-success/5 text-success'
          : coverage >= 50
            ? 'border-amber-300 bg-amber-50 text-amber-800'
            : 'border-destructive/40 bg-destructive/5 text-destructive',
      }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" /> Energy balance
        </span>
        <span className="text-[11px] text-muted-foreground">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-stretch gap-y-3 divide-x divide-border">
        <Figure
          Icon={Gauge}
          label="Usage"
          value={fmt(balance.demandKwh)}
          unit="kWh/day"
          sub={ENERGY_SOURCE_LABEL[balance.demandSource]}
          accent="#1e3a5f"
        />
        <Figure
          Icon={Sun}
          label="Generation"
          value={fmt(balance.generationKwh)}
          unit="kWh/day"
          sub={balance.totalKwp > 0 ? `${fmt(balance.totalKwp, 2)} kWp installed` : 'add panels'}
          accent="#f97316"
        />
        <Figure
          Icon={BatteryCharging}
          label="Storage"
          value={fmt(balance.storageHours)}
          unit="hrs"
          sub={balance.batteryKwh > 0 ? `${fmt(balance.batteryKwh)} kWh at ${hasBackup ? 'backup' : 'full house'} load` : 'add a battery'}
          accent="#16a34a"
        />
      </div>

      {(coverageChip || balance.verdicts.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {coverageChip && (
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${coverageChip.cls}`}>
              {coverageChip.text}
            </span>
          )}
          {balance.verdicts.map((v) => {
            const s = VERDICT_STYLE[v.level]
            return (
              <span key={v.id} className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${s.cls}`}>
                <s.Icon className="h-3 w-3" /> {v.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
