'use client'

import { useEffect, useRef, useState } from 'react'
import type { BuildingInsights } from '@/lib/solar/google-solar'

// Google Maps JS API is loaded dynamically — type as any
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
  // "Up the slope" = opposite of where the slope faces (toward the ridge)
  const upN = -Math.cos(az)
  const upE = -Math.sin(az)
  // "Across the slope" = 90° clockwise from up-slope
  const acN = Math.sin(az)
  const acE = -Math.cos(az)

  // Portrait: long dim up the slope. Landscape: long dim across the slope.
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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  buildingInsights: BuildingInsights
  selectedSegmentIdx: number
  enabledPanels: Set<number>
  onTogglePanel: (index: number) => void
}

export function SolarMap({ buildingInsights, selectedSegmentIdx, enabledPanels, onTogglePanel }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)       // eslint-disable-line @typescript-eslint/no-explicit-any
  const polygonsRef = useRef<any[]>([])  // eslint-disable-line @typescript-eslint/no-explicit-any
  const compassRef = useRef<HTMLDivElement>(null)
  const [mapsLoaded, setMapsLoaded] = useState(false)

  // Keep callback ref fresh so polygon click listeners don't get stale closures
  const onToggleRef = useRef(onTogglePanel)
  useEffect(() => { onToggleRef.current = onTogglePanel })

  // Load Google Maps JS API once
  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return }
    const existing = document.querySelector<HTMLScriptElement>('script[data-solar-maps]')
    if (existing) {
      // Script already injected — listen for its load
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

  // Initialise map once script is ready
  useEffect(() => {
    if (!mapsLoaded || !mapDivRef.current || mapRef.current) return
    const { center } = buildingInsights
    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: center.latitude, lng: center.longitude },
      zoom: 20,
      mapTypeId: 'satellite',
      tilt: 0,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    })
  }, [mapsLoaded, buildingInsights])

  // Draw panel polygons once map and data are ready (recreate when segment or data changes)
  useEffect(() => {
    if (!mapRef.current || !buildingInsights.solarPotential?.solarPanels?.length) return

    const { solarPotential } = buildingInsights
    const { solarPanels, roofSegmentStats, panelWidthMeters, panelHeightMeters } = solarPotential

    // Remove old polygons
    polygonsRef.current.forEach(p => p.setMap(null))
    polygonsRef.current = []

    solarPanels.forEach((panel, idx) => {
      // Only draw panels for the selected segment
      if (panel.segmentIndex !== selectedSegmentIdx) return

      const segment = roofSegmentStats?.[panel.segmentIndex]
      const azimuth = segment?.azimuthDegrees ?? 180

      const corners = panelCorners(
        panel.center.latitude,
        panel.center.longitude,
        azimuth,
        panelWidthMeters,
        panelHeightMeters,
        panel.orientation,
      )

      const isEnabled = enabledPanels.has(idx)
      const polygon = new window.google.maps.Polygon({
        paths: corners,
        map: mapRef.current,
        fillColor: isEnabled ? '#22c55e' : '#94a3b8',
        fillOpacity: isEnabled ? 0.8 : 0.3,
        strokeColor: isEnabled ? '#16a34a' : '#64748b',
        strokeWeight: 0.5,
        clickable: true,
      })

      polygon.addListener('click', () => onToggleRef.current(idx))
      polygonsRef.current.push(polygon)
    })

    // Cleanup on unmount or data change
    return () => {
      polygonsRef.current.forEach(p => p.setMap(null))
      polygonsRef.current = []
    }
  }, [mapsLoaded, buildingInsights, selectedSegmentIdx]) // intentionally omits enabledPanels — colours updated separately

  // Update polygon colours when toggle state changes (no polygon recreation)
  useEffect(() => {
    polygonsRef.current.forEach((polygon, idx) => {
      const isEnabled = enabledPanels.has(idx)
      polygon.setOptions({
        fillColor: isEnabled ? '#22c55e' : '#94a3b8',
        fillOpacity: isEnabled ? 0.8 : 0.3,
        strokeColor: isEnabled ? '#16a34a' : '#64748b',
      })
    })
  }, [enabledPanels])

  // Add north indicator compass
  useEffect(() => {
    if (!mapRef.current || !compassRef.current) return

    // Position compass in the center top of map
    const updateCompass = () => {
      if (compassRef.current && mapRef.current) {
        const bounds = mapRef.current.getDiv().getBoundingClientRect()
        compassRef.current.style.left = (bounds.width / 2 - 15) + 'px'
        compassRef.current.style.top = '10px'
      }
    }

    updateCompass()
    window.addEventListener('resize', updateCompass)
    return () => window.removeEventListener('resize', updateCompass)
  }, [mapsLoaded])

  if (!mapsLoaded) {
    return (
      <div
        className="flex-1 rounded-lg border border-border bg-muted flex items-center justify-center"
        style={{ minHeight: 500 }}
      >
        <span className="text-sm text-muted-foreground">Loading map…</span>
      </div>
    )
  }

  return (
    <div className="flex-1 relative">
      <div
        ref={mapDivRef}
        className="w-full rounded-lg border border-border overflow-hidden"
        style={{ minHeight: 500 }}
      />
      {/* North Indicator Compass */}
      <div
        ref={compassRef}
        className="absolute z-10 pointer-events-none select-none"
        style={{
          width: '30px',
          height: '30px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid rgba(0, 0, 0, 0.2)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        N
      </div>
    </div>
  )
}
