import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRowsParallel } from '@/lib/supabase/fetch-all'
import { mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { fetchWorkTypes } from '@/lib/quotes/work-types'
import { priceQuoteRequest, renderQuoteDocument } from '@/lib/quotes/build-quote-document'

export const runtime = 'nodejs'

/**
 * Generate & save the customer quote — the bridge from either design engine to
 * the sendable document.
 *
 * Pricing and rendering live in lib/quotes/build-quote-document.ts, shared with
 * the staff preview so the two can't drift. quote_requests.work_type picks the
 * engine there (W97). This route owns what only a real generate does: the quote
 * number (next_quote_number RPC, first generate only) and the save — customer
 * HTML, deposit by line items, supplier-BOM snapshot for job materials, status
 * flip pending → generated.
 *
 * Regenerating while still 'generated' overwrites the draft. Once sent /
 * accepted / declined the quote is immutable here (409) — amendments are a
 * separate feature (W56).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data: quote } = await supabase
    .from('quote_requests').select('*').eq('id', id).maybeSingle()
  if (!quote) return new Response('Quote not found', { status: 404 })
  if (quote.archived_at || quote.deleted_at) {
    return NextResponse.json(
      { error: `This quote is ${quote.deleted_at ? 'deleted' : 'archived'} — restore it before regenerating.` },
      { status: 409 },
    )
  }
  if (!['pending', 'generated'].includes(quote.status)) {
    return NextResponse.json(
      { error: `This quote is already ${quote.status} — it can't be regenerated. Create a new option for changes.` },
      { status: 409 },
    )
  }

  const workTypes = await fetchWorkTypes(supabase)

  // Full catalog (either engine may reference inactive/pending rows — the BOM
  // builders degrade those to "Quote" lines rather than dropping them).
  // Paged: PostgREST caps a bare select at ~1000 rows and the catalog is ~15k
  // since the Key Electric import — an unpaged fetch silently priced anything
  // beyond the cap as "product not in catalog".
  const [{ data: catalogRows, error: catalogError }, { data: settings }] = await Promise.all([
    fetchAllRowsParallel<EquipmentCatalogItem>((from, to) =>
      supabase.from('equipment_catalog').select('*').order('id').range(from, to)),
    supabase.from('company_settings').select('*').eq('id', true).maybeSingle(),
  ])
  if (catalogError) {
    // A partial catalog would silently price the missing items as "product not
    // in catalog" R0 lines — refuse rather than under-quote.
    return NextResponse.json(
      { error: `Could not load the equipment catalog: ${catalogError.message}` },
      { status: 500 },
    )
  }
  const catalog = new Map<string, EquipmentCatalogItem>()
  for (const item of catalogRows) catalog.set(item.id, item)

  const pricing = mapSettingsToPricing(settings ?? {})
  const expiryDays = (settings?.quote_expiry_days as number | null) ?? 30

  // ── Validation + pricing ────────────────────────────────────────────────
  // Runs BEFORE the quote number is allocated so an empty design/scope (the
  // common 400) never consumes a number from the sequence.
  const priceResult = priceQuoteRequest({ quote, catalog, pricing, workTypes })
  if (!priceResult.ok) {
    return NextResponse.json({ error: priceResult.error }, { status: priceResult.status })
  }
  const { priced } = priceResult

  // Quote number: allocated once, on first generate (peeked numbers elsewhere
  // are display-only — the sequence is consumed here).
  let quoteNumber: string | null = quote.quote_number ? String(quote.quote_number) : null
  if (!quoteNumber) {
    const { data: nextNum, error: numError } = await supabase.rpc('next_quote_number')
    if (numError || !nextNum) {
      return NextResponse.json({ error: `Could not allocate a quote number: ${numError?.message ?? 'no value returned'}` }, { status: 500 })
    }
    quoteNumber = String(nextNum)
  }

  const out = renderQuoteDocument({
    priced, quote, catalog, pricing, workTypes, quoteNumber, expiryDays,
  })

  const { error: updateError } = await supabase
    .from('quote_requests')
    .update({
      quote_html: out.html,
      generated_quote: out.generatedQuoteJson,
      bom_snapshot: out.bomSnapshot,
      quote_number: quoteNumber,
      total_amount: Math.round(out.bom.totalSellR * 100),
      deposit_amount: Math.round(out.depositTotalR * 100),
      // Column contract is the selected item NAMES (string[]); the amounts live
      // inside generated_quote.depositItems.
      deposit_items: out.depositNames,
      status: 'generated',
    })
    .eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  return NextResponse.json({
    ok: true,
    quoteNumber,
    totalR: out.bom.totalSellR,
    depositR: out.depositTotalR,
    needsPricing: out.bom.needsPricing,
    complianceBlockers: out.complianceBlockers,
  })
}
