import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { parseDesign, type SystemDesign } from '@/lib/solar/system-design'
import { designToBom, consolidateBom, type DesignBom } from '@/lib/solar/design-bom'
import {
  mapSettingsToPricing, getTariffRateForMunicipality, type EquipmentCatalogItem,
} from '@/lib/solar/quote-calculator'
import { renderCustomerQuote } from '@/lib/solar/render-quote'
import {
  buildQuoteDataFromDesign, bomToSupplierBom, computeDeposit, designComplianceChecks,
} from '@/lib/solar/design-quote'
import { engineFor, workTypeLabel, fetchWorkTypes } from '@/lib/quotes/work-types'
import { parseScope, type QuoteScope } from '@/lib/quotes/scope'
import { scopeToBom, stripOptionalLines } from '@/lib/quotes/scope-bom'
import { buildScopeQuoteData } from '@/lib/quotes/scope-quote'
import { renderScopeQuote } from '@/lib/quotes/render-scope-quote'

export const runtime = 'nodejs'

/** What either engine must produce for the shared save/respond tail. */
interface EngineOutput {
  html: string
  generatedQuoteJson: string
  bomSnapshot: unknown
  bom: DesignBom
  depositTotalR: number
  depositNames: string[]
  complianceBlockers: number
}

/**
 * Generate & save the customer quote — the bridge from either design engine to
 * the sendable document.
 *
 * quote_requests.work_type picks the engine (W97): 'solar' prices the canvas
 * SystemDesign via designToBom; 'scope' prices the QuoteScope via scopeToBom.
 * Both produce the same DesignBom shape, so everything from here down —
 * customer HTML, quote number (next_quote_number RPC, first generate only),
 * deposit by line items, supplier-BOM snapshot for job materials, status flip
 * pending → generated — is one shared path.
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
  const engine = engineFor(quote.work_type, workTypes)

  // Full catalog (either engine may reference inactive/pending rows — the BOM
  // builders degrade those to "Quote" lines rather than dropping them).
  // Paged: PostgREST caps a bare select at ~1000 rows and the catalog is ~15k
  // since the Key Electric import — an unpaged fetch silently priced anything
  // beyond the cap as "product not in catalog".
  const [{ data: catalogRows }, { data: settings }] = await Promise.all([
    fetchAllRows<EquipmentCatalogItem>((from, to) =>
      supabase.from('equipment_catalog').select('*').order('id').range(from, to)),
    supabase.from('company_settings').select('*').eq('id', true).maybeSingle(),
  ])
  const catalog = new Map<string, EquipmentCatalogItem>()
  for (const item of (catalogRows ?? []) as EquipmentCatalogItem[]) catalog.set(item.id, item)

  const pricing = mapSettingsToPricing(settings ?? {})
  const expiryDays = (settings?.quote_expiry_days as number | null) ?? 30

  // ── Engine-specific validation + pricing ────────────────────────────────
  // Runs BEFORE the quote number is allocated so an empty design/scope (the
  // common 400) never consumes a number from the sequence.
  let priced:
    | { engine: 'scope'; scope: QuoteScope; bom: DesignBom }
    | { engine: 'solar'; design: SystemDesign; bom: DesignBom }

  const gridSupply = (quote.grid_supply as string | null) ?? undefined

  if (engine === 'scope') {
    const scope = parseScope(quote.scope)
    if (!scope || (scope.lines.length === 0 && !scope.summary.trim())) {
      return NextResponse.json(
        { error: 'Nothing scoped yet — add sections and line items in the scope builder first.' },
        { status: 400 },
      )
    }
    const bom = scopeToBom(scope, catalog, pricing.markup, { pricing })
    if (bom.totalSellR <= 0 && bom.needsPricing === 0) {
      return NextResponse.json(
        { error: 'The scope has no priced work yet — add materials, labour or fees first.' },
        { status: 400 },
      )
    }
    priced = { engine: 'scope', scope, bom }
  } else {
    const design = parseDesign(quote.system_design)
    if (!design || (design.panels.length === 0 && design.inverters.length === 0)) {
      return NextResponse.json(
        { error: 'Nothing designed yet — add at least panels or an inverter in the design canvas first.' },
        { status: 400 },
      )
    }
    priced = {
      engine: 'solar',
      design,
      bom: consolidateBom(designToBom(design, catalog, pricing.markup, { gridSupply, pricing })),
    }
  }

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

  let out: EngineOutput
  if (priced.engine === 'scope') {
    const { scope, bom } = priced
    const scopeData = buildScopeQuoteData({
      scope, bom, catalog,
      req: quote,
      quoteNumber, expiryDays,
      workType: quote.work_type,
      workTypeLabel: workTypeLabel(quote.work_type, workTypes),
    })
    out = {
      html: renderScopeQuote(scopeData),
      generatedQuoteJson: JSON.stringify(scopeData),
      // Optional extras stay out of procurement/job materials.
      bomSnapshot: bomToSupplierBom(stripOptionalLines(bom)),
      bom,
      depositTotalR: scopeData.depositTotalRands,
      depositNames: scopeData.depositItems.map((i) => i.name),
      complianceBlockers: 0,
    }
  } else {
    const { design, bom } = priced
    const complianceChecks = designComplianceChecks({ design, bom, catalog, gridSupply })
    const tariffRate = getTariffRateForMunicipality(quote.municipality ?? '')

    const quoteData = buildQuoteDataFromDesign({
      design, bom, catalog,
      req: quote,
      quoteNumber, expiryDays, tariffRate,
      complianceChecks,
    })
    const deposit = computeDeposit(bom)
    out = {
      html: renderCustomerQuote(quoteData),
      generatedQuoteJson: JSON.stringify(quoteData),
      bomSnapshot: bomToSupplierBom(bom),
      bom,
      depositTotalR: deposit.totalR,
      depositNames: deposit.items.map((i) => i.name),
      complianceBlockers: complianceChecks.filter((c) => c.status === 'blocker').length,
    }
  }

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
