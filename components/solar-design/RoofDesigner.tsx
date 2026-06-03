'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, RotateCcw, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { BuildingInsights } from '@/lib/solar/google-solar'
import { SolarMap } from './SolarMap'
import { DesignControls } from './DesignControls'

interface Props {
  address: string | null
  quoteRequestId: string
  existingPanelCount: number | null
  existingKwp: number | null
  existingConfirmedAt: string | null
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function RoofDesigner({
  address,
  quoteRequestId,
  existingPanelCount,
  existingKwp,
  existingConfirmedAt,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [buildingInsights, setBuildingInsights] = useState<BuildingInsights | null>(null)
  const [enabledPanels, setEnabledPanels] = useState<Set<number>>(new Set())
  const [panelWatts, setPanelWatts] = useState(415)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // ── Derived ──────────────────────────────────────────────────────────────────

  const solarPanels = buildingInsights?.solarPotential?.solarPanels ?? []
  const enabledCount = enabledPanels.size

  const annualKwh = solarPanels.reduce(
    (sum, p, i) => (enabledPanels.has(i) ? sum + p.yearlyEnergyDcKwh : sum),
    0,
  )

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleLoad() {
    if (!address) return
    setLoadState('loading')
    setError('')
    setBuildingInsights(null)
    setEnabledPanels(new Set())
    setSaved(false)

    try {
      const res = await fetch('/api/solar-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const data: BuildingInsights = await res.json()
      setBuildingInsights(data)
      // Enable all panels by default
      setEnabledPanels(new Set(data.solarPotential.solarPanels.map((_, i) => i)))
      setLoadState('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roof data')
      setLoadState('error')
    }
  }

  const handleTogglePanel = useCallback((idx: number) => {
    setEnabledPanels(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
    setSaved(false)
  }, [])

  function handleSelectAll() {
    setEnabledPanels(new Set(solarPanels.map((_, i) => i)))
    setSaved(false)
  }

  function handleClearAll() {
    setEnabledPanels(new Set())
    setSaved(false)
  }

  async function handleConfirm() {
    if (!buildingInsights || enabledCount === 0) return
    setSaving(true)

    try {
      const { solarPotential } = buildingInsights
      const { solarPanels: panels, roofSegmentStats } = solarPotential

      const kWp = parseFloat(((enabledCount * panelWatts) / 1000).toFixed(3))

      // Summarise which roof segments have enabled panels
      const segCounts = new Map<number, number>()
      panels.forEach((p, i) => {
        if (!enabledPanels.has(i)) return
        segCounts.set(p.segmentIndex, (segCounts.get(p.segmentIndex) ?? 0) + 1)
      })
      const segments = [...segCounts.entries()].map(([segIdx, count]) => {
        const seg = roofSegmentStats?.[segIdx]
        return {
          azimuth: Math.round(seg?.azimuthDegrees ?? 180),
          pitch: Math.round(seg?.pitchDegrees ?? 20),
          panelCount: count,
        }
      })

      const supabase = createClient()
      const { error: dbError } = await supabase.from('quote_requests').update({
        design_panel_count: enabledCount,
        design_kwp: kWp,
        design_segments: segments,
        design_confirmed_at: new Date().toISOString(),
      }).eq('id', quoteRequestId)

      if (dbError) throw dbError
      setSaved(true)
    } catch (e) {
      console.error('Failed to save design:', e)
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!address) {
    return (
      <Card className="max-w-xl">
        <CardContent className="py-10 text-center text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">No address on this quote</p>
          <p className="text-sm mt-1">Add the customer&apos;s address in the survey to use the roof design tool.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Existing confirmed design badge */}
      {existingConfirmedAt && !saved && loadState !== 'ready' && (
        <div className="flex items-center gap-3 p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
          <span className="font-semibold">
            Design confirmed: {existingPanelCount} panels · {existingKwp} kWp
          </span>
          <span className="text-xs opacity-70">
            {new Date(existingConfirmedAt).toLocaleDateString('en-ZA')}
          </span>
          <span className="ml-auto text-xs opacity-70">Reload below to redesign</span>
        </div>
      )}

      {/* Load / reload bar */}
      {loadState !== 'ready' && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{address}</span>
          </div>
          <Button
            variant="accent"
            onClick={handleLoad}
            disabled={loadState === 'loading'}
            className="ml-auto shrink-0"
          >
            {loadState === 'loading'
              ? <><Loader2 className="h-4 w-4 animate-spin" />Loading…</>
              : loadState === 'error'
                ? <><RotateCcw className="h-4 w-4" />Retry</>
                : 'Load Roof'}
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
      )}

      {/* Map + controls */}
      {loadState === 'ready' && buildingInsights && (
        <>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{address}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoad}
              className="ml-auto shrink-0 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />Reload
            </Button>
          </div>

          <div className="flex gap-4 items-start">
            <SolarMap
              buildingInsights={buildingInsights}
              enabledPanels={enabledPanels}
              onTogglePanel={handleTogglePanel}
            />
            <DesignControls
              totalPanels={solarPanels.length}
              enabledCount={enabledCount}
              panelWatts={panelWatts}
              annualKwh={annualKwh}
              saving={saving}
              saved={saved}
              onWattsChange={setPanelWatts}
              onSelectAll={handleSelectAll}
              onClearAll={handleClearAll}
              onConfirm={handleConfirm}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Google Solar data · {buildingInsights.imageryDate.year}/{String(buildingInsights.imageryDate.month).padStart(2,'0')}/{String(buildingInsights.imageryDate.day).padStart(2,'0')} imagery
            · {buildingInsights.solarPotential.maxArrayPanelsCount} panels max capacity
          </p>
        </>
      )}
    </div>
  )
}
