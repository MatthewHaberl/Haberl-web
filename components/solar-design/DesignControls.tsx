'use client'

import { Button } from '@/components/ui/button'
import { Sun, Check, Loader2, AlertCircle, RotateCcw } from 'lucide-react'
import { GenerationChart } from './GenerationChart'

const WATT_OPTIONS = [360, 415, 460, 530, 560] as const

export interface SegmentStat {
  segmentIndex: number
  panelCount: number
  azimuth: number
  pitch: number
}

interface Props {
  segmentStats: SegmentStat[]
  totalPanels: number
  enabledCount: number
  panelWatts: number
  capacity: number
  annualKwh: number
  saving: boolean
  saved: boolean
  onWattsChange: (watts: number) => void
  onSelectAll: () => void
  onClearAll: () => void
  onConfirm: () => void
}

function azimuthLabel(az: number): string {
  if (az >= 340 || az < 20) return 'North'
  if (az >= 70 && az < 110) return 'East'
  if (az >= 160 && az < 200) return 'South'
  if (az >= 250 && az < 290) return 'West'
  return `${az}°`
}

function isOptimal(az: number): boolean {
  return az >= 340 || az < 20
}

export function DesignControls({
  segmentStats, totalPanels, enabledCount, panelWatts, capacity, annualKwh,
  saving, saved, onWattsChange, onSelectAll, onClearAll, onConfirm,
}: Props) {
  const kWp = capacity.toFixed(2)

  const generationSegments = segmentStats.map(s => ({
    panelCount: s.panelCount,
    azimuth: s.azimuth,
    pitch: s.pitch,
    label: azimuthLabel(s.azimuth),
  }))

  return (
    <div className="flex flex-col gap-5 p-4 border border-border rounded-lg bg-background">

      {/* ── Top row: headline stats + wattage + actions ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">

        {/* Headline stats */}
        <div className="flex gap-5">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Panels</span>
            <span className="text-lg font-bold">{enabledCount} <span className="text-sm font-normal text-muted-foreground">/ {totalPanels}</span></span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Capacity</span>
            <span className="text-lg font-bold text-accent">{kWp} <span className="text-sm font-normal text-muted-foreground">kWp</span></span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Est. annual</span>
            <span className="text-lg font-bold">{annualKwh > 0 ? Math.round(annualKwh).toLocaleString() : '—'} <span className="text-sm font-normal text-muted-foreground">kWh</span></span>
          </div>
        </div>

        <div className="h-8 w-px bg-border hidden sm:block" />

        {/* Panel wattage chips */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Panel wattage</span>
          <div className="flex gap-1 flex-wrap">
            {WATT_OPTIONS.map(w => (
              <button key={w} type="button" onClick={() => onWattsChange(w)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  panelWatts === w ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-accent/10 hover:text-foreground'}`}>
                {w}W
              </button>
            ))}
          </div>
        </div>

        <div className="h-8 w-px bg-border hidden sm:block" />

        {/* Selection + confirm */}
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="outline" size="sm" className="text-xs" onClick={onSelectAll}>Select all</Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClearAll}>Clear</Button>
          <Button variant="accent" size="sm" onClick={onConfirm} disabled={enabledCount === 0 || saving} className="ml-1">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              : saved ? <><Check className="h-4 w-4" />Saved</>
              : 'Use This Design'}
          </Button>
          {saved && <span className="text-xs text-success">Confirmed ✓ go to Quote tab</span>}
        </div>
      </div>

      {/* ── Per-segment orientation breakdown ── */}
      {segmentStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {segmentStats.map((seg, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-xs border border-border">
              {isOptimal(seg.azimuth)
                ? <span className="text-success font-bold">✓</span>
                : <AlertCircle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />}
              <div>
                <div className="font-semibold">{azimuthLabel(seg.azimuth)}-facing · {seg.panelCount} panels</div>
                <div className="text-muted-foreground">{seg.azimuth}° azimuth · {seg.pitch}° pitch {isOptimal(seg.azimuth) ? '· Optimal' : '· Suboptimal'}</div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground self-center">
            Shift-click or right-click a panel to flip portrait/landscape. Click empty roof area to add a panel.
          </p>
        </div>
      )}

      {/* ── Generation analysis ── */}
      {enabledCount > 0 && generationSegments.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sun className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">Generation Analysis</span>
          </div>
          <GenerationChart segments={generationSegments} panelWatts={panelWatts} />
        </div>
      )}
    </div>
  )
}
