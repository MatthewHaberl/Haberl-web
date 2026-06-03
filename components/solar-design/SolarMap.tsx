'use client'

import { useEffect, useRef, useState } from 'react'
import type { BuildingInsights, CustomPanel } from '@/lib/solar/google-solar'

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

// Color by roof azimuth so user can tell orientations apart at a glance
function getPanelFill(azimuth: number, isEnabled: boolean, isCustom = false): { fill: string; fillOpacity: number; stroke: string; strokeWeight: number } {
  if (!isEnabled) return { fill: '#94a3b8', fillOpacity: 0.25, stroke: '#64748b', strokeWeight: 0.5 }
  let fill = '#22c55e'; let stroke = '#16a34a' // North — green (optimal)
  if (azimuth >= 70 && azimuth < 110) { fill = '#f59e0b'; stroke = '#d97706' }        // East — amber
  else if (azimuth >= 110 && azimuth < 250) { fill = '#ef4444'; stroke = '#dc2626' }  // South/SE/SW — red
  else if (azimuth >= 250 && azimuth < 340) { fill = '#8b5cf6'; stroke = '#7c3aed' }  // West — violet
  return { fill, fillOpacity: isCustom ? 0.65 : 0.82, stroke, strokeWeight: isCustom ? 1.5 : 0.5 }
}

function findNearestSegmentIndex(buildingInsights: BuildingInsights, lat: number, lng: number): number {
  const panels = buildingInsights.solarPotential.solarPanels
  let minDist = Infinity
  let nearest = 0
  panels.forEach(p => {
    const d = Math.hypot(p.center.latitude - lat, p.center.longitude - lng)
    if (d < minDist) { minDist = d; nearest = p.segmentIndex }
  })
  return nearest
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  buildingInsights: BuildingInsights
  enabledPanels: Set<number>
  customPanels: CustomPanel[]
  enabledCustomPanels: Set<number>
  panelOrientations: Record<number, 'PORTRAIT' | 'LANDSCAPE'>
  onTogglePanel: (index: number) => void
  onToggleCustomPanel: (id: number) => void
  onShiftClickPanel: (index: number) => void
  onAddCustomPanel: (lat: number, lng: number, segmentIndex: number, azimuth: number, pitch: number) => void
  onRemoveCustomPanel: (id: number) => void
}

export function SolarMap({
  buildingInsights, enabledPanels, customPanels, enabledCustomPanels,
  panelOrientations, onTogglePanel, onToggleCustomPanel,
  onShiftClickPanel, onAddCustomPanel, onRemoveCustomPanel,
}: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)           // eslint-disable-line @typescript-eslint/no-explicit-any
  const apiPolygonsRef = useRef<any[]>([])   // eslint-disable-line @typescript-eslint/no-explicit-any
  const customPolygonsRef = useRef<Map<number, any>>(new Map()) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [mapsLoaded, setMapsLoaded] = useState(false)

  // Keep callbacks fresh
  const cbRef = useRef({ onTogglePanel, onToggleCustomPanel, onShiftClickPanel, onAddCustomPanel, onRemoveCustomPanel })
  useEffect(() => { cbRef.current = { onTogglePanel, onToggleCustomPanel, onShiftClickPanel, onAddCustomPanel, onRemoveCustomPanel } })

  // Load Google Maps JS API once
  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return }
    const existing = document.querySelector<HTMLScriptElement>('script[data-solar-maps]')
    if (existing) {
      existing.addEventListener('load', () => setMapsLoaded(true), { once: true })
      return
    }
    const script = document.createElement('script')
    script.setAttribute('data-solar-maps', '1')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}`
    script.async = true
    script.onload = () => setMapsLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Initialise map once
  useEffect(() => {
    if (!mapsLoaded || !mapDivRef.current || mapRef.current) return
    const { center } = buildingInsights
    const map = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: center.latitude, lng: center.longitude },
      zoom: 21,
      maxZoom: 22,
      minZoom: 17,
      mapTypeId: 'satellite',
      tilt: 0,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: false, // use custom buttons
      scrollwheel: true,
      gestureHandling: 'greedy',
    })
    mapRef.current = map

    // Click on empty map area → add custom panel
    map.addListener('click', (e: any) => {
      const lat: number = e.latLng.lat()
      const lng: number = e.latLng.lng()
      const segIdx = findNearestSegmentIndex(buildingInsights, lat, lng)
      const seg = buildingInsights.solarPotential.roofSegmentStats?.[segIdx]
      cbRef.current.onAddCustomPanel(lat, lng, segIdx, seg?.azimuthDegrees ?? 180, seg?.pitchDegrees ?? 20)
    })
  }, [mapsLoaded, buildingInsights])

  // Draw API panel polygons — recreate when orientation overrides change
  useEffect(() => {
    if (!mapRef.current || !buildingInsights.solarPotential?.solarPanels?.length) return

    const { solarPotential } = buildingInsights
    const { solarPanels, roofSegmentStats, panelWidthMeters, panelHeightMeters } = solarPotential

    apiPolygonsRef.current.forEach(p => p.setMap(null))
    apiPolygonsRef.current = []

    solarPanels.forEach((panel, idx) => {
      const segment = roofSegmentStats?.[panel.segmentIndex]
      const azimuth = segment?.azimuthDegrees ?? 180
      const orientation = panelOrientations[idx] ?? panel.orientation

      const corners = panelCorners(panel.center.latitude, panel.center.longitude, azimuth, panelWidthMeters, panelHeightMeters, orientation)
      const isEnabled = enabledPanels.has(idx)
      const colors = getPanelFill(azimuth, isEnabled)

      const polygon = new window.google.maps.Polygon({
        paths: corners, map: mapRef.current,
        fillColor: colors.fill, fillOpacity: colors.fillOpacity,
        strokeColor: colors.stroke, strokeWeight: colors.strokeWeight,
        clickable: true,
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
    const { solarPotential } = buildingInsights
    const { solarPanels, roofSegmentStats } = solarPotential
    apiPolygonsRef.current.forEach((polygon, idx) => {
      const segment = roofSegmentStats?.[solarPanels[idx]?.segmentIndex ?? 0]
      const azimuth = segment?.azimuthDegrees ?? 180
      const colors = getPanelFill(azimuth, enabledPanels.has(idx))
      polygon.setOptions({ fillColor: colors.fill, fillOpacity: colors.fillOpacity, strokeColor: colors.stroke })
    })
  }, [enabledPanels, buildingInsights])

  // Draw / update custom panel polygons
  useEffect(() => {
    if (!mapRef.current) return
    const { panelWidthMeters, panelHeightMeters } = buildingInsights.solarPotential

    // Remove polygons for deleted custom panels
    customPolygonsRef.current.forEach((polygon, id) => {
      if (!customPanels.find(cp => cp.id === id)) {
        polygon.setMap(null)
        customPolygonsRef.current.delete(id)
      }
    })

    customPanels.forEach(cp => {
      const isEnabled = enabledCustomPanels.has(cp.id)
      const colors = getPanelFill(cp.azimuth, isEnabled, true)

      if (customPolygonsRef.current.has(cp.id)) {
        customPolygonsRef.current.get(cp.id)!.setOptions({
          fillColor: colors.fill, fillOpacity: colors.fillOpacity, strokeColor: colors.stroke,
        })
        return
      }

      const corners = panelCorners(cp.lat, cp.lng, cp.azimuth, panelWidthMeters, panelHeightMeters, cp.orientation)
      const polygon = new window.google.maps.Polygon({
        paths: corners, map: mapRef.current,
        fillColor: colors.fill, fillOpacity: colors.fillOpacity,
        strokeColor: colors.stroke, strokeWeight: 1.5, strokeOpacity: 0.9,
        clickable: true,
      })
      polygon.addListener('click', (e: any) => { e.stop?.(); cbRef.current.onToggleCustomPanel(cp.id) })
      polygon.addListener('rightclick', (e: any) => { e.stop?.(); cbRef.current.onRemoveCustomPanel(cp.id) })
      customPolygonsRef.current.set(cp.id, polygon)
    })
  }, [customPanels, enabledCustomPanels, buildingInsights])

  function zoomBy(delta: number) {
    if (!mapRef.current) return
    mapRef.current.setZoom(mapRef.current.getZoom() + delta)
  }

  if (!mapsLoaded) {
    return (
      <div className="w-full rounded-lg border border-border bg-muted flex items-center justify-center" style={{ minHeight: 520 }}>
        <span className="text-sm text-muted-foreground">Loading map…</span>
      </div>
    )
  }

  return (
    <div className="relative w-full">
      <div ref={mapDivRef} className="w-full rounded-lg border border-border overflow-hidden" style={{ minHeight: 520 }} />

      {/* North indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none"
        style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
        N
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
        {[{ label: '+', delta: 1 }, { label: '−', delta: -1 }].map(({ label, delta }) => (
          <button key={label} onClick={() => zoomBy(delta)}
            className="w-8 h-8 bg-white/90 border border-black/20 rounded shadow text-sm font-bold flex items-center justify-center hover:bg-white transition-colors"
          >{label}</button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-3 z-10 flex flex-col gap-1 text-xs bg-white/90 border border-black/10 rounded px-2 py-1.5 shadow">
        {[['#22c55e', 'North (optimal)'], ['#f59e0b', 'East'], ['#8b5cf6', 'West'], ['#ef4444', 'South (poor)']].map(([c, l]) => (
          <div key={l} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: c }} />
            <span className="text-gray-700">{l}</span>
          </div>
        ))}
        <div className="border-t border-gray-200 mt-0.5 pt-0.5 text-gray-500">Click = add panel • Right-click = delete • Shift+click = flip</div>
      </div>
    </div>
  )
}
