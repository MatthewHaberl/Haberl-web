// Google Solar API — BuildingInsights endpoint types
// https://developers.google.com/maps/documentation/solar/reference/rest/v1/buildingInsights

export interface LatLng {
  latitude: number
  longitude: number
}

export interface SolarPanel {
  center: LatLng
  orientation: 'PORTRAIT' | 'LANDSCAPE'
  yearlyEnergyDcKwh: number
  segmentIndex: number
}

export interface SolarPanelGroup {
  azimuthDegrees: number
  pitchDegrees: number
  panelsCount: number
  yearlyEnergyDcKwh: number
  panelIndices: number[]
}

export interface RoofSegmentStat {
  pitchDegrees: number
  azimuthDegrees: number
  stats: {
    areaMeters2: number
    sunshineQuantiles: number[]
    groundAreaMeters2: number
  }
  center: LatLng
  boundingBox: { sw: LatLng; ne: LatLng }
  planeHeightAtCenterMeters: number
}

export interface SolarPotential {
  maxArrayPanelsCount: number
  maxArrayAreaMeters2: number
  maxSunshineHoursPerYear: number
  carbonOffsetFactorKgPerMwh: number
  panelCapacityWatts: number
  panelHeightMeters: number
  panelWidthMeters: number
  panelLifetimeYears: number
  buildingStats: {
    areaMeters2: number
    sunshineQuantiles: number[]
    groundAreaMeters2: number
  }
  roofSegmentStats: RoofSegmentStat[]
  solarPanels: SolarPanel[]
  solarPanelGroups: SolarPanelGroup[]
}

export interface BuildingInsights {
  name: string
  center: LatLng
  boundingBox: { sw: LatLng; ne: LatLng }
  imageryDate: { year: number; month: number; day: number }
  imageryProcessedDate: { year: number; month: number; day: number }
  postalCode: string
  administrativeArea: string
  statisticalArea: string
  regionCode: string
  solarPotential: SolarPotential
  imageryQuality: 'HIGH' | 'MEDIUM' | 'LOW'
}

// ── Roof design output (stored in Supabase) ───────────────────────────────────

export interface RoofSegmentDesign {
  azimuth: number
  pitch: number
  panelCount: number
}

export interface RoofDesign {
  panelCount: number
  totalKwp: number
  annualKwh: number
  segments: RoofSegmentDesign[]
  panelWatts: number
}

// ── Panel strings and groups ──────────────────────────────────────────────────

export type RoofSegmentSummary = RoofSegmentStat

export interface StringPanel {
  panelIndex: number
  panel: SolarPanel
  stringId: number
}

export interface PanelString {
  id: number
  segmentIndex: number
  panelIndices: number[]
  enabled: boolean
}

export interface CustomPanel {
  id: number
  lat: number
  lng: number
  orientation: 'PORTRAIT' | 'LANDSCAPE'
  segmentIndex: number
  azimuth: number
  pitch: number
}

export function generatePanelStrings(
  panels: SolarPanel[],
  segmentIndex: number,
  stringsPerSegment: number = 8,
): PanelString[] {
  // Filter panels for this segment
  const segmentPanels = panels
    .map((p, idx) => ({ index: idx, panel: p }))
    .filter(({ panel }) => panel.segmentIndex === segmentIndex)

  if (segmentPanels.length === 0) return []

  // Sort panels by position (roughly left-to-right, top-to-bottom)
  segmentPanels.sort((a, b) => {
    const latDiff = b.panel.center.latitude - a.panel.center.latitude
    if (Math.abs(latDiff) > 0.0001) return latDiff
    return a.panel.center.longitude - b.panel.center.longitude
  })

  // Distribute panels into strings
  const panelsPerString = Math.max(1, Math.ceil(segmentPanels.length / stringsPerSegment))
  const strings: PanelString[] = []

  for (let i = 0; i < segmentPanels.length; i += panelsPerString) {
    const stringId = strings.length
    const panelIndices = segmentPanels.slice(i, i + panelsPerString).map(p => p.index)
    strings.push({
      id: stringId,
      segmentIndex,
      panelIndices,
      enabled: true,
    })
  }

  return strings
}
