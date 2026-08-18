// ─────────────────────────────────────────────────────────────────────────────
// Quote document builder — the one place either engine turns a saved quote
// request into the customer-facing document.
//
// Split in two so the caller owns the quote number:
//   priceQuoteRequest()   validates + prices the design/scope. No number needed,
//                         so an empty design can't consume one from the sequence.
//   renderQuoteDocument() renders the HTML and everything saved alongside it.
//
// /api/quotes/[id]/generate runs both and saves the result; the staff preview
// (…/quotes-v2/[id]/preview) runs both and throws it away. Sharing this module
// is what keeps "what the customer will see" honest — a preview that rendered
// its own way would eventually lie.
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import { parseDesign, type SystemDesign } from '@/lib/solar/system-design'
import { designToBom, consolidateBom, type DesignBom } from '@/lib/solar/design-bom'
import {
  getTariffRateForMunicipality,
  type EquipmentCatalogItem,
  type PricingSettings,
} from '@/lib/solar/quote-calculator'
import { renderCustomerQuote } from '@/lib/solar/render-quote'
import {
  buildQuoteDataFromDesign, bomToSupplierBom, computeDeposit, designComplianceChecks,
} from '@/lib/solar/design-quote'
import { engineFor, workTypeLabel, type WorkType } from '@/lib/quotes/work-types'
import { parseScope, type QuoteScope } from '@/lib/quotes/scope'
import { scopeToBom, stripOptionalLines } from '@/lib/quotes/scope-bom'
import { scopeBlockerMessage } from '@/lib/quotes/scope-validate'
import { buildScopeQuoteData } from '@/lib/quotes/scope-quote'
import { renderScopeQuote } from '@/lib/quotes/render-scope-quote'

/** The quote_requests columns either engine reads. */
export interface QuoteRequestForDocument {
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  address?: string | null
  municipality?: string | null
  monthly_kwh?: string | number | null
  grid_supply?: string | null
  work_type?: string | null
  scope?: unknown
  system_design?: unknown
  /**
   * Per-quote switch for the "What You're Getting" photo panel (migration 121).
   * Absent/null on an older saved row reads as on — the document a quote
   * already has never changes because a column was added under it.
   */
  show_equipment_photos?: boolean | null
}

/** A validated, priced quote — one engine's parsed input plus its BOM. */
export type PricedQuote =
  | { engine: 'scope'; scope: QuoteScope; bom: DesignBom }
  | { engine: 'solar'; design: SystemDesign; bom: DesignBom }

export type PriceResult =
  | { ok: true; priced: PricedQuote }
  /** status/error are ready to return straight from a route. */
  | { ok: false; status: number; error: string }

/** Everything the generate route saves — the preview uses only `html`. */
export interface QuoteDocument {
  html: string
  generatedQuoteJson: string
  bomSnapshot: unknown
  bom: DesignBom
  depositTotalR: number
  depositNames: string[]
  complianceBlockers: number
}

export interface PriceArgs {
  quote: QuoteRequestForDocument
  /** Full equipment catalog by id — page it in, a partial map under-prices. */
  catalog: Map<string, EquipmentCatalogItem>
  pricing: PricingSettings
  workTypes: WorkType[]
}

/**
 * Validate and price a quote request through its work-type engine. Returns the
 * same 400s the generate route has always returned, so the preview refuses on
 * exactly the same conditions as a real generate.
 */
export function priceQuoteRequest({ quote, catalog, pricing, workTypes }: PriceArgs): PriceResult {
  const engine = engineFor(quote.work_type ?? null, workTypes)

  if (engine === 'scope') {
    const scope = parseScope(quote.scope)
    if (!scope || (scope.lines.length === 0 && !scope.summary.trim())) {
      return {
        ok: false, status: 400,
        error: 'Nothing scoped yet — add sections and line items in the scope builder first.',
      }
    }
    // Pre-flight (shared with the builder's live panel): a line with no
    // description bills a blank row, and a line with no quantity is dropped by
    // scopeToBom below without a word. Refuse here rather than render either —
    // this is the last gate before a document exists to be sent.
    const blocked = scopeBlockerMessage(scope)
    if (blocked) return { ok: false, status: 400, error: blocked }
    const bom = scopeToBom(scope, catalog, pricing.markup, { pricing })
    if (bom.totalSellR <= 0 && bom.needsPricing === 0) {
      return {
        ok: false, status: 400,
        error: 'The scope has no priced work yet — add materials, labour or fees first.',
      }
    }
    return { ok: true, priced: { engine: 'scope', scope, bom } }
  }

  const design = parseDesign(quote.system_design)
  if (!design || (design.panels.length === 0 && design.inverters.length === 0)) {
    return {
      ok: false, status: 400,
      error: 'Nothing designed yet — add at least panels or an inverter in the design canvas first.',
    }
  }
  const gridSupply = quote.grid_supply ?? undefined
  return {
    ok: true,
    priced: {
      engine: 'solar',
      design,
      bom: consolidateBom(designToBom(design, catalog, pricing.markup, { gridSupply, pricing })),
    },
  }
}

export interface RenderArgs extends PriceArgs {
  priced: PricedQuote
  /** Allocated number for a real generate; any placeholder for a preview. */
  quoteNumber: string
  expiryDays: number
}

/** Render the priced quote into the customer document. */
export function renderQuoteDocument(
  { priced, quote, catalog, workTypes, quoteNumber, expiryDays }: RenderArgs,
): QuoteDocument {
  if (priced.engine === 'scope') {
    const { scope, bom } = priced
    const scopeData = buildScopeQuoteData({
      scope, bom, catalog,
      req: quote,
      showEquipmentPhotos: quote.show_equipment_photos !== false,
      quoteNumber, expiryDays,
      workType: quote.work_type ?? '',
      workTypeLabel: workTypeLabel(quote.work_type ?? null, workTypes),
    })
    return {
      html: renderScopeQuote(scopeData),
      generatedQuoteJson: JSON.stringify(scopeData),
      // Optional extras stay out of procurement/job materials.
      bomSnapshot: bomToSupplierBom(stripOptionalLines(bom)),
      bom,
      depositTotalR: scopeData.depositTotalRands,
      depositNames: scopeData.depositItems.map((i) => i.name),
      complianceBlockers: 0,
    }
  }

  const { design, bom } = priced
  const gridSupply = quote.grid_supply ?? undefined
  const complianceChecks = designComplianceChecks({ design, bom, catalog, gridSupply })
  const quoteData = buildQuoteDataFromDesign({
    design, bom, catalog,
    req: quote,
    showEquipmentPhotos: quote.show_equipment_photos !== false,
    quoteNumber, expiryDays,
    tariffRate: getTariffRateForMunicipality(quote.municipality ?? ''),
    complianceChecks,
  })
  const deposit = computeDeposit(bom)
  return {
    html: renderCustomerQuote(quoteData),
    generatedQuoteJson: JSON.stringify(quoteData),
    bomSnapshot: bomToSupplierBom(bom),
    bom,
    depositTotalR: deposit.totalR,
    depositNames: deposit.items.map((i) => i.name),
    complianceBlockers: complianceChecks.filter((c) => c.status === 'blocker').length,
  }
}
