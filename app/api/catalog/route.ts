// The design canvas's copy of the equipment catalog, in one request.
//
// The canvas resolves catalog ids locally (every picker, the BOM, the faceplate), so
// it needs the whole active catalog — ~15k rows. Fetching that straight from the
// browser meant 15 serial PostgREST pages of `select('*')` over the user's own
// connection, which is what made switching sections feel like a reload.
//
// Here the paging happens server-side (same region as the database), the payload is
// slimmed and columnar (lib/catalog/payload.ts), and a cheap `version` lets a browser
// that already has the catalog cached skip the body entirely.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRowsParallel } from '@/lib/supabase/fetch-all'
import {
  CATALOG_PAYLOAD_VERSION,
  CATALOG_SELECT,
  encodeCatalog,
} from '@/lib/catalog/payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The client keeps its own copy in IndexedDB and revalidates by `version`, so there is
// nothing for the browser's HTTP cache to add — and a stale HTTP copy would defeat the
// version check.
const HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Catalog costs are staff-only. Anonymous callers get nothing.
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: HEADERS })

  // Snapshot identity: row count plus the newest edit. A price change, an added
  // product or a deactivated one all move one of the two. Both queries are count-only
  // or single-row, so this stays cheap enough to run on every canvas mount.
  const [{ count, error: countError }, { data: newest, error: newestError }] = await Promise.all([
    supabase.from('equipment_catalog').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase
      .from('equipment_catalog')
      .select('updated_at')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (countError || newestError) {
    return NextResponse.json(
      { error: (countError ?? newestError)?.message ?? 'Could not read the catalog' },
      { status: 500, headers: HEADERS },
    )
  }
  const version = `v${CATALOG_PAYLOAD_VERSION}-${count ?? 0}-${newest?.updated_at ?? '0'}`

  // The caller already holds this exact snapshot — no body needed. (A plain 200 rather
  // than a 304 so the browser's own cache layer stays out of it.)
  if (req.headers.get('x-catalog-version') === version) {
    return NextResponse.json({ version, unchanged: true }, { headers: HEADERS })
  }

  // Parallel paging: the catalog is 15 PostgREST pages, and walking them one at a
  // time is the single slowest thing this route does.
  const { data, error } = await fetchAllRowsParallel<Record<string, unknown>>((from, to) =>
    supabase
      .from('equipment_catalog')
      .select(CATALOG_SELECT)
      .eq('active', true)
      .order('sort_order').order('brand').order('description')
      .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: null }>,
  )
  if (error) {
    // A partial catalog would show as missing products in the pickers — refuse instead.
    return NextResponse.json({ error: error.message }, { status: 500, headers: HEADERS })
  }

  return NextResponse.json(encodeCatalog(data, version), { headers: HEADERS })
}
