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
