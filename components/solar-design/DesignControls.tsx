'use client'

import { Button } from '@/components/ui/button'
import { Sun, Check, Loader2 } from 'lucide-react'

const WATT_OPTIONS = [360, 415, 460, 530, 560] as const

interface Props {
  totalPanels: number
  enabledCount: number
  panelWatts: number
  annualKwh: number
  saving: boolean
  saved: boolean
  onWattsChange: (watts: number) => void
  onSelectAll: () => void
  onClearAll: () => void
  onConfirm: () => void
}

export function DesignControls({
  totalPanels, enabledCount, panelWatts, annualKwh,
  saving, saved, onWattsChange, onSelectAll, onClearAll, onConfirm,
}: Props) {
  const kWp = ((enabledCount * panelWatts) / 1000).toFixed(2)

  return (
    <div className="flex flex-col gap-4 p-4 border border-border rounded-lg bg-background w-56 shrink-0">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Sun className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">Design Stats</span>
      </div>

      {/* Live stats */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Enabled panels</span>
          <span className="font-medium">{enabledCount} / {totalPanels}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total kWp</span>
          <span className="font-semibold text-accent">{kWp} kWp</span>
        </div>
        {annualKwh > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Est. annual</span>
            <span className="font-medium">{Math.round(annualKwh).toLocaleString()} kWh</span>
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Wattage selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Panel wattage
        </span>
        <div className="flex flex-wrap gap-1.5">
          {WATT_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onWattsChange(w)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
                ${panelWatts === w
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent/10 hover:text-foreground'}`}
            >
              {w}W
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Selection helpers */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onSelectAll}>
          All
        </Button>
        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onClearAll}>
          Clear
        </Button>
      </div>

      {/* Confirm */}
      <Button
        variant="accent"
        onClick={onConfirm}
        disabled={enabledCount === 0 || saving}
        className="w-full"
      >
        {saving
          ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
          : saved
            ? <><Check className="h-4 w-4" />Saved</>
            : 'Use This Design'}
      </Button>

      {saved && (
        <p className="text-xs text-success text-center leading-tight">
          Design confirmed — go to Quote tab and auto-generate.
        </p>
      )}

      {/* Usage hint */}
      <p className="text-xs text-muted-foreground leading-tight">
        Click panels on the map to toggle them on/off.
      </p>
    </div>
  )
}
