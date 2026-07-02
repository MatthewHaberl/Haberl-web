import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseDesign } from '@/lib/solar/system-design'
import { designToBom, consolidateBom } from '@/lib/solar/design-bom'
import {
  mapSettingsToPricing, getTariffRateForMunicipality, type EquipmentCatalogItem,
} from '@/lib/solar/quote-calculator'
import { renderCustomerQuote } from '@/lib/solar/render-quote'
import {
  buildQuoteDataFromDesign, bomToSupplierBom, computeDeposit, designComplianceChecks,
} from '@/lib/solar/design-quote'

export const runtime = 'nodejs'

/**
 * Generate & save the customer quote from the live design canvas.
 *
 * This is the bridge the v2 flow was missing: it prices the SystemDesign
 * (designToBom), renders the customer HTML (renderCustomerQuote), allocates a
 * quote number (next_quote_number RPC, first generate only), computes the
 * deposit by line items, snapshots the supplier BOM for job materials, and
 * flips status pending → generated so the Send buttons unlock.
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
  if (!['pending', 'generated'].includes(quote.status)) {
    return NextResponse.json(
      { error: `This quote is already ${quote.status} — it can't be regenerated. Create a new option for changes.` },
      { status: 409 },
    )
  }

  const design = parseDesign(quote.system_design)
  if (!design || (design.panels.length === 0 && design.inverters.length === 0)) {
    return NextResponse.json(
      { error: 'Nothing designed yet — add at least panels or an inverter in the design canvas first.' },
      { status: 400 },
    )
  }

  // Full catalog (design may reference inactive/pending rows — designToBom
  // degrades those to "Quote" lines rather than dropping them).
  const [{ data: catalogRows }, { data: settings }] = await Promise.all([
    supabase.from('equipment_catalog').select('*'),
    supabase.from('company_settings').select('*').eq('id', true).maybeSingle(),
  ])
  const catalog = new Map<string, EquipmentCatalogItem>()
  for (const item of (catalogRows ?? []) as EquipmentCatalogItem[]) catalog.set(item.id, item)

  const pricing = mapSettingsToPricing(settings ?? {})
  const gridSupply = (quote.grid_supply as string | null) ?? undefined
  const bom = consolidateBom(designToBom(design, catalog, pricing.markup, { gridSupply, pricing }))

  // Quote number: allocated once, on first generate (peeked numbers elsewhere
  // are display-only — the sequence is consumed here).
  let quoteNumber: string | null = quote.quote_number
  if (!quoteNumber) {
    const { data: nextNum, error: numError } = await supabase.rpc('next_quote_number')
    if (numError || !nextNum) {
      return NextResponse.json({ error: `Could not allocate a quote number: ${numError?.message ?? 'no value returned'}` }, { status: 500 })
    }
    quoteNumber = String(nextNum)
  }

  const complianceChecks = designComplianceChecks({ design, bom, catalog, gridSupply })
  const tariffRate = getTariffRateForMunicipality(quote.municipality ?? '')
  const expiryDays = (settings?.quote_expiry_days as number | null) ?? 30

  const quoteData = buildQuoteDataFromDesign({
    design, bom, catalog,
    req: quote,
    quoteNumber, expiryDays, tariffRate,
    complianceChecks,
  })
  const html = renderCustomerQuote(quoteData)
  const deposit = computeDeposit(bom)

  const { error: updateError } = await supabase
    .from('quote_requests')
    .update({
      quote_html: html,
      generated_quote: JSON.stringify(quoteData),
      bom_snapshot: bomToSupplierBom(bom),
      quote_number: quoteNumber,
      total_amount: Math.round(bom.totalSellR * 100),
      deposit_amount: Math.round(deposit.totalR * 100),
      // Column contract is the selected item NAMES (string[]); the amounts live
      // inside generated_quote.depositItems.
      deposit_items: deposit.items.map((i) => i.name),
      status: 'generated',
    })
    .eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  const blockers = complianceChecks.filter((c) => c.status === 'blocker').length
  return NextResponse.json({
    ok: true,
    quoteNumber,
    totalR: bom.totalSellR,
    depositR: deposit.totalR,
    needsPricing: bom.needsPricing,
    complianceBlockers: blockers,
  })
}
