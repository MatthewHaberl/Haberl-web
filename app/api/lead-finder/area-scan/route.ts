import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type ImageryQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'BASE'

interface AreaScanRequest {
  area?: string
  maxCandidates?: number
  minFootprintM2?: number
  solarLimit?: number
  expandedCoverage?: boolean
}

interface OsmGeometryPoint {
  lat: number
  lon: number
}

interface OsmElement {
  type: string
  id: number
  tags?: Record<string, string>
  center?: OsmGeometryPoint
  geometry?: OsmGeometryPoint[]
}

interface AreaCandidate {
  id: string
  osmId: number
  name: string | null
  label: string
  category: string
  footprintM2: number
  latitude: number
  longitude: number
  address: string | null
  mapUrl: string
  osmUrl: string
  tags: {
    building?: string
    amenity?: string
    shop?: string
    leisure?: string
    tourism?: string
    office?: string
    landuse?: string
  }
  solar?: {
    status: 'covered' | 'marginal' | 'not_covered' | 'error' | 'not_checked'
    imageryQuality?: string
    imageryDate?: string | null
    panelCount?: number
    maxKw?: number | null
    annualKwh?: number | null
    roofSegments?: number | null
    roofAreaM2?: number | null
    message?: string
  }
}

const MAX_FOOTPRINT_CANDIDATES = 80
const MAX_SOLAR_CHECKS = 20
const DEFAULT_MIN_FOOTPRINT_M2 = 1000
const DEFAULT_SOLAR_LIMIT = 12
const USER_AGENT = 'HaberlRoofRecon/1.0 (https://haberl.co.za)'

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dateLabel(date?: { year?: number; month?: number; day?: number }) {
  if (!date?.year || !date?.month || !date?.day) return null
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function areaMeters2(coords: OsmGeometryPoint[]) {
  if (coords.length < 3) return 0

  const lat0 = (coords.reduce((sum, point) => sum + point.lat, 0) / coords.length) * Math.PI / 180
  const earthRadiusM = 6371008.8
  const points = coords.map((point) => ({
    x: earthRadiusM * (point.lon * Math.PI / 180) * Math.cos(lat0),
    y: earthRadiusM * (point.lat * Math.PI / 180),
  }))

  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length
    area += points[index].x * points[next].y - points[next].x * points[index].y
  }

  return Math.abs(area) / 2
}

function centroid(coords: OsmGeometryPoint[]) {
  if (!coords.length) return null
  return {
    lat: coords.reduce((sum, point) => sum + point.lat, 0) / coords.length,
    lon: coords.reduce((sum, point) => sum + point.lon, 0) / coords.length,
  }
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim())?.trim() ?? null
}

function formatAddress(tags: Record<string, string>) {
  const street = firstNonEmpty(tags['addr:street'])
  const number = firstNonEmpty(tags['addr:housenumber'])
  if (number && street) return `${number} ${street}`
  return street ?? firstNonEmpty(tags['addr:full'], tags['addr:place'])
}

function categoryFor(tags: Record<string, string>) {
  if (tags.shop === 'mall') return 'Mall'
  if (tags.shop === 'supermarket') return 'Supermarket'
  if (tags.shop) return 'Retail'
  if (tags.tourism === 'hotel') return 'Hotel'
  if (tags.amenity === 'school' || tags.building === 'school') return 'School'
  if (tags.amenity) return tags.amenity.replace(/_/g, ' ')
  if (tags.building === 'industrial' || tags.landuse === 'industrial') return 'Industrial'
  if (tags.building === 'commercial' || tags.office) return 'Commercial'
  if (tags.building === 'retail') return 'Retail'
  if (tags.building === 'parking') return 'Parking structure'
  return 'Building'
}

function labelFor(candidate: Pick<AreaCandidate, 'name' | 'category' | 'footprintM2' | 'address'>) {
  if (candidate.name) return candidate.name
  if (candidate.address) return candidate.address
  return `${candidate.category} roof (${Math.round(candidate.footprintM2).toLocaleString('en-ZA')} m2)`
}

function normalizeArea(area: string) {
  const lower = area.toLowerCase()
  if (lower.includes('gauteng') || lower.includes('south africa')) return area
  return `${area}, Gauteng, South Africa`
}

async function assertEmployeeCanScan() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, message: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { ok: false as const, status: 403, message: 'Manager or admin access required' }
  }

  return { ok: true as const }
}

async function findArea(area: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', normalizeArea(area))
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('addressdetails', '1')

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Area lookup failed (${response.status})`)
  }

  const results = await response.json()
  const result = Array.isArray(results) ? results[0] : null
  if (!result?.boundingbox || !result?.lat || !result?.lon) {
    throw new Error('Could not find that area. Try a suburb name, mall, or road.')
  }

  const [south, north, west, east] = result.boundingbox.map((value: string) => Number(value))
  if (![south, north, west, east].every(Number.isFinite)) {
    throw new Error('Area lookup returned an invalid boundary.')
  }

  const latSpan = Math.abs(north - south)
  const lonSpan = Math.abs(east - west)
  if (latSpan > 0.15 || lonSpan > 0.15) {
    throw new Error('That area is too broad. Try a suburb or business district, not all of Gauteng.')
  }

  return {
    label: result.display_name as string,
    center: {
      latitude: Number(result.lat),
      longitude: Number(result.lon),
    },
    bbox: { south, north, west, east },
  }
}

async function fetchOsmBuildings(bbox: { south: number; west: number; north: number; east: number }) {
  const query = `
[out:json][timeout:25];
(
  way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out tags center geom;
`

  const body = new URLSearchParams({ data: query })
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': USER_AGENT,
    },
    body,
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Building footprint lookup failed (${response.status})`)
  }

  const data = await response.json()
  return Array.isArray(data.elements) ? data.elements as OsmElement[] : []
}

function buildCandidates(elements: OsmElement[], minFootprintM2: number) {
  return elements
    .filter((element) => element.type === 'way' && element.geometry?.length)
    .map((element): AreaCandidate | null => {
      const tags = element.tags ?? {}
      const geometry = element.geometry ?? []
      const center = element.center ?? centroid(geometry)
      if (!center) return null

      const footprintM2 = areaMeters2(geometry)
      if (footprintM2 < minFootprintM2) return null

      const name = firstNonEmpty(tags.name, tags.brand, tags.operator)
      const category = categoryFor(tags)
      const address = formatAddress(tags)
      const latitude = center.lat
      const longitude = center.lon

      const candidate: AreaCandidate = {
        id: `osm-way-${element.id}`,
        osmId: element.id,
        name,
        label: '',
        category,
        footprintM2: Math.round(footprintM2),
        latitude,
        longitude,
        address,
        mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
        osmUrl: `https://www.openstreetmap.org/way/${element.id}`,
        tags: {
          building: tags.building,
          amenity: tags.amenity,
          shop: tags.shop,
          leisure: tags.leisure,
          tourism: tags.tourism,
          office: tags.office,
          landuse: tags.landuse,
        },
        solar: { status: 'not_checked' },
      }

      candidate.label = labelFor(candidate)
      return candidate
    })
    .filter((candidate): candidate is AreaCandidate => candidate !== null)
    .sort((a, b) => b.footprintM2 - a.footprintM2)
    .slice(0, MAX_FOOTPRINT_CANDIDATES)
}

async function fetchSolarInsights(candidate: AreaCandidate, apiKey: string, expandedCoverage: boolean) {
  const url = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest')
  url.searchParams.set('location.latitude', String(candidate.latitude))
  url.searchParams.set('location.longitude', String(candidate.longitude))
  const requiredQuality: ImageryQuality = expandedCoverage ? 'BASE' : 'LOW'
  url.searchParams.set('requiredQuality', requiredQuality)
  if (expandedCoverage) url.searchParams.append('experiments', 'EXPANDED_COVERAGE')
  url.searchParams.set('key', apiKey)

  const response = await fetch(url, { cache: 'no-store' })

  if (response.status === 404) {
    return {
      status: 'not_covered' as const,
      message: 'No Solar API building found near this footprint.',
    }
  }

  if (!response.ok) {
    const message = await response.text()
    return {
      status: 'error' as const,
      message: `Google Solar API error (${response.status}): ${message.slice(0, 180)}`,
    }
  }

  const data = await response.json()
  const solarPotential = data.solarPotential ?? {}
  const panels = Array.isArray(solarPotential.solarPanels) ? solarPotential.solarPanels : []
  const maxPanels = numberOrNull(solarPotential.maxArrayPanelsCount) ?? panels.length
  const panelCount = panels.length || maxPanels || 0
  const panelCapacityWatts = numberOrNull(solarPotential.panelCapacityWatts)
  const annualKwh = panels.reduce((sum: number, panel: { yearlyEnergyDcKwh?: unknown }) => {
    return sum + (numberOrNull(panel.yearlyEnergyDcKwh) ?? 0)
  }, 0)
  const roofSegments = Array.isArray(solarPotential.roofSegmentStats)
    ? solarPotential.roofSegmentStats.length
    : null

  return {
    status: panelCount > 0 && roofSegments ? 'covered' as const : 'marginal' as const,
    imageryQuality: data.imageryQuality as string | undefined,
    imageryDate: dateLabel(data.imageryDate),
    panelCount,
    maxKw: panelCapacityWatts ? Number(((panelCount * panelCapacityWatts) / 1000).toFixed(1)) : null,
    annualKwh: annualKwh > 0 ? Math.round(annualKwh) : null,
    roofSegments,
    roofAreaM2: numberOrNull(solarPotential.buildingStats?.areaMeters2)
      ?? numberOrNull(solarPotential.maxArrayAreaMeters2),
    message: panelCount > 0 ? 'Roof-level solar data returned.' : 'Building found, but no panel placements were returned.',
  }
}

export async function POST(req: Request) {
  const access = await assertEmployeeCanScan()
  if (!access.ok) {
    return Response.json({ error: access.message }, { status: access.status })
  }

  let body: AreaScanRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const area = body.area?.trim()
  if (!area) {
    return Response.json({ error: 'Area is required.' }, { status: 400 })
  }

  const maxCandidates = clampNumber(body.maxCandidates, 5, MAX_FOOTPRINT_CANDIDATES, 30)
  const minFootprintM2 = clampNumber(body.minFootprintM2, 250, 10000, DEFAULT_MIN_FOOTPRINT_M2)
  const solarLimit = clampNumber(body.solarLimit, 0, MAX_SOLAR_CHECKS, DEFAULT_SOLAR_LIMIT)
  const expandedCoverage = body.expandedCoverage !== false

  try {
    const areaResult = await findArea(area)
    const buildings = await fetchOsmBuildings(areaResult.bbox)
    const candidates = buildCandidates(buildings, minFootprintM2).slice(0, maxCandidates)
    const apiKey = process.env.GOOGLE_SOLAR_API_KEY
    const solarChecks = apiKey ? Math.min(solarLimit, candidates.length) : 0

    for (const candidate of candidates.slice(0, solarChecks)) {
      candidate.solar = await fetchSolarInsights(candidate, apiKey as string, expandedCoverage)
    }

    const solarChecked = candidates.filter((candidate) => candidate.solar?.status !== 'not_checked').length
    const solarCovered = candidates.filter((candidate) => candidate.solar?.status === 'covered').length

    return Response.json({
      area: areaResult,
      checkedAt: new Date().toISOString(),
      inputs: {
        area,
        maxCandidates,
        minFootprintM2,
        solarLimit,
        expandedCoverage,
      },
      summary: {
        buildingFootprints: buildings.length,
        candidates: candidates.length,
        solarChecked,
        solarCovered,
        googleSolarConfigured: Boolean(apiKey),
      },
      candidates,
    })
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Area scan failed.',
    }, { status: 400 })
  }
}
