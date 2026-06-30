import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/quotes/server'

export const runtime = 'nodejs'

// Anonymous visitors (public intake / registration forms) may use autocomplete,
// but are throttled per-IP so they can't run up the Google Places quota.
// Logged-in staff are never rate-limited. Mirrors the /api/public/leads guard.
const IP_WINDOW_MS = 60_000
const MAX_ANON_PER_WINDOW = 40
const ipHits = new Map<string, number[]>()

function checkAnonRateLimit(ip: string) {
  const now = Date.now()
  const recent = (ipHits.get(ip) ?? []).filter((timestamp) => now - timestamp < IP_WINDOW_MS)
  if (recent.length >= MAX_ANON_PER_WINDOW) return false
  ipHits.set(ip, [...recent, now])
  return true
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const input = searchParams.get('input')?.trim() ?? ''
  if (input.length < 3) return Response.json({ suggestions: [] })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !checkAnonRateLimit(getClientIp(req))) {
    return Response.json({ suggestions: [] }, { status: 429 })
  }

  // Use the Maps key — confirmed to have Places API (New) enabled.
  // Server-to-server calls skip referrer restrictions entirely.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? process.env.GOOGLE_SOLAR_API_KEY
  if (!apiKey) return Response.json({ suggestions: [] })

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['za'],
    }),
  })

  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errBody: any = await res.json().catch(() => ({}))
    return Response.json({ suggestions: [], _debug: { status: res.status, error: errBody } })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json()
  const suggestions: string[] = (data.suggestions ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => s.placePrediction?.text?.text as string | undefined)
    .filter(Boolean)

  return Response.json({ suggestions, _debug: { count: suggestions.length } })
}
