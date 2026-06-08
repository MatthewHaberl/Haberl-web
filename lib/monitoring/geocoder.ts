/**
 * Geocodes a street address to lat/lng using OpenStreetMap Nominatim.
 * Free, no API key needed. Rate limit: 1 req/sec — only call on site save.
 */

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null

  const params = new URLSearchParams({
    q:              address,
    format:         'json',
    limit:          '1',
    countrycodes:   'za',  // bias to South Africa
  })

  const userAgent = process.env.NOMINATIM_USER_AGENT ?? 'haberl-web/1.0'

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': userAgent },
    })
    if (!res.ok) return null

    const results = (await res.json()) as NominatimResult[]
    if (!results.length) return null

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    }
  } catch {
    return null
  }
}
