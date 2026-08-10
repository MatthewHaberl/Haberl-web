// ─────────────────────────────────────────────────────────────────────────────
// Best price across suppliers, at the moment you actually buy (SP5).
//
// Migration 052 already made the CATALOG cheapest-aware: a product with offers
// from several suppliers carries the cheapest offer's price in cost_rands. That
// is the right number for QUOTING — but it is invisible at PROCUREMENT time,
// where the buyer picks one supplier for the whole PO and never finds out that
// half the lines were cheaper somewhere else.
//
// This module answers the buying question: for the lines on this job, who is
// cheapest per line, what does the current single-supplier plan cost, and what
// would splitting the order across suppliers save?
//
// Job materials are a frozen snapshot with no catalog FK, so the join is on SKU
// — the same key the PO lines and the supplier's own order form use.
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierOffer {
  supplier: string
  supplierSku: string | null
  costRands: number
  inStock: boolean | null
  stockNote: string | null
  sourceUrl: string | null
  /** When this price was last confirmed — a stale price is a soft quote. */
  updatedAt: string | null
}

/** A line to be bought, with every supplier that sells it. */
export interface BestPriceLine {
  sku: string
  description: string
  qty: number
  /** What the job/BOM currently books this line at, per unit. */
  currentUnitCostR: number
  offers: SupplierOffer[]
  cheapest: SupplierOffer | null
  /** Line saving if bought from `cheapest` instead of at the current cost. */
  savingR: number
}

/** What one supplier would supply, if the order were split by cheapest price. */
export interface SupplierBasket {
  supplier: string
  /** SKUs this supplier is cheapest on. */
  skus: string[]
  lineCount: number
  totalCostR: number
}

export interface BestPriceReport {
  lines: BestPriceLine[]
  /** Cost of the current plan (every line at its booked cost). */
  currentTotalR: number
  /** Cost if every line came from whoever is cheapest on it. */
  optimisedTotalR: number
  savingR: number
  /** One basket per supplier in the optimised split, biggest first. */
  baskets: SupplierBasket[]
  /** Lines with no supplier offer at all — nothing to optimise, still must be bought. */
  unmatched: BestPriceLine[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Row shape returned by the offers query below. */
export interface OfferRow {
  supplier: string
  supplier_sku: string | null
  cost_rands: number
  in_stock: boolean | null
  stock_note: string | null
  source_url: string | null
  updated_at: string | null
  equipment_catalog: { sku: string | null } | { sku: string | null }[] | null
}

/** Normalise the embedded catalog row — PostgREST may hand back an object or a 1-array. */
function rowSku(row: OfferRow): string {
  const c = row.equipment_catalog
  const item = Array.isArray(c) ? c[0] : c
  return (item?.sku ?? '').trim()
}

/**
 * Group supplier offers by SKU. Kept separate from the fetch so it can be unit
 * tested without a database, and so a caller with offers already in hand
 * (e.g. the catalog page) can reuse it.
 */
export function offersBySku(rows: OfferRow[]): Map<string, SupplierOffer[]> {
  const map = new Map<string, SupplierOffer[]>()
  for (const row of rows) {
    const sku = rowSku(row)
    if (!sku) continue
    const list = map.get(sku) ?? []
    list.push({
      supplier: row.supplier,
      supplierSku: row.supplier_sku,
      costRands: Number(row.cost_rands) || 0,
      inStock: row.in_stock,
      stockNote: row.stock_note,
      sourceUrl: row.source_url,
      updatedAt: row.updated_at,
    })
    map.set(sku, list)
  }
  // Cheapest first, and a known-in-stock offer wins a tie — a R0.00 saving is
  // not worth ordering from someone who has to back-order it.
  for (const list of map.values()) {
    list.sort((a, b) => (a.costRands - b.costRands) || (Number(b.inStock === true) - Number(a.inStock === true)))
  }
  return map
}

export interface PurchaseLineInput {
  sku: string | null
  description: string | null
  qty: number
  /** Unit cost currently booked, in cents (job_materials.unit_cost_cents). */
  unitCostCents: number
}

/**
 * Build the buying report. Out-of-stock offers are still listed (the buyer may
 * want to wait for them) but never chosen as `cheapest` when an in-stock offer
 * exists, because an order that can't ship isn't a saving.
 */
export function buildBestPriceReport(
  lines: PurchaseLineInput[],
  offers: Map<string, SupplierOffer[]>,
): BestPriceReport {
  const out: BestPriceLine[] = []

  for (const l of lines) {
    const sku = (l.sku ?? '').trim()
    const qty = Math.max(0, l.qty)
    const currentUnitCostR = round2((l.unitCostCents ?? 0) / 100)
    const all = sku ? offers.get(sku) ?? [] : []
    // Prefer the cheapest offer that isn't explicitly out of stock; fall back to
    // the cheapest overall when every offer is out (or stock is simply unknown).
    const cheapest = all.find((o) => o.inStock !== false) ?? all[0] ?? null
    const savingR = cheapest && currentUnitCostR > 0
      ? round2(Math.max(0, currentUnitCostR - cheapest.costRands) * qty)
      : 0
    out.push({ sku, description: l.description ?? '', qty, currentUnitCostR, offers: all, cheapest, savingR })
  }

  const currentTotalR = round2(out.reduce((s, l) => s + l.currentUnitCostR * l.qty, 0))
  const optimisedTotalR = round2(out.reduce(
    (s, l) => s + (l.cheapest ? Math.min(l.cheapest.costRands, l.currentUnitCostR || l.cheapest.costRands) : l.currentUnitCostR) * l.qty,
    0,
  ))

  const basketMap = new Map<string, SupplierBasket>()
  for (const l of out) {
    // Only lines where switching actually helps belong in a split basket —
    // otherwise a R0-saving line would drag a whole extra PO into existence.
    if (!l.cheapest || l.savingR <= 0) continue
    const b = basketMap.get(l.cheapest.supplier) ?? { supplier: l.cheapest.supplier, skus: [], lineCount: 0, totalCostR: 0 }
    b.skus.push(l.sku)
    b.lineCount += 1
    b.totalCostR = round2(b.totalCostR + l.cheapest.costRands * l.qty)
    basketMap.set(l.cheapest.supplier, b)
  }

  return {
    lines: out,
    currentTotalR,
    optimisedTotalR,
    savingR: round2(Math.max(0, currentTotalR - optimisedTotalR)),
    baskets: [...basketMap.values()].sort((a, b) => b.totalCostR - a.totalCostR),
    unmatched: out.filter((l) => l.offers.length === 0),
  }
}

/** The select the callers use — exported so the shape and OfferRow stay in step. */
export const OFFERS_SELECT =
  'supplier, supplier_sku, cost_rands, in_stock, stock_note, source_url, updated_at, equipment_catalog!inner(sku)'
