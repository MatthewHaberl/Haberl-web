'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sun, Check, Loader2, AlertCircle, TrendingUp } from 'lucide-react'
import type { RoofSegmentSummary } from '@/lib/solar/google-solar'
import { calculateStringGeneration } from '@/lib/solar/generation-calculator'
import type { Season } from '@/lib/solar/generation-calculator'
import { GenerationChart } from './GenerationChart'

const WATT_OPTIONS = [360, 415, 460, 530, 560] as const

interface Props {
  roofSegmentStats: RoofSegmentSummary[] | undefined
  selectedSegmentIdx: number
  onSegmentChange: (idx: number) => void
  currentSegmentPanels: number[]
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

function getOrientationLabel(azimuth: number): string {
  if (azimuth >= 340 || azimuth < 20) return 'North-facing'
  if (azimuth >= 70 && azimuth < 110) return 'East-facing'
  if (azimuth >= 160 && azimuth < 200) return 'South-facing'
  if (azimuth >= 250 && azimuth < 290) return 'West-facing'
  return 'Other orientation'
}

function isOptimalOrientation(azimuth: number): boolean {
  return azimuth >= 340 || azimuth < 20
}

export function DesignControls({
  roofSegmentStats, selectedSegmentIdx, onSegmentChange, currentSegmentPanels,
  totalPanels, enabledCount, panelWatts, capacity, annualKwh,
  saving, saved, onWattsChange, onSelectAll, onClearAll, onConfirm,
}: Props) {
  const [season, setSeason] = useState<Season>('average')
  const [showChart, setShowChart] = useState(false)

  const kWp = capacity.toFixed(2)
  const currentSegment = roofSegmentStats?.[selectedSegmentIdx]
  const azimuth = currentSegment?.azimuthDegrees ? Math.round(currentSegment.azimuthDegrees) : 180
  const pitch = currentSegment?.pitchDegrees ? Math.round(currentSegment.pitchDegrees) : 20
  const isOptimal = isOptimalOrientation(azimuth)

  // Calculate generation stats for current segment
  const generationStats = useMemo(() => {
    if (enabledCount === 0) return null
    return calculateStringGeneration(enabledCount, panelWatts, azimuth, pitch, season)
  }, [enabledCount, panelWatts, azimuth, pitch, season])

  return (
    <div className="flex flex-col gap-4 p-4 border border-border rounded-lg bg-background w-56 shrink-0">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Sun className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">Design Stats</span>
      </div>

      {/* Roof Segment Selector */}
      {roofSegmentStats && roofSegmentStats.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Roof Segment</span>
          <select
            value={selectedSegmentIdx}
            onChange={(e) => onSegmentChange(Number(e.target.value))}
            className="px-2 py-1.5 rounded text-sm bg-muted border border-border text-foreground"
          >
            {roofSegmentStats.map((seg, idx) => (
              <option key={idx} value={idx}>
                {getOrientationLabel(Math.round(seg.azimuthDegrees))} ({Math.round(seg.pitchDegrees)}°)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Roof Orientation Display */}
      {currentSegment && (
        <div className="flex flex-col gap-2 p-2 bg-muted/50 rounded text-xs">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="text-muted-foreground">Azimuth: <span className="font-medium text-foreground">{azimuth}°</span></div>
              <div className="text-muted-foreground">Pitch: <span className="font-medium text-foreground">{pitch}°</span></div>
            </div>
            <div className="flex items-center gap-1.5">
              {isOptimal ? (
                <span className="text-success">✓ Optimal</span>
              ) : (
                <span className="text-yellow-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Suboptimal
                </span>
              )}
            </div>
          </div>
          <div className="text-muted-foreground">{getOrientationLabel(azimuth)}</div>
        </div>
      )}

      <div className="border-t border-border" />

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

      {/* Generation analysis */}
      {generationStats && (
        <>
          <div className="border-t border-border" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              <span className="text-xs font-medium text-muted-foreground uppercase">Generation ({season})</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Peak generation</span>
              <span className="font-semibold">{generationStats.peak_kw} kW @ {generationStats.peak_time}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Daily estimate</span>
              <span className="font-semibold">{generationStats.daily_kwh} kWh</span>
            </div>
          </div>

          {/* Season selector */}
          <div className="flex gap-1">
            {(['summer', 'average', 'winter'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  season === s
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent/10'
                }`}
              >
                {s === 'summer' ? '☀️' : s === 'winter' ? '❄️' : '◐'} {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Toggle chart view */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChart(!showChart)}
            className="text-xs w-full"
          >
            {showChart ? 'Hide' : 'Show'} generation timeline
          </Button>
        </>
      )}

      <div className="border-t border-border" />

      {/* Generation Chart - shown when toggled */}
      {showChart && enabledCount > 0 && (
        <div className="-mx-4 -mb-4 p-4 bg-muted/30 rounded-b-lg">
          <GenerationChart
            strings={
              roofSegmentStats ? [{
                panelCount: enabledCount,
                azimuth: azimuth,
                pitch: pitch,
              }] : []
            }
            panelWatts={panelWatts}
          />
        </div>
      )}

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
