import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

const STORE_API = 'https://keyelectric.co.za/wp-json/wc/store/v1/products'
const PER_PAGE = 100
const TIME_BUDGET_MS = 40_000

/**
 * Key Electric price refresh — re-walks the supplier's public WooCommerce
 * Store API and keeps the catalog current. Schedule daily (vercel.json), or
 * run to completion in one go with scripts/key-electric-refresh.mjs:
 *   curl "https://<host>/api/cron/key-refresh?secret=$CRON_SECRET"
 *
 * Each invocation fetches as many pages as fit its time budget and hands the
 * raw page JSON to the DB function key_refresh_ingest_page (migration 091),
 * which owns ALL parse/apply logic: refresh Key offers (price, stock,
 * last_seen_at — the migration-052 trigger re-prices products), backfill
 * missing images / source URLs / datasheets, stamp price_updated_at, and
 * report site products we don't stock (never auto-created). A partial sweep
 * resumes from supplier_refresh_state.page_cursor on the next invocation;
 * the final page triggers key_refresh_finish(), whose summary — including
 * offers NOT seen on the site — lands in supplier_refresh_state.
 */
export async function GET(req: NextRequest) {
  // Same auth as quote-followups: Vercel Cron's Bearer header or ?secret=.
  const expected = process.env.CRON_SECRET ?? process.env.MONITORING_CRON_SECRET
  const querySecret = req.nextUrl.searchParams.get('secret')
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || (querySecret !== expected && bearer !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const started = Date.now()

  const { data: state, error: stateError } = await supabase
    .from('supplier_refresh_state')
    .select('page_cursor, run_started_at')
    .eq('supplier', 'Key Electric')
    .single()
  if (stateError) {
    return NextResponse.json({ error: stateError.message }, { status: 500 })
  }

  let page = state.run_started_at ? state.page_cursor + 1 : 1
  let pagesProcessed = 0
  let done = false
  let summary: unknown = null

  while (Date.now() - started < TIME_BUDGET_MS) {
    const res = await fetch(
      `${STORE_API}?per_page=${PER_PAGE}&page=${page}&orderby=date&order=asc`,
      {
        headers: {
          'User-Agent': 'haberl-web/1.0 (matthew@haberl.co.za)',
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    )
    if (!res.ok) {
      // Leave the cursor as-is; the next invocation retries this page.
      return NextResponse.json(
        { error: `store API returned ${res.status} on page ${page}`, pagesProcessed },
        { status: 502 }
      )
    }
    const products = (await res.json()) as unknown
    if (!Array.isArray(products)) {
      return NextResponse.json({ error: `unexpected payload on page ${page}`, pagesProcessed }, { status: 502 })
    }
    if (page === 1 && products.length === 0) {
      return NextResponse.json({ error: 'store API returned no products' }, { status: 502 })
    }

    if (products.length > 0) {
      const { data: result, error } = await supabase.rpc('key_refresh_ingest_page', {
        p_page_number: page,
        p_page: products,
      })
      if (error) {
        return NextResponse.json({ error: error.message, page }, { status: 500 })
      }
      if (result && typeof result === 'object' && 'error' in result) {
        return NextResponse.json({ error: (result as { error: string }).error, page, detail: result }, { status: 500 })
      }
      pagesProcessed++
    }

    if (products.length < PER_PAGE) {
      const { data: fin, error } = await supabase.rpc('key_refresh_finish')
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      summary = fin
      done = true
      break
    }
    page++
  }

  return NextResponse.json({
    done,
    pagesProcessed,
    nextPage: done ? null : page,
    summary,
  })
}
