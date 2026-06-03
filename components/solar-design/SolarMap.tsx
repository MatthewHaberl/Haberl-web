'use client'

import { useEffect, useRef, useState } from 'react'
import type { BuildingInsights, CustomPanel, PanelPlacement } from '@/lib/solar/google-solar'
import { offsetLatLng, geoDistanceM, geoBearing } from '@/lib/solar/google-solar'

declare global {
  interface Window { google: any } // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function panelCorners(
  lat: number, lng: number,
  azimuthDeg: number,
  panelWidthM: number, panelHeightM: number,
  orientation: 'PORTRAIT' | 'LANDSCAPE',
): Array<{ lat: number; lng: number }> {
  const az = azimuthDeg * Math.PI / 180
  const upN = -Math.cos(az)
  const upE = -Math.sin(az)
  const acN = Math.sin(az)
  const acE = -Math.cos(az)

  const [halfUp, halfAc] = orientation === 'PORTRAIT'
    ? [panelHeightM / 2, panelWidthM / 2]
    : [panelWidthM / 2, panelHeightM / 2]

  const toLat = 1 / 111320
  const toLng = 1 / (111320 * Math.cos(lat * Math.PI / 180))

  return [
    { lat: lat + (halfUp * upN - halfAc * acN) * toLat, lng: lng + (halfUp * upE - halfAc * acE) * toLng },
    { lat: lat + (halfUp * upN + halfAc * acN) * toLat, lng: lng + (halfUp * upE + halfAc * acE) * toLng },
    { lat: lat + (-halfUp * upN + halfAc * acN) * toLat, lng: lng + (-halfUp * upE + halfAc * acE) * toLng },
    { lat: lat + (-halfUp * upN - halfAc * acN) * toLat, lng: lng + (-halfUp * upE - halfAc * acE) * toLng },
  ]
}

function getPanelFill(
  azimuth: number, isEnabled: boolean, isCustom = false, isSelected = false,
): { fill: string; fillOpacity: number; stroke: string; strokeWeight: number } {
  if (!isEnabled) return { fill: '#94a3b8', fillOpacity: 0.25, stroke: '#64748b', strokeWeight: 0.5 }
  if (isSelected) return { fill: '#3b82f6', fillOpacity: 0.82, stroke: '#1d4ed8', strokeWeight: 2.5 }
  let fill = '#22c55e'; let stroke = '#16a34a'
  if (azimuth >= 70 && azimuth < 110) { fill = '#f59e0b'; stroke = '#d97706' }
  else if (azimuth >= 110 && azimuth < 250) { fill = '#ef4444'; stroke = '#dc2626' }
  else if (azimuth >= 250 && azimuth < 340) { fill = '#8b5cf6'; stroke = '#7c3aed' }
  return { fill, fillOpacity: isCustom ? 0.65 : 0.82, stroke, strokeWeight: isCustom ? 1.5 : 0.5 }
}

function findNearestSegment(
  bi: BuildingInsights, lat: number, lng: number,
): { segmentIndex: number; azimuth: number; pitch: number } {
  const panels = bi.solarPotential.solarPanels
  const stats = bi.solarPotential.roofSegmentStats
  let minDist = Infinity; let nearest = 0
  panels.forEach(p => {
    const d = Math.hypot(p.center.latitude - lat, p.center.longitude - lng)
    if (d < minDist) { minDist = d; nearest = p.segmentIndex }
  })
  const seg = stats?.[nearest]
  return { segmentIndex: nearest, azimuth: seg?.azimuthDegrees ?? 180, pitch: seg?.pitchDegrees ?? 20 }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  buildingInsights: BuildingInsights
  enabledPanels: Set<number>
  customPanels: CustomPanel[]
  enabledCustomPanels: Set<number>
  panelOrientations: Record<number, 'PORTRAIT' | 'LANDSCAPE'>
  selectedCustomPanelId: number | null
  onTogglePanel: (index: number) => void
  onToggleCustomPanel: (id: number) => void
  onShiftClickPanel: (index: number) => void
  onAddPanelRow: (panels: PanelPlacement[]) => void
  onRemoveCustomPanel: (id: number) => void
  onSelectCustomPanel: (id: number | null) => void
  onExtendRow: (fromId: number, direction: 'left' | 'right') => void
}

export function SolarMap({
  buildingInsights, enabledPanels, customPanels, enabledCustomPanels,
  panelOrientations, selectedCustomPanelId,
  onTogglePanel, onToggleCustomPanel, onShiftClickPanel,
  onAddPanelRow, onRemoveCustomPanel, onSelectCustomPanel, onExtendRow,
}: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)           // eslint-disable-line @typescript-eslint/no-explicit-any
  const apiPolygonsRef = useRef<any[]>([])   // eslint-disable-line @typescript-eslint/no-explicit-any
  const customPolygonsRef = useRef<Map<number, any>>(new Map()) // eslint-disable-line @typescript-eslint/no-explicit-any
  const extendGhostsRef = useRef<any[]>([]) // eslint-disable-line @typescript-eslint/no-explicit-any
  const dragGhostsRef = useRef<any[]>([])   // eslint-disable-line @typescript-eslint/no-explicit-any
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [mode, setMode] = useState<'pan' | 'place'>('pan')
  const [dragCount, setDragCount] = useState(0) // display only

  // Keep all callbacks + mutable data in refs so event handlers never go stale
  const cbRef = useRef({ onTogglePanel, onToggleCustomPanel, onShiftClickPanel, onAddPanelRow, onRemoveCustomPanel, onSelectCustomPanel, onExtendRow })
  useEffect(() => { cbRef.current = { onTogglePanel, onToggleCustomPanel, onShiftClickPanel, onAddPanelRow, onRemoveCustomPanel, onSelectCustomPanel, onExtendRow } })
  const modeRef = useRef<'pan' | 'place'>('pan')
  // In place mode: disable drag panning but keep scroll zoom via gestureHandling:'greedy'
  useEffect(() => { modeRef.current = mode; if (mapRef.current) mapRef.current.setOptions({ draggable: mode === 'pan' }) }, [mode])
  const biRef = useRef(buildingInsights)
  useEffect(() => { biRef.current = buildingInsights }, [buildingInsights])
  const selIdRef = useRef<number | null>(null)
  useEffect(() => { selIdRef.current = selectedCustomPanelId }, [selectedCustomPanelId])

  // ── Load Google Maps JS API ───────────────────────────────────────────────

  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return }
    const existing = document.querySelector<HTMLScriptElement>('script[data-solar-maps]')
    if (existing) { existing.addEventListener('load', () => setMapsLoaded(true), { once: true }); return }
    const script = document.createElement('script')
    script.setAttribute('data-solar-maps', '1')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}`
    script.async = true
    script.onload = () => setMapsLoaded(true)
    document.head.appendChild(script)
  }, [])

  // ── Init map + drag-to-place handlers (run once) ─────────────────────────

  useEffect(() => {
    if (!mapsLoaded || !mapDivRef.current || mapRef.current) return
    const { center } = buildingInsights
    const map = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: center.latitude, lng: center.longitude },
      zoom: 21,
      maxZoom: 22,
      minZoom: 15,
      mapTypeId: 'satellite',
      tilt: 0,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: false,
      scrollwheel: true,
      gestureHandling: 'greedy', // pan mode default
    })
    mapRef.current = map

    const mapDiv = map.getDiv() as HTMLDivElement

    // ── Drag state ────────────────────────────────────────────────────────
    let dragStart: { x: number; y: number; lat: number; lng: number } | null = null
    let hasDragged = false
    let justDragged = false // suppress map click after a drag

    function pixelToLatLng(clientX: number, clientY: number): { lat: number; lng: number } {
      const rect = mapDiv.getBoundingClientRect()
      const pt = new window.google.maps.Point(clientX - rect.left, clientY - rect.top)
      const ll = map.fromContainerPixelToLatLng(pt)
      return { lat: ll.lat(), lng: ll.lng() }
    }

    function clearDragGhosts() {
      dragGhostsRef.current.forEach(p => p.setMap(null))
      dragGhostsRef.current = []
      setDragCount(0)
    }

    function buildRowPlacements(
      startLat: number, startLng: number,
      endLat: number, endLng: number,
    ): PanelPlacement[] {
      const bi = biRef.current
      const { panelWidthMeters: PW } = bi.solarPotential
      const rowBearing = geoBearing(startLat, startLng, endLat, endLng)
      const totalDist = geoDistanceM(startLat, startLng, endLat, endLng)
      const spacing = PW + 0.05
      const count = Math.max(1, Math.round(totalDist / spacing))
      return Array.from({ length: count }, (_, i) => {
        const pos = i === 0
          ? { lat: startLat, lng: startLng }
          : offsetLatLng(startLat, startLng, i * spacing, rowBearing)
        return { lat: pos.lat, lng: pos.lng, ...findNearestSegment(bi, pos.lat, pos.lng) }
      })
    }

    function renderDragGhosts(placements: PanelPlacement[]) {
      clearDragGhosts()
      const bi = biRef.current
      const { panelWidthMeters: PW, panelHeightMeters: PH } = bi.solarPotential
      placements.slice(0, 24).forEach(p => {
        const corners = panelCorners(p.lat, p.lng, p.azimuth, PW, PH, 'PORTRAIT')
        const poly = new window.google.maps.Polygon({
          paths: corners, map,
          fillColor: '#3b82f6', fillOpacity: 0.4,
          strokeColor: '#1d4ed8', strokeWeight: 1.5, clickable: false,
        })
        dragGhostsRef.current.push(poly)
      })
      setDragCount(placements.length)
    }

    // ── mousedown ─────────────────────────────────────────────────────────
    const onMouseDown = (e: MouseEvent) => {
      if (modeRef.current !== 'place' || e.button !== 0) return
      e.preventDefault()
      dragStart = { x: e.clientX, y: e.clientY, ...pixelToLatLng(e.clientX, e.clientY) }
      hasDragged = false
    }
    mapDiv.addEventListener('mousedown', onMouseDown)

    // ── mousemove ─────────────────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      if (!dragStart || modeRef.current !== 'place') return
      const pixelDist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y)
      if (pixelDist < 8) return
      hasDragged = true
      const cur = pixelToLatLng(e.clientX, e.clientY)
      renderDragGhosts(buildRowPlacements(dragStart.lat, dragStart.lng, cur.lat, cur.lng))
    }
    document.addEventListener('mousemove', onMouseMove)

    // ── mouseup ───────────────────────────────────────────────────────────
    const onMouseUp = (e: MouseEvent) => {
      if (!dragStart || modeRef.current !== 'place') return
      const cur = pixelToLatLng(e.clientX, e.clientY)
      clearDragGhosts()

      if (hasDragged) {
        justDragged = true
        setTimeout(() => { justDragged = false }, 100)
        cbRef.current.onAddPanelRow(buildRowPlacements(dragStart.lat, dragStart.lng, cur.lat, cur.lng))
      }
      // Single-click placement handled below via map 'click' listener
      dragStart = null
      hasDragged = false
    }
    document.addEventListener('mouseup', onMouseUp)

    // ── map click = single panel placement (empty area only, not polygons) ─
    map.addListener('click', (e: any) => {
      if (modeRef.current !== 'place' || justDragged) return
      const lat: number = e.latLng.lat()
      const lng: number = e.latLng.lng()
      const seg = findNearestSegment(biRef.current, lat, lng)
      cbRef.current.onAddPanelRow([{ lat, lng, ...seg }])
    })

    // ── map click deselects any selected custom panel ─────────────────────
    map.addListener('click', () => {
      if (modeRef.current === 'pan' && selIdRef.current !== null) {
        cbRef.current.onSelectCustomPanel(null)
      }
    })

    return () => {
      mapDiv.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [mapsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── API panel polygons ────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || !buildingInsights.solarPotential?.solarPanels?.length) return
    const { solarPanels, roofSegmentStats, panelWidthMeters, panelHeightMeters } = buildingInsights.solarPotential
    apiPolygonsRef.current.forEach(p => p.setMap(null))
    apiPolygonsRef.current = []

    solarPanels.forEach((panel, idx) => {
      const segment = roofSegmentStats?.[panel.segmentIndex]
      const azimuth = segment?.azimuthDegrees ?? 180
      const orientation = panelOrientations[idx] ?? panel.orientation
      const corners = panelCorners(panel.center.latitude, panel.center.longitude, azimuth, panelWidthMeters, panelHeightMeters, orientation)
      const colors = getPanelFill(azimuth, enabledPanels.has(idx))
      const polygon = new window.google.maps.Polygon({
        paths: corners, map: mapRef.current,
        fillColor: colors.fill, fillOpacity: colors.fillOpacity,
        strokeColor: colors.stroke, strokeWeight: colors.strokeWeight, clickable: true,
      })
      polygon.addListener('click', (e: any) => {
        e.stop?.()
        if (e.domEvent?.shiftKey) cbRef.current.onShiftClickPanel(idx)
        else cbRef.current.onTogglePanel(idx)
      })
      polygon.addListener('rightclick', (e: any) => { e.stop?.(); cbRef.current.onShiftClickPanel(idx) })
      apiPolygonsRef.current.push(polygon)
    })

    return () => { apiPolygonsRef.current.forEach(p => p.setMap(null)); apiPolygonsRef.current = [] }
  }, [mapsLoaded, buildingInsights, panelOrientations]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update API polygon colours when enabled state changes
  useEffect(() => {
    const { solarPanels, roofSegmentStats } = buildingInsights.solarPotential
    apiPolygonsRef.current.forEach((polygon, idx) => {
      const segment = roofSegmentStats?.[solarPanels[idx]?.segmentIndex ?? 0]
      const azimuth = segment?.azimuthDegrees ?? 180
      const colors = getPanelFill(azimuth, enabledPanels.has(idx))
      polygon.setOptions({ fillColor: colors.fill, fillOpacity: colors.fillOpacity, strokeColor: colors.stroke })
    })
  }, [enabledPanels, buildingInsights])

  // ── Custom panel polygons ─────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current) return
    const { panelWidthMeters: PW, panelHeightMeters: PH } = buildingInsights.solarPotential

    // Remove polygons for deleted panels
    customPolygonsRef.current.forEach((polygon, id) => {
      if (!customPanels.find(cp => cp.id === id)) { polygon.setMap(null); customPolygonsRef.current.delete(id) }
    })

    customPanels.forEach(cp => {
      const isEnabled = enabledCustomPanels.has(cp.id)
      const isSelected = cp.id === selectedCustomPanelId
      const colors = getPanelFill(cp.azimuth, isEnabled, true, isSelected)

      if (customPolygonsRef.current.has(cp.id)) {
        customPolygonsRef.current.get(cp.id)!.setOptions({
          fillColor: colors.fill, fillOpacity: colors.fillOpacity,
          strokeColor: colors.stroke, strokeWeight: colors.strokeWeight,
        })
        return
      }

      const corners = panelCorners(cp.lat, cp.lng, cp.azimuth, PW, PH, cp.orientation)
      const polygon = new window.google.maps.Polygon({
        paths: corners, map: mapRef.current,
        fillColor: colors.fill, fillOpacity: colors.fillOpacity,
        strokeColor: colors.stroke, strokeWeight: 1.5, strokeOpacity: 0.9, clickable: true,
      })
      polygon.addListener('click', (e: any) => {
        e.stop?.()
        cbRef.current.onSelectCustomPanel(cp.id)
        cbRef.current.onToggleCustomPanel(cp.id)
      })
      polygon.addListener('rightclick', (e: any) => { e.stop?.(); cbRef.current.onRemoveCustomPanel(cp.id) })
      customPolygonsRef.current.set(cp.id, polygon)
    })
  }, [customPanels, enabledCustomPanels, selectedCustomPanelId, buildingInsights])

  // ── Extend-row ghost panels (← selected panel →) ─────────────────────────

  useEffect(() => {
    extendGhostsRef.current.forEach(p => p.setMap(null))
    extendGhostsRef.current = []
    if (!mapRef.current || selectedCustomPanelId === null) return

    const cp = customPanels.find(p => p.id === selectedCustomPanelId)
    if (!cp) return

    const { panelWidthMeters: PW, panelHeightMeters: PH } = buildingInsights.solarPotential
    // Spacing along the row = panel cross-direction size + gap
    const spacing = (cp.orientation === 'PORTRAIT' ? PW : PH) + 0.05

    for (const dir of ['left', 'right'] as const) {
      const rowBearing = (cp.azimuth + (dir === 'right' ? 90 : -90) + 360) % 360
      const pos = offsetLatLng(cp.lat, cp.lng, spacing, rowBearing)
      const corners = panelCorners(pos.lat, pos.lng, cp.azimuth, PW, PH, cp.orientation)
      const ghost = new window.google.maps.Polygon({
        paths: corners, map: mapRef.current,
        fillColor: '#3b82f6', fillOpacity: 0.18,
        strokeColor: '#3b82f6', strokeWeight: 2, strokeOpacity: 0.75,
        clickable: true,
      })
      const dirCopy = dir
      const idCopy = selectedCustomPanelId
      ghost.addListener('click', (e: any) => { e.stop?.(); cbRef.current.onExtendRow(idCopy, dirCopy) })
      extendGhostsRef.current.push(ghost)
    }
  }, [selectedCustomPanelId, customPanels, buildingInsights])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function zoomBy(delta: number) {
    if (!mapRef.current) return
    mapRef.current.setZoom(mapRef.current.getZoom() + delta)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!mapsLoaded) {
    return (
      <div className="w-full rounded-lg border border-border bg-muted flex items-center justify-center" style={{ minHeight: 520 }}>
        <span className="text-sm text-muted-foreground">Loading map…</span>
      </div>
    )
  }

  return (
    <div className="relative w-full flex flex-col gap-2">

      {/* Mode toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setMode('pan')}
          className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
            mode === 'pan'
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-muted-foreground border-border hover:border-foreground/40'}`}>
          ✋ Pan / Zoom
        </button>
        <button onClick={() => setMode('place')}
          className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
            mode === 'place'
              ? 'bg-accent text-accent-foreground border-accent'
              : 'bg-background text-muted-foreground border-border hover:border-accent/50'}`}>
          ☀ Place Panels
        </button>
        <span className="text-xs text-muted-foreground">
          {mode === 'place'
            ? dragCount > 0
              ? `${dragCount} panel${dragCount !== 1 ? 's' : ''} — release to place`
              : 'Click = 1 panel · Click & drag = row · direction auto from roof data'
            : 'Drag to pan · Scroll to zoom · Click custom panel to select it'}
        </span>
      </div>

      <div className="relative">
        <div
          ref={mapDivRef}
          className="w-full rounded-lg border border-border overflow-hidden"
          style={{ minHeight: 520, cursor: mode === 'place' ? 'crosshair' : undefined }}
        />

        {/* North indicator */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none"
          style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
          N
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
          {[{ label: '+', delta: 1 }, { label: '−', delta: -1 }].map(({ label, delta }) => (
            <button key={label} onClick={() => zoomBy(delta)}
              className="w-8 h-8 bg-white/90 border border-black/20 rounded shadow text-sm font-bold flex items-center justify-center hover:bg-white transition-colors">
              {label}
            </button>
          ))}
        </div>

        {/* Legend + hint */}
        <div className="absolute bottom-4 left-3 z-10 flex flex-col gap-1 text-xs bg-white/90 border border-black/10 rounded px-2 py-1.5 shadow">
          {[['#22c55e', 'North (optimal)'], ['#f59e0b', 'East'], ['#8b5cf6', 'West'], ['#ef4444', 'South (poor)']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: c }} />
              <span className="text-gray-700">{l}</span>
            </div>
          ))}
          {selectedCustomPanelId !== null && (
            <div className="border-t border-gray-200 mt-0.5 pt-0.5 text-blue-700 font-medium">
              Panel selected · click the ghost outlines to extend the row
            </div>
          )}
          <div className="border-t border-gray-200 mt-0.5 pt-0.5 text-gray-500">
            Right-click custom panel to delete · Shift+click API panel to flip
          </div>
        </div>
      </div>
    </div>
  )
}
