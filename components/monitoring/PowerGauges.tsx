'use client'

import { Sun, BatteryCharging, Plug, Home } from 'lucide-react'

interface GaugeProps {
  label: string
  value: number | null
  unit: string
  max: number
  icon: React.ElementType
  color: string
  positive?: string   // label when value > 0
  negative?: string   // label when value < 0
}

function Gauge({ label, value, unit, max, icon: Icon, color, positive, negative }: GaugeProps) {
  const absVal = Math.abs(value ?? 0)
  const pct = Math.min(100, max > 0 ? (absVal / max) * 100 : 0)
  const displayLabel = value != null && value < 0 && negative ? negative : (positive ?? label)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{displayLabel}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>
        {value != null ? `${absVal.toFixed(absVal < 10 ? 2 : 1)} ${unit}` : '—'}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

interface Props {
  pvPowerW: number | null
  batteryPowerW: number | null
  gridPowerW: number | null
  loadPowerW: number | null
  batterySocPct: number | null
  capacityKw: number | null
}

export function PowerGauges({ pvPowerW, batteryPowerW, gridPowerW, loadPowerW, batterySocPct, capacityKw }: Props) {
  const maxW = (capacityKw ?? 10) * 1000

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Gauge
        label="Solar generation"
        value={pvPowerW != null ? pvPowerW / 1000 : null}
        unit="kW"
        max={capacityKw ?? 10}
        icon={Sun}
        color="text-yellow-500"
      />
      <Gauge
        label="Battery"
        value={batteryPowerW != null ? batteryPowerW / 1000 : null}
        unit="kW"
        max={(capacityKw ?? 10) * 0.5}
        icon={BatteryCharging}
        color="text-green-500"
        positive={`Charging · ${batterySocPct != null ? batterySocPct.toFixed(0) + '%' : '—'} SOC`}
        negative={`Discharging · ${batterySocPct != null ? batterySocPct.toFixed(0) + '%' : '—'} SOC`}
      />
      <Gauge
        label="Grid"
        value={gridPowerW != null ? gridPowerW / 1000 : null}
        unit="kW"
        max={(maxW / 1000) * 0.6}
        icon={Plug}
        color="text-blue-500"
        positive="Importing from grid"
        negative="Exporting to grid"
      />
      <Gauge
        label="Load consumption"
        value={loadPowerW != null ? loadPowerW / 1000 : null}
        unit="kW"
        max={capacityKw ?? 10}
        icon={Home}
        color="text-purple-500"
      />
    </div>
  )
}
