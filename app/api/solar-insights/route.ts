import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // Staff-only: this burns paid Google Solar + Geocoding quota, so a logged-in
  // customer must not be able to call it. (Mirrors the solar-coverage guard.)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'customer') {
    return new Response('Forbidden', { status: 403 })
  }

  const body = await req.json() as { address?: string }
  if (!body.address?.trim()) {
    return Response.json({ error: 'Address is required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'GOOGLE_SOLAR_API_KEY not configured' }, { status: 500 })
  }

  // Step 1 — Geocode the address to lat/lng
  const geocodeRes = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(body.address)}&key=${apiKey}`
  )
  const geocodeData = await geocodeRes.json()

  if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]) {
    return Response.json(
      { error: `Could not locate address: ${geocodeData.status}` },
      { status: 422 }
    )
  }

  const { lat, lng } = geocodeData.results[0].geometry.location

  // Step 2 — Fetch building insights from Google Solar API
  const solarRes = await fetch(
    `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lng}` +
    `&requiredQuality=LOW&key=${apiKey}`
  )

  if (!solarRes.ok) {
    if (solarRes.status === 404) {
      return Response.json({ fallback: true, latitude: lat, longitude: lng })
    }
    const errText = await solarRes.text()
    return Response.json(
      { error: `Google Solar API error (${solarRes.status}): ${errText}` },
      { status: solarRes.status }
    )
  }

  const solarData = await solarRes.json()
  return Response.json(solarData)
}
