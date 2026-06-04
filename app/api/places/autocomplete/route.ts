import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const input = searchParams.get('input')?.trim() ?? ''
  if (input.length < 3) return Response.json({ suggestions: [] })

  // Prefer the solar key (server-only, no referrer restrictions).
  // Fall back to the Maps key which also has Places API (New) enabled.
  const apiKey = process.env.GOOGLE_SOLAR_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
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

  if (!res.ok) return Response.json({ suggestions: [] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json()
  const suggestions: string[] = (data.suggestions ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => s.placePrediction?.text?.text as string | undefined)
    .filter(Boolean)

  return Response.json({ suggestions })
}
