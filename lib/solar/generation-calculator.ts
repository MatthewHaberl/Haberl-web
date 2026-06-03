import { PSH_GAUTENG, SYSTEM_EFFICIENCY } from './quote-calculator'

// Gauteng location: approximately -26° latitude (Southern Hemisphere)
const GAUTENG_LATITUDE = -26

// Seasonal irradiance estimates (W/m²) - clear sky assumptions
const SUMMER_IRRADIANCE = 1100 // December, peak summer
const WINTER_IRRADIANCE = 900   // June, peak winter
const AVERAGE_IRRADIANCE = (SUMMER_IRRADIANCE + WINTER_IRRADIANCE) / 2

export type Season = 'summer' | 'winter' | 'average'

export interface HourlyGeneration {
  hour: number
  timeLabel: string
  generation_kw: number
}

export interface StringGenerationSummary {
  peak_kw: number
  peak_time: string
  peak_hour: number
  daily_kwh: number
  hourly: HourlyGeneration[]
}

function getSeasonalIrradiance(season: Season): number {
  switch (season) {
    case 'summer': return SUMMER_IRRADIANCE
    case 'winter': return WINTER_IRRADIANCE
    case 'average': return AVERAGE_IRRADIANCE
    default: return AVERAGE_IRRADIANCE
  }
}

// Solar position calculation using simplified method
// Returns solar elevation angle (0-90°) and solar azimuth (0-360°)
function getSolarPosition(
  month: number,
  hour: number, // 0-23
  latitude: number,
): { elevation: number; azimuth: number } {
  // Day of year estimate
  const dayOfYear = Math.floor((month * 365) / 12)

  // Solar declination (Woolf approximation)
  const declination = 23.45 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365)
  const decRad = declination * Math.PI / 180

  // Solar time (simplified - no equation of time correction)
  const solarHour = hour - 12 // centered on solar noon

  // Hour angle
  const hourAngle = (solarHour * 15) * Math.PI / 180

  const latRad = latitude * Math.PI / 180

  // Solar elevation angle
  const sinElev = Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(hourAngle)
  const elevation = Math.asin(Math.max(0, sinElev)) * 180 / Math.PI

  // Solar azimuth (0=north, 90=east, 180=south, 270=west)
  const cosAzim = (Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(hourAngle)) /
    (Math.cos(elevation * Math.PI / 180) || 1)
  const sinAzim = Math.sin(hourAngle) * Math.cos(decRad) / (Math.cos(elevation * Math.PI / 180) || 1)

  let azimuth = Math.atan2(sinAzim, cosAzim) * 180 / Math.PI
  azimuth = (azimuth + 360) % 360 // normalize to 0-360

  return { elevation: Math.max(0, elevation), azimuth }
}

// Calculate irradiance on tilted surface using cosine law
// roofAzimuth: 0=north, 90=east, 180=south, 270=west (Southern Hemisphere)
// roofPitch: tilt angle from horizontal (0-90°)
function getIrradianceOnTiltedSurface(
  elevation: number,
  azimuth: number,
  roofAzimuth: number,
  roofPitch: number,
  baseIrradiance: number,
): number {
  if (elevation <= 0) return 0

  const elevRad = elevation * Math.PI / 180
  const aziRad = azimuth * Math.PI / 180
  const roofAziRad = roofAzimuth * Math.PI / 180
  const pitchRad = roofPitch * Math.PI / 180

  // Normal vector components of the tilted surface
  const normalX = Math.sin(pitchRad) * Math.sin(roofAziRad)
  const normalY = Math.sin(pitchRad) * Math.cos(roofAziRad)
  const normalZ = Math.cos(pitchRad)

  // Solar direction components (beam from sun)
  const sunX = Math.cos(elevRad) * Math.sin(aziRad)
  const sunY = Math.cos(elevRad) * Math.cos(aziRad)
  const sunZ = Math.sin(elevRad)

  // Cosine of angle of incidence (dot product)
  const cosIncidence = normalX * sunX + normalY * sunY + normalZ * sunZ
  const cosIncidenceClipped = Math.max(0, cosIncidence)

  // Beam irradiance on tilted surface
  const beamIrradiance = baseIrradiance * cosIncidenceClipped

  // Add diffuse irradiance (sky dome, roughly isotropic)
  const diffuseIrradiance = baseIrradiance * 0.2 * (1 + Math.cos(pitchRad)) / 2

  return beamIrradiance + diffuseIrradiance
}

export function calculateStringGeneration(
  panelCount: number,
  panelWatts: number,
  roofAzimuth: number,
  roofPitch: number,
  season: Season = 'average',
): StringGenerationSummary {
  const baseIrradiance = getSeasonalIrradiance(season)
  const hourly: HourlyGeneration[] = []

  let peakGeneration = 0
  let peakHour = 12
  let totalDaily = 0

  // Calculate for each hour from 6am to 6pm (typical solar hours)
  for (let hour = 6; hour <= 18; hour++) {
    const { elevation, azimuth } = getSolarPosition(6, hour, GAUTENG_LATITUDE) // Use June for consistency

    const irradiance = getIrradianceOnTiltedSurface(
      elevation,
      azimuth,
      roofAzimuth,
      roofPitch,
      baseIrradiance,
    )

    // DC output: panels are not 100% efficient
    const dcEfficiency = 0.95 // Panel temperature losses and other factors
    const panelDcOutput = (panelCount * panelWatts * irradiance / 1000) * dcEfficiency

    // AC output: inverter efficiency
    const panelAcOutput = panelDcOutput * SYSTEM_EFFICIENCY

    // Convert to kW
    const generationKw = panelAcOutput / 1000

    hourly.push({
      hour,
      timeLabel: `${hour}:00`,
      generation_kw: Math.max(0, generationKw),
    })

    totalDaily += Math.max(0, generationKw)

    if (generationKw > peakGeneration) {
      peakGeneration = generationKw
      peakHour = hour
    }
  }

  // Average over 1 hour intervals to get daily kWh
  const dailyKwh = totalDaily

  const peakTime = `${String(peakHour).padStart(2, '0')}:30`

  return {
    peak_kw: Math.round(peakGeneration * 100) / 100,
    peak_time: peakTime,
    peak_hour: peakHour,
    daily_kwh: Math.round(dailyKwh * 100) / 100,
    hourly,
  }
}

export function calculateAllStringsGeneration(
  strings: Array<{ panelCount: number; azimuth: number; pitch: number }>,
  panelWatts: number,
  season: Season = 'average',
): Map<number, StringGenerationSummary> {
  const results = new Map<number, StringGenerationSummary>()
  strings.forEach((string, idx) => {
    results.set(idx, calculateStringGeneration(string.panelCount, panelWatts, string.azimuth, string.pitch, season))
  })
  return results
}

// ── Monthly breakdown ─────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Daylight hours per month for Gauteng (~26°S)
const MONTHLY_DAYLIGHT_HOURS = [14.0, 13.2, 12.4, 11.4, 10.7, 10.3, 10.5, 11.3, 12.2, 13.1, 13.9, 14.2]

// Monthly solar factors for Gauteng — winter is clearer but shorter days
const MONTHLY_SOLAR_FACTORS = [0.93, 0.94, 0.98, 1.01, 1.04, 1.05, 1.06, 1.05, 1.02, 0.98, 0.96, 0.98]
const MONTHLY_FACTOR_AVG = MONTHLY_SOLAR_FACTORS.reduce((s, f) => s + f, 0) / 12

export interface MonthlyGenerationRow {
  month: string
  daylightHours: number
  generationKwh: number
  cumulativeKwh: number
}

export interface SegmentMonthlyData {
  label: string
  azimuth: number
  panelCount: number
  monthly: MonthlyGenerationRow[]
  annualKwh: number
}

export interface MonthlyBreakdown {
  segments: SegmentMonthlyData[]
  totals: MonthlyGenerationRow[]
  annualTotal: number
}

function orientationLabel(azimuth: number): string {
  if (azimuth >= 340 || azimuth < 20) return 'North'
  if (azimuth >= 70 && azimuth < 110) return 'East'
  if (azimuth >= 160 && azimuth < 200) return 'South'
  if (azimuth >= 250 && azimuth < 290) return 'West'
  return `${Math.round(azimuth)}°`
}

export function calculateMonthlyBreakdown(
  segments: Array<{ panelCount: number; azimuth: number; pitch: number }>,
  panelWatts: number,
): MonthlyBreakdown {
  const segmentResults: SegmentMonthlyData[] = segments.map(seg => {
    const avgGen = calculateStringGeneration(seg.panelCount, panelWatts, seg.azimuth, seg.pitch, 'average')
    let cumulative = 0
    const monthly = MONTH_NAMES.map((month, i) => {
      const factor = MONTHLY_SOLAR_FACTORS[i] / MONTHLY_FACTOR_AVG
      const monthlyKwh = Math.round(avgGen.daily_kwh * DAYS_PER_MONTH[i] * factor)
      cumulative += monthlyKwh
      return { month, daylightHours: MONTHLY_DAYLIGHT_HOURS[i], generationKwh: monthlyKwh, cumulativeKwh: Math.round(cumulative) }
    })
    return { label: orientationLabel(seg.azimuth), azimuth: seg.azimuth, panelCount: seg.panelCount, monthly, annualKwh: Math.round(cumulative) }
  })

  let cumulativeTotal = 0
  const totals = MONTH_NAMES.map((month, i) => {
    const monthTotal = segmentResults.reduce((s, seg) => s + seg.monthly[i].generationKwh, 0)
    cumulativeTotal += monthTotal
    return { month, daylightHours: MONTHLY_DAYLIGHT_HOURS[i], generationKwh: monthTotal, cumulativeKwh: Math.round(cumulativeTotal) }
  })

  return { segments: segmentResults, totals, annualTotal: Math.round(cumulativeTotal) }
}
