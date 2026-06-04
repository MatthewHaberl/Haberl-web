'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, RotateCcw, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { BuildingInsights, CustomPanel, PanelPlacement } from '@/lib/solar/google-solar'
import { offsetLatLng } from '@/lib/solar/google-solar'
import { SolarMap } from './SolarMap'
import { DesignControls } from './DesignControls'
import type { SegmentStat } from './DesignControls'
import { PSH_GAUTENG, SYSTEM_EFFICIENCY } from '@/lib/solar/quote-calculator'

interface Props {
  address: string | null
  quoteRequestId: string
  existingPanelCount: number | null
  existingKwp: number | null
  existingConfirmedAt: string | null
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function RoofDesigner({ address, quoteRequestId, existingPanelCount, existingKwp, existingConfirmedAt }: Props) {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [buildingInsights, setBuildingInsights] = useState<BuildingInsights | null>(null)
  const [enabledPanels, setEnabledPanels] = useState<Set<number>>(new Set())
  const [customPanels, setCustomPanels] = useState<CustomPanel[]>([])
  const [enabledCustomPanels, setEnabledCustomPanels] = useState<Set<number>>(new Set())
  const [panelOrientations, setPanelOrientations] = useState<Record<number, 'PORTRAIT' | 'LANDSCAPE'>>({})
  const [selectedCustomPanelId, setSelectedCustomPanelId] = useState<number | null>(null)
  const [panelWatts, setPanelWatts] = useState(415)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [designMode, setDesignMode] = useState<'solar' | 'manual'>('solar')
  const [solarInsights, setSolarInsights] = useState<BuildingInsights | null>(null)
  const nextCustomId = useRef(-1)

  // ── Derived ──────────────────────────────────────────────────────────────────

  const solarPanels = buildingInsights?.solarPotential?.solarPanels ?? []
  const roofSegmentStats = buildingInsights?.solarPotential?.roofSegmentStats ?? []

  const totalEnabledCount = enabledPanels.size + enabledCustomPanels.size
  const totalPanelCount = solarPanels.length + customPanels.length

  const capacity = useMemo(() => (totalEnabledCount * panelWatts) / 1000, [totalEnabledCount, panelWatts])
  const annualKwh = useMemo(() => capacity * PSH_GAUTENG * 12 * SYSTEM_EFFICIENCY, [capacity])

  const segmentStats = useMemo((): SegmentStat[] => {
    const counts = new Map<number, number>()
    solarPanels.forEach((p, i) => {
      if (!enabledPanels.has(i)) return
      counts.set(p.segmentIndex, (counts.get(p.segmentIndex) ?? 0) + 1)
    })
    customPanels.forEach(cp => {
      if (!enabledCustomPanels.has(cp.id)) return
      counts.set(cp.segmentIndex, (counts.get(cp.segmentIndex) ?? 0) + 1)
    })
    return [...counts.entries()].map(([segIdx, count]) => {
      const seg = roofSegmentStats[segIdx]
      return { segmentIndex: segIdx, panelCount: count, azimuth: Math.round(seg?.azimuthDegrees ?? 180), pitch: Math.round(seg?.pitchDegrees ?? 20) }
    }).sort((a, b) => a.azimuth - b.azimuth)
  }, [solarPanels, roofSegmentStats, enabledPanels, customPanels, enabledCustomPanels])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function buildManualStub(latitude: number, longitude: number): BuildingInsights {
    return {
      name: 'manual',
      center: { latitude, longitude },
      boundingBox: { sw: { latitude, longitude }, ne: { latitude, longitude } },
      imageryDate: { year: 0, month: 0, day: 0 },
      imageryProcessedDate: { year: 0, month: 0, day: 0 },
      postalCode: '', administrativeArea: '', statisticalArea: '', regionCode: '',
      imageryQuality: 'LOW',
      solarPotential: {
        maxArrayPanelsCount: 0, maxArrayAreaMeters2: 0,
        maxSunshineHoursPerYear: 0, carbonOffsetFactorKgPerMwh: 0,
        panelCapacityWatts: 415, panelHeightMeters: 1.762, panelWidthMeters: 1.134, panelLifetimeYears: 25,
        buildingStats: { areaMeters2: 0, sunshineQuantiles: [], groundAreaMeters2: 0 },
        roofSegmentStats: [], solarPanels: [], solarPanelGroups: [],
      },
    }
  }

  async function handleLoad() {
    if (!address) return
    setLoadState('loading'); setError(''); setBuildingInsights(null)
    setEnabledPanels(new Set()); setCustomPanels([]); setEnabledCustomPanels(new Set())
    setPanelOrientations({}); setSelectedCustomPanelId(null); setSaved(false)
    setSolarInsights(null); setDesignMode('solar')

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
      const data = await res.json()
      if (data.fallback) {
        const stub = buildManualStub(data.latitude, data.longitude)
        setBuildingInsights(stub)
        setSolarInsights(null)
        setDesignMode('manual')
      } else {
        const insights = data as BuildingInsights
        setBuildingInsights(insights)
        setSolarInsights(insights)
        setEnabledPanels(new Set(insights.solarPotential.solarPanels.map((_, i) => i)))
        setDesignMode('solar')
      }
      setLoadState('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roof data')
      setLoadState('error')
    }
  }

  const handleTogglePanel = useCallback((idx: number) => {
    setEnabledPanels(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
    setSaved(false)
  }, [])

  const handleToggleCustomPanel = useCallback((id: number) => {
    setEnabledCustomPanels(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    setSaved(false)
  }, [])

  const handleShiftClickPanel = useCallback((idx: number) => {
    setPanelOrientations(prev => {
      const current = prev[idx] ?? (solarPanels[idx]?.orientation ?? 'PORTRAIT')
      return { ...prev, [idx]: current === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT' }
    })
  }, [solarPanels])

  // Add a row of one or more panels (from drag-to-place or single click)
  const handleAddPanelRow = useCallback((placements: PanelPlacement[]) => {
    const newPanels: CustomPanel[] = placements.map(p => ({
      id: nextCustomId.current--,
      lat: p.lat,
      lng: p.lng,
      orientation: 'PORTRAIT',
      segmentIndex: p.segmentIndex,
      azimuth: p.azimuth,
      pitch: p.pitch,
    }))
    setCustomPanels(prev => [...prev, ...newPanels])
    setEnabledCustomPanels(prev => new Set([...prev, ...newPanels.map(p => p.id)]))
    // Select the last placed panel so the user can immediately extend the row
    if (newPanels.length > 0) setSelectedCustomPanelId(newPanels[newPanels.length - 1].id)
    setSaved(false)
  }, [])

  const handleRemoveCustomPanel = useCallback((id: number) => {
    setCustomPanels(prev => prev.filter(cp => cp.id !== id))
    setEnabledCustomPanels(prev => { const n = new Set(prev); n.delete(id); return n })
    setSelectedCustomPanelId(prev => prev === id ? null : prev)
    setSaved(false)
  }, [])

  const handleSelectCustomPanel = useCallback((id: number | null) => {
    setSelectedCustomPanelId(id)
  }, [])

  // Extend a row: add one panel adjacent to fromId in the given direction
  const handleExtendRow = useCallback((fromId: number, direction: 'left' | 'right') => {
    setCustomPanels(prev => {
      const from = prev.find(p => p.id === fromId)
      if (!from || !buildingInsights) return prev
      const { panelWidthMeters: PW, panelHeightMeters: PH } = buildingInsights.solarPotential
      const spacing = (from.orientation === 'PORTRAIT' ? PW : PH) + 0.05
      const rowBearing = (from.azimuth + (direction === 'right' ? 90 : -90) + 360) % 360
      const pos = offsetLatLng(from.lat, from.lng, spacing, rowBearing)
      const newPanel: CustomPanel = {
        id: nextCustomId.current--,
        lat: pos.lat,
        lng: pos.lng,
        orientation: from.orientation,
        segmentIndex: from.segmentIndex,
        azimuth: from.azimuth,
        pitch: from.pitch,
      }
      setEnabledCustomPanels(ep => new Set([...ep, newPanel.id]))
      setSelectedCustomPanelId(newPanel.id) // keep focus at the end of the row
      setSaved(false)
      return [...prev, newPanel]
    })
  }, [buildingInsights])

  function handleSelectAll() {
    setEnabledPanels(new Set(solarPanels.map((_, i) => i)))
    setEnabledCustomPanels(new Set(customPanels.map(cp => cp.id)))
    setSaved(false)
  }

  function handleClearAll() {
    setEnabledPanels(new Set()); setEnabledCustomPanels(new Set()); setSaved(false)
  }

  function handleModeSwitch(newMode: 'solar' | 'manual') {
    if (newMode === designMode) return
    setDesignMode(newMode)
    if (newMode === 'solar' && solarInsights) {
      setBuildingInsights(solarInsights)
      setEnabledPanels(new Set(solarInsights.solarPotential.solarPanels.map((_, i) => i)))
    } else if (newMode === 'manual' && solarInsights) {
      setBuildingInsights(buildManualStub(solarInsights.center.latitude, solarInsights.center.longitude))
      setEnabledPanels(new Set())
    }
    setSaved(false)
  }

  async function handleConfirm() {
    if (!buildingInsights || totalEnabledCount === 0) return
    setSaving(true)
    try {
      const kWp = parseFloat(capacity.toFixed(3))
      const segCounts = new Map<number, number>()
      solarPanels.forEach((p, i) => {
        if (!enabledPanels.has(i)) return
        segCounts.set(p.segmentIndex, (segCounts.get(p.segmentIndex) ?? 0) + 1)
      })
      customPanels.forEach(cp => {
        if (!enabledCustomPanels.has(cp.id)) return
        segCounts.set(cp.segmentIndex, (segCounts.get(cp.segmentIndex) ?? 0) + 1)
      })
      const segments = [...segCounts.entries()].map(([segIdx, count]) => {
        const seg = roofSegmentStats[segIdx]
        return { azimuth: Math.round(seg?.azimuthDegrees ?? 180), pitch: Math.round(seg?.pitchDegrees ?? 20), panelCount: count }
      })

      const supabase = createClient()
      const { error: dbError } = await supabase.from('quote_requests').update({
        design_panel_count: totalEnabledCount,
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

  // ── Render ────────────────────────────────────────────────────────────────────

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

      {existingConfirmedAt && !saved && loadState !== 'ready' && (
        <div className="flex items-center gap-3 p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
          <span className="font-semibold">Design confirmed: {existingPanelCount} panels · {existingKwp} kWp</span>
          <span className="text-xs opacity-70">{new Date(existingConfirmedAt).toLocaleDateString('en-ZA')}</span>
          <span className="ml-auto text-xs opacity-70">Reload below to redesign</span>
        </div>
      )}

      {loadState !== 'ready' && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{address}</span>
          </div>
          <Button variant="accent" onClick={handleLoad} disabled={loadState === 'loading'} className="ml-auto shrink-0">
            {loadState === 'loading' ? <><Loader2 className="h-4 w-4 animate-spin" />Loading…</>
              : loadState === 'error' ? <><RotateCcw className="h-4 w-4" />Retry</>
              : 'Load Roof'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

      {loadState === 'ready' && buildingInsights && (
        <>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{address}</span>
            <Button variant="ghost" size="sm" onClick={handleLoad} className="ml-auto shrink-0 text-xs">
              <RotateCcw className="h-3.5 w-3.5 mr-1" />Reload
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleModeSwitch('solar')}
              disabled={!solarInsights}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                designMode === 'solar'
                  ? 'bg-foreground text-background border-foreground'
                  : solarInsights
                  ? 'bg-background text-muted-foreground border-border hover:border-foreground/40'
                  : 'opacity-40 cursor-not-allowed bg-background text-muted-foreground border-border'
              }`}>
              Google Solar{solarInsights ? ` · ${solarInsights.solarPotential.solarPanels.length} panels` : ' · no coverage'}
            </button>
            <button
              onClick={() => handleModeSwitch('manual')}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                designMode === 'manual'
                  ? 'bg-accent text-accent-foreground border-accent'
                  : 'bg-background text-muted-foreground border-border hover:border-accent/50'
              }`}>
              Manual placement
            </button>
          </div>

          <SolarMap
            buildingInsights={buildingInsights}
            enabledPanels={enabledPanels}
            customPanels={customPanels}
            enabledCustomPanels={enabledCustomPanels}
            panelOrientations={panelOrientations}
            selectedCustomPanelId={selectedCustomPanelId}
            onTogglePanel={handleTogglePanel}
            onToggleCustomPanel={handleToggleCustomPanel}
            onShiftClickPanel={handleShiftClickPanel}
            onAddPanelRow={handleAddPanelRow}
            onRemoveCustomPanel={handleRemoveCustomPanel}
            onSelectCustomPanel={handleSelectCustomPanel}
            onExtendRow={handleExtendRow}
          />

          <DesignControls
            segmentStats={segmentStats}
            totalPanels={totalPanelCount}
            enabledCount={totalEnabledCount}
            panelWatts={panelWatts}
            capacity={capacity}
            annualKwh={annualKwh}
            saving={saving}
            saved={saved}
            onWattsChange={setPanelWatts}
            onSelectAll={handleSelectAll}
            onClearAll={handleClearAll}
            onConfirm={handleConfirm}
          />

          {designMode === 'solar' && solarInsights ? (
            <p className="text-xs text-muted-foreground">
              Google Solar data · {solarInsights.imageryDate.year}/{String(solarInsights.imageryDate.month).padStart(2, '0')}/{String(solarInsights.imageryDate.day).padStart(2, '0')} imagery
              · {solarInsights.solarPotential.maxArrayPanelsCount} panels max capacity
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Manual placement · satellite imagery via Google Maps · place panels by clicking or drag-to-row
            </p>
          )}
        </>
      )}
    </div>
  )
}
