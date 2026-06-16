import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type ImageryQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'BASE'

interface CoverageLocationInput {
  label?: string
  address?: string
}

interface CoverageRequestBody {
  locations?: CoverageLocationInput[]
  requiredQuality?: ImageryQuality
  expandedCoverage?: boolean
}

const ALLOWED_QUALITIES = new Set<ImageryQuality>(['HIGH', 'MEDIUM', 'LOW', 'BASE'])
const MAX_BATCH_SIZE = 12

function asImageryQuality(value: unknown): ImageryQuality {
  return typeof value === 'string' && ALLOWED_QUALITIES.has(value as ImageryQuality)
    ? value as ImageryQuality
    : 'LOW'
}

function appendCountryHint(address: string) {
  const lower = address.toLowerCase()
  if (lower.includes('south africa') || lower.includes('gauteng')) return address
  return `${address}, Gauteng, South Africa`
}

function dateLabel(date?: { year?: number; month?: number; day?: number }) {
  if (!date?.year || !date?.month || !date?.day) return null
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function assertEmployeeCanRunCoverageCheck() {
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

async function geocodeAddress(address: string, apiKey: string) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', appendCountryHint(address))
  url.searchParams.set('region', 'za')
  url.searchParams.set('key', apiKey)

  const startedAt = Date.now()
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json()
  const elapsedMs = Date.now() - startedAt

  if (data.status !== 'OK' || !data.results?.[0]) {
    return {
      ok: false as const,
      elapsedMs,
      error: `Could not locate address: ${data.status ?? response.status}`,
    }
  }

  const result = data.results[0]
  const location = result.geometry?.location
  if (typeof location?.lat !== 'number' || typeof location?.lng !== 'number') {
    return {
      ok: false as const,
      elapsedMs,
      error: 'Geocoding result did not include coordinates',
    }
  }

  return {
    ok: true as const,
    elapsedMs,
    latitude: location.lat as number,
    longitude: location.lng as number,
    formattedAddress: result.formatted_address as string | undefined,
    placeId: result.place_id as string | undefined,
  }
}

async function fetchSolarInsights(
  latitude: number,
  longitude: number,
  apiKey: string,
  requiredQuality: ImageryQuality,
  expandedCoverage: boolean,
) {
  const url = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest')
  url.searchParams.set('location.latitude', String(latitude))
  url.searchParams.set('location.longitude', String(longitude))
  url.searchParams.set('requiredQuality', requiredQuality)
  if (expandedCoverage) url.searchParams.append('experiments', 'EXPANDED_COVERAGE')
  url.searchParams.set('key', apiKey)

  const startedAt = Date.now()
  const response = await fetch(url, { cache: 'no-store' })
  const elapsedMs = Date.now() - startedAt

  if (response.status === 404) {
    return {
      status: 'not_covered' as const,
      elapsedMs,
      message: 'No Google Solar building found within about 50m at this quality setting.',
    }
  }

  if (!response.ok) {
    const errorText = await response.text()
    return {
      status: 'error' as const,
      elapsedMs,
      message: `Google Solar API error (${response.status}): ${errorText}`,
    }
  }

  const data = await response.json()
  const solarPotential = data.solarPotential ?? {}
  const panels = Array.isArray(solarPotential.solarPanels) ? solarPotential.solarPanels : []
  const roofSegments = Array.isArray(solarPotential.roofSegmentStats) ? solarPotential.roofSegmentStats : []
  const panelCapacityWatts = numberOrNull(solarPotential.panelCapacityWatts)
  const maxPanels = numberOrNull(solarPotential.maxArrayPanelsCount) ?? panels.length
  const panelCount = panels.length || maxPanels || 0
  const totalAnnualKwh = panels.reduce((sum: number, panel: { yearlyEnergyDcKwh?: unknown }) => {
    return sum + (numberOrNull(panel.yearlyEnergyDcKwh) ?? 0)
  }, 0)

  return {
    status: panelCount > 0 && roofSegments.length > 0 ? 'covered' as const : 'marginal' as const,
    elapsedMs,
    message: panelCount > 0
      ? 'Roof-level solar data returned.'
      : 'Building returned, but no panel placements were included.',
    buildingName: data.name as string | undefined,
    imageryQuality: data.imageryQuality as string | undefined,
    imageryDate: dateLabel(data.imageryDate),
    imageryProcessedDate: dateLabel(data.imageryProcessedDate),
    postalCode: data.postalCode as string | undefined,
    administrativeArea: data.administrativeArea as string | undefined,
    panelCount,
    maxKw: panelCapacityWatts ? Number(((panelCount * panelCapacityWatts) / 1000).toFixed(2)) : null,
    annualKwh: totalAnnualKwh > 0 ? Math.round(totalAnnualKwh) : null,
    roofSegments: roofSegments.length,
    roofAreaM2: numberOrNull(solarPotential.buildingStats?.areaMeters2)
      ?? numberOrNull(solarPotential.maxArrayAreaMeters2),
    panelCapacityWatts,
  }
}

export async function POST(req: Request) {
  const access = await assertEmployeeCanRunCoverageCheck()
  if (!access.ok) {
    return Response.json({ error: access.message }, { status: access.status })
  }

  const apiKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'GOOGLE_SOLAR_API_KEY not configured' }, { status: 500 })
  }

  let body: CoverageRequestBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawLocations = Array.isArray(body.locations) ? body.locations : []
  const locations = rawLocations
    .map((location) => ({
      label: location.label?.trim() || location.address?.trim() || 'Address',
      address: location.address?.trim() ?? '',
    }))
    .filter((location) => location.address)
    .slice(0, MAX_BATCH_SIZE)

  if (locations.length === 0) {
    return Response.json({ error: 'At least one address is required' }, { status: 400 })
  }

  const expandedCoverage = Boolean(body.expandedCoverage)
  const requiredQuality = expandedCoverage ? 'BASE' : asImageryQuality(body.requiredQuality)

  const results = []
  for (const location of locations) {
    const geocode = await geocodeAddress(location.address, apiKey)
    if (!geocode.ok) {
      results.push({
        label: location.label,
        address: location.address,
        status: 'error',
        message: geocode.error,
        geocodeMs: geocode.elapsedMs,
      })
      continue
    }

    const solar = await fetchSolarInsights(
      geocode.latitude,
      geocode.longitude,
      apiKey,
      requiredQuality,
      expandedCoverage,
    )

    results.push({
      label: location.label,
      address: location.address,
      formattedAddress: geocode.formattedAddress,
      placeId: geocode.placeId,
      latitude: geocode.latitude,
      longitude: geocode.longitude,
      geocodeMs: geocode.elapsedMs,
      ...solar,
    })
  }

  const covered = results.filter((result) => result.status === 'covered').length
  const marginal = results.filter((result) => result.status === 'marginal').length
  const notCovered = results.filter((result) => result.status === 'not_covered').length
  const errors = results.filter((result) => result.status === 'error').length

  return Response.json({
    requiredQuality,
    expandedCoverage,
    checkedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      covered,
      marginal,
      notCovered,
      errors,
      usefulRate: results.length ? Math.round((covered / results.length) * 100) : 0,
    },
    results,
  })
}
