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

  // This is a server-to-server Places call, so it needs a key WITHOUT HTTP-referrer
  // restrictions. Never fall back to NEXT_PUBLIC_GOOGLE_MAPS_KEY: that key is
  // shipped in the browser bundle and should be referrer-locked to our domains —
  // Google rejects a referrer-restricted key on a request that carries no referrer.
  // Use a dedicated server key (Places API enabled), falling back to the existing
  // server-only Solar key.
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_SOLAR_API_KEY
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
    // Log the upstream error server-side; never echo Google's error body to the
    // caller (it can leak key/quota/config detail to anonymous visitors).
    const errBody = await res.text().catch(() => '')
    console.error('[places/autocomplete] upstream error', res.status, errBody.slice(0, 500))
    return Response.json({ suggestions: [] })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json()
  const suggestions: string[] = (data.suggestions ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => s.placePrediction?.text?.text as string | undefined)
    .filter(Boolean)

  return Response.json({ suggestions })
}
