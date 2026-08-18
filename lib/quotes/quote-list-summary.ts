// ─────────────────────────────────────────────────────────────────────────────
// quote-list-summary — what the quotes list needs to know about a quote it is
// only listing, not opening.
//
// Two things the list can't get from the row itself:
//   the money  — total_amount is written by /generate, so a draft has none;
//   the shape  — a combined quote is several jobs under one option, and the
//                list showed it as a single line like any other.
//
// Both are derived from `scope` (JSONB the row already carries), never from the
// catalog: a scope line stamps its own sell price when it is picked, so the sums
// here are the same arithmetic the builder's totals panel shows. A solar design
// stores catalog IDs only and can't be priced without the 15k-row catalog —
// that engine writes its own working total to the row instead (migration 122).
//
// Pure module — no Supabase, no React.
// ─────────────────────────────────────────────────────────────────────────────

import {
  packageDisplayLabels, packageTotals, parseScope, scopeTotals, type QuoteScope,
} from './scope'

/**
 * Has anything actually been scoped?
 *
 * A brand-new scope already totals the call-out fee — right in the builder,
 * where you can see it is a default sitting on an empty page. On a list it
 * would read as "this job is R750", so a quote nobody has touched shows no
 * figure at all. Any line, any labour entered, or a certificate switched on
 * counts as work.
 */
function scopeHasWork(scope: QuoteScope): boolean {
  const l = scope.labour
  return scope.lines.length > 0 ||
    l.hours > 0 || l.days > 0 || l.fixedR > 0 || l.crew.length > 0 ||
    l.managementIncluded || scope.coc.included
}

/** One job inside a combined quote, as the list shows it. */
export interface QuotePackageSummary {
  name: string
  /** Priced on its own — its work, its visit, its certificate. */
  ownTotalR: number
}

export interface QuoteListSummary {
  /**
   * Best figure available, in rands: the generated total where one exists,
   * otherwise the working total. Null when nothing has been priced yet.
   */
  totalR: number | null
  /** True when totalR is a draft — the quote has never been generated. */
  draft: boolean
  /** Lines still waiting on a supplier price (scope quotes only). */
  needsPricing: number
  /** The jobs bundled under this one quote. Empty on an ordinary quote. */
  packages: QuotePackageSummary[]
}

export interface QuoteSummaryRow {
  status: string
  /** Rands ×100 — written by /generate. */
  total_amount?: number | null
  /** Rands — written by the design canvas as it saves. */
  working_total_rands?: number | null
  scope?: unknown
}

/**
 * Summarise one quote row for the list.
 *
 * The generated total wins wherever it exists: it is the figure on the document
 * the customer holds, and a later canvas fiddle must not silently restate it.
 * Only a quote that has never produced a document falls back to the draft.
 */
export function summariseQuoteRow(row: QuoteSummaryRow): QuoteListSummary {
  const generatedR = typeof row.total_amount === 'number' ? row.total_amount / 100 : null
  const scope = parseScope(row.scope)

  let draftR: number | null = null
  let needsPricing = 0
  const packages: QuotePackageSummary[] = []

  if (scope) {
    const totals = scopeTotals(scope)
    needsPricing = totals.needsPricing
    draftR = scopeHasWork(scope) && totals.sellR > 0 ? totals.sellR : null
    const labels = packageDisplayLabels(scope)
    for (const pkg of scope.packages) {
      packages.push({
        name: labels.get(pkg.id) ?? 'Package',
        ownTotalR: packageTotals(scope, pkg).sellR,
      })
    }
  }
  // A solar row has no scope; so does a scope row whose builder was opened and
  // never priced. Either way the canvas's own figure is the only draft there is.
  if (draftR == null && typeof row.working_total_rands === 'number' && row.working_total_rands > 0) {
    draftR = row.working_total_rands
  }

  if (generatedR != null && generatedR > 0) {
    return { totalR: generatedR, draft: false, needsPricing, packages }
  }
  return { totalR: draftR, draft: draftR != null, needsPricing, packages }
}
