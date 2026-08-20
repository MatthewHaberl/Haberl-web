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
import {
  applyCredits, creditViews, grossFiguresFromDocument, parseCredits, type QuoteCredit,
} from '@/lib/quotes/credits'
import {
  applyContingency, contingencyBases, parseContingency,
  type ContingencyBases, type ContingencyResult,
} from '@/lib/quotes/contingency'
import { renderScopeQuote, type ScopeQuoteData } from '@/lib/quotes/render-scope-quote'

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
  /**
   * Document detail level (migration 124). 'detailed' prints every line item
   * with its quantity and price; anything else — including an older row that
   * predates the column being read — is the simplified section-subtotal
   * document every quote has had until now.
   */
  quote_version?: string | null
  /**
   * May the customer accept one work package on its own (migration 124)?
   * Absent/null reads as true, so an older saved row keeps the choice its
   * document already offers.
   */
  allow_partial_acceptance?: boolean | null
  /**
   * Money already owed to the customer (migration 126) — a deposit they have
   * paid, a part back under warranty, a reimbursement, a discount. Subtracted
   * after the BOM, so the sections still state the price of the work. Absent
   * or empty on every quote that has none, which renders as it always has.
   */
  credits?: unknown
  /**
   * Allowance added for unforeseen work (migration 129) — a percentage of
   * materials/labour/total, a fixed amount, and/or rounding the total up.
   * Applied to the finished BOM, so it is in the price of the work rather than
   * subtracted from it like a credit. Absent/{} on every quote that has none.
   */
  contingency?: unknown
}

/**
 * A validated, priced quote — one engine's parsed input plus its BOM.
 *
 * `bom` already has the contingency in it (migration 129), because everything
 * downstream of this point spends the BOM: the document total, the deposit, the
 * materials snapshot, the job. `bases` holds the figures it was worked out FROM,
 * before any of it was added — the panel needs those to price a change without
 * compounding, exactly as credits needs grossFiguresFromDocument.
 */
export type PricedQuote = {
  bases: ContingencyBases
  contingency: ContingencyResult
} & (
  | { engine: 'scope'; scope: QuoteScope; bom: DesignBom }
  | { engine: 'solar'; design: SystemDesign; bom: DesignBom }
)

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
  /**
   * What the customer pays — the BOM total less any credits. Saved as
   * total_amount, so everything downstream (the accept page, the job, the
   * emails, finance) reads one figure and it is the real one.
   */
  payableTotalR: number
  /** Deposit still due after credits — saved as deposit_amount. */
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
  const contingency = parseContingency(quote.contingency)

  // The allowance goes on AFTER the engine has finished pricing and BEFORE
  // anything reads the total, so the two engines stay ignorant of it and every
  // consumer downstream sees one figure with it already inside.
  const withAllowance = (bom: DesignBom) => {
    const bases = contingencyBases(bom)
    const applied = applyContingency(bom, contingency)
    return { bases, contingency: applied.result, bom: applied.bom }
  }

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
    return { ok: true, priced: { engine: 'scope', scope, ...withAllowance(bom) } }
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
      ...withAllowance(consolidateBom(designToBom(design, catalog, pricing.markup, { gridSupply, pricing }))),
    },
  }
}

/**
 * The quote's BOM with none of the send-gates above.
 *
 * An RFQ (W99) is built precisely when the design ISN'T finished — that's why
 * it's being sent — so a scope line still missing its description, or a design
 * with nothing priced yet, must not be a reason to refuse the list. Returns
 * null only when there is genuinely nothing in the quote to ask about.
 */
export function bomForQuoteRequest(
  { quote, catalog, pricing, workTypes }: PriceArgs,
): { engine: 'scope' | 'solar'; bom: DesignBom } | null {
  const engine = engineFor(quote.work_type ?? null, workTypes)

  if (engine === 'scope') {
    const scope = parseScope(quote.scope)
    if (!scope || scope.lines.length === 0) return null
    return { engine, bom: scopeToBom(scope, catalog, pricing.markup, { pricing }) }
  }

  const design = parseDesign(quote.system_design)
  if (!design) return null
  const bom = consolidateBom(
    designToBom(design, catalog, pricing.markup, { gridSupply: quote.grid_supply ?? undefined, pricing }),
  )
  return bom.sections.some((s) => s.lines.length > 0) ? { engine, bom } : null
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
  const credits = parseCredits(quote.credits)

  if (priced.engine === 'scope') {
    const { scope, bom } = priced
    const scopeData = buildScopeQuoteData({
      scope, bom, catalog,
      req: quote,
      showEquipmentPhotos: quote.show_equipment_photos !== false,
      showLineItems: quote.quote_version === 'detailed',
      allowPartial: quote.allow_partial_acceptance !== false,
      credits,
      quoteNumber, expiryDays,
      workType: quote.work_type ?? '',
      workTypeLabel: workTypeLabel(quote.work_type ?? null, workTypes),
    })
    return {
      html: renderScopeQuote(scopeData),
      // The contingency bases ride along in the saved document (never rendered)
      // so the panel can re-price a change to the allowance without loading the
      // catalog — see ContingencyBases.
      generatedQuoteJson: JSON.stringify({ ...scopeData, contingencyBases: priced.bases }),
      // Optional extras stay out of procurement/job materials.
      bomSnapshot: bomToSupplierBom(stripOptionalLines(bom)),
      bom,
      payableTotalR: scopeData.payableTotalRands ?? scopeData.quoteTotalRands,
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
    showLineItems: quote.quote_version === 'detailed',
    credits,
    quoteNumber, expiryDays,
    tariffRate: getTariffRateForMunicipality(quote.municipality ?? ''),
    complianceChecks,
  })
  const deposit = computeDeposit(bom)
  const money = applyCredits(bom.totalSellR, deposit.totalR, credits)
  return {
    html: renderCustomerQuote(quoteData),
    generatedQuoteJson: JSON.stringify({ ...quoteData, contingencyBases: priced.bases }),
    bomSnapshot: bomToSupplierBom(bom),
    bom,
    payableTotalR: money.payableR,
    depositTotalR: money.depositR,
    depositNames: deposit.items.map((i) => i.name),
    complianceBlockers: complianceChecks.filter((c) => c.status === 'blocker').length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reissue with credits (migration 126)
//
// A credit is most often needed on a quote that has ALREADY been issued — the
// job is done, something came back under warranty, and the customer needs the
// number in front of them to change. Re-running the generator would re-price
// the whole thing off today's catalog, so a credit could silently drag six
// months of supplier increases onto a quote nobody meant to touch.
//
// So this never re-prices. It reads the priced document the quote already
// holds (generated_quote — the exact data that rendered the HTML), applies the
// credits to it, and re-renders. Everything else on the page is byte-identical
// because it is literally the same data.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReissuedDocument {
  html: string
  generatedQuoteJson: string
  /** Net of credits — what total_amount becomes. */
  payableTotalR: number
  /** Deposit still due — what deposit_amount becomes. */
  depositTotalR: number
}

function rand(n: number): string {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Apply credits to an already-generated quote document.
 *
 * Returns null when there is nothing to reissue: no saved document, or a legacy
 * multi-option quote, whose per-tier totals are a different shape than the one
 * figure a credit comes off. The caller saves the credits either way and tells
 * the operator to regenerate.
 */
export function reissueWithCredits(
  generatedQuote: unknown,
  credits: QuoteCredit[],
): ReissuedDocument | null {
  if (!generatedQuote) return null
  let data: Record<string, unknown>
  try {
    data = (typeof generatedQuote === 'string' ? JSON.parse(generatedQuote) : generatedQuote) as Record<string, unknown>
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (data.type === 'multi-option') return null

  // GROSS figures, never the (already-credited) totals on the row — see
  // grossFiguresFromDocument. Crediting a credited number compounds.
  const gross = grossFiguresFromDocument(data)
  if (!gross) return null
  const money = applyCredits(gross.grossTotalR, gross.grossDepositR, credits)

  const next: Record<string, unknown> = {
    ...data,
    depositTotal: rand(money.depositR),
    depositTotalRands: money.depositR,
    balanceTotal: rand(money.balanceR),
  }
  if (credits.length > 0) {
    next.credits = creditViews(credits, money.appliedR)
    next.payableTotal = rand(money.payableR)
    next.payableTotalRands = money.payableR
  } else {
    // Removing the last credit must leave the document with no trace of one —
    // an empty credits array would still print a "Total payable" row.
    delete next.credits
    delete next.payableTotal
    delete next.payableTotalRands
  }

  const html = data.type === 'scope'
    ? renderScopeQuote(next as unknown as ScopeQuoteData)
    : renderCustomerQuote(next as unknown as Parameters<typeof renderCustomerQuote>[0])

  return {
    html,
    generatedQuoteJson: JSON.stringify(next),
    payableTotalR: money.payableR,
    depositTotalR: money.depositR,
  }
}
