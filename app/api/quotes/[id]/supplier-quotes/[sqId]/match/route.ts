import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRowsParallel } from '@/lib/supabase/fetch-all'
import { mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { fetchWorkTypes } from '@/lib/quotes/work-types'
import { bomForQuoteRequest } from '@/lib/quotes/build-quote-document'
import { bomToRfqCandidates, isMaterialLine } from '@/lib/quotes/supplier-rfq'
import { matchSupplierQuote } from '@/lib/quotes/supplier-price-match'
import { parseScope } from '@/lib/quotes/scope'
import { parseDesign } from '@/lib/solar/system-design'
import type { SupplierQuoteLineRow, SupplierQuoteRow } from '@/lib/quotes/supplier-quotes'

export const runtime = 'nodejs'

/**
 * What one supplier quote does to this quote's prices (W100).
 *
 * GET — matches the document's lines against the quote's own material items by
 * part number and returns the three lists the review dialog shows: what will
 * reprice, what this document doesn't cover (priced by hand), and what it
 * prices that the quote doesn't use.
 *
 * The BOM is computed here, server-side against the full catalog, for the same
 * reason the RFQ builder does it: a stale browser copy of the design must not
 * be able to shape what gets repriced. Nothing is written — the apply happens
 * in the builder, which owns the autosave.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; sqId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { id: quoteId, sqId } = await params
  const admin = createAdminClient()

  const [{ data: sq }, { data: sqLines }, { data: quote }] = await Promise.all([
    admin.from('supplier_quotes').select('*')
      .eq('id', sqId).eq('quote_request_id', quoteId).maybeSingle(),
    admin.from('supplier_quote_lines').select('*')
      .eq('supplier_quote_id', sqId).order('line_no'),
    admin.from('quote_requests').select('*').eq('id', quoteId).maybeSingle(),
  ])
  if (!sq) return new Response('Supplier quote not found', { status: 404 })
  if (!quote) return new Response('Quote not found', { status: 404 })

  const lines = (sqLines ?? []) as SupplierQuoteLineRow[]
  if (!lines.some((l) => l.unit_price_r > 0)) {
    return NextResponse.json(
      { error: 'This supplier quote has no priced lines yet — parse it or type the prices in first.' },
      { status: 400 },
    )
  }

  // Full catalog, paged — a bare select caps at ~1000 rows and the catalog is
  // ~15k since the Key import, which would leave real matches looking unpriced.
  const [{ data: catalogRows, error: catalogError }, { data: settings }, workTypes] = await Promise.all([
    fetchAllRowsParallel<EquipmentCatalogItem>((from, to) =>
      admin.from('equipment_catalog').select('*').order('id').range(from, to)),
    admin.from('company_settings').select('*').eq('id', true).maybeSingle(),
    fetchWorkTypes(admin),
  ])
  if (catalogError) {
    return NextResponse.json(
      { error: `Could not load the equipment catalog: ${catalogError.message}` },
      { status: 500 },
    )
  }
  const catalog = new Map<string, EquipmentCatalogItem>()
  for (const item of catalogRows) catalog.set(item.id, item)

  const pricing = mapSettingsToPricing(settings ?? {})
  const built = bomForQuoteRequest({ quote, catalog, pricing, workTypes })
  if (!built) {
    return NextResponse.json(
      { error: "There's nothing on this quote yet — add items to the design or scope first." },
      { status: 400 },
    )
  }

  const candidates = bomToRfqCandidates(built.bom, catalog)
  if (!candidates.length) {
    return NextResponse.json(
      { error: 'This quote has no material lines to reprice — only labour and fees.' },
      { status: 400 },
    )
  }

  // Live unit cost per item, off the priced BOM the candidates were merged from.
  const costByCatalogId = new Map<string, number>()
  const costBySku = new Map<string, number>()
  for (const section of built.bom.sections) {
    for (const line of section.lines) {
      if (!isMaterialLine(line, section.name)) continue
      if (line.catalogId && !costByCatalogId.has(line.catalogId)) {
        costByCatalogId.set(line.catalogId, line.unitCostR)
      }
      const sku = (line.sku ?? '').trim().toUpperCase()
      if (sku && sku !== '—' && !costBySku.has(sku)) costBySku.set(sku, line.unitCostR)
    }
  }

  const existing = built.engine === 'scope'
    ? parseScope(quote.scope)?.supplierPrices
    : parseDesign(quote.system_design)?.supplierPrices

  const report = matchSupplierQuote(
    candidates,
    lines,
    (c) => (c.catalogId ? costByCatalogId.get(c.catalogId) : undefined)
      ?? costBySku.get((c.sku ?? '').trim().toUpperCase())
      ?? 0,
    existing ?? {},
  )

  const header = sq as SupplierQuoteRow
  return NextResponse.json({
    engine: built.engine,
    supplierQuote: {
      id: header.id,
      supplier: header.supplier,
      reference: header.reference,
      quoteDate: header.quote_date,
    },
    markup: pricing.markup,
    ...report,
  })
}
