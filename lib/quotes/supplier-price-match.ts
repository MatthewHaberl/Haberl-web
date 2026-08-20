// ─────────────────────────────────────────────────────────────────────────────
// Supplier price matching (W100) — the second half of the RFQ loop.
//
// The list went out (supplier-rfq.ts), the supplier's quote came back and was
// read into supplier_quote_lines (supplier-quotes.ts). This module answers the
// only question left: WHICH lines on our quote does that document price, and
// what do they cost now?
//
// Matching is by part number, in three descending tiers so a confident match is
// never confused with a hopeful one:
//   catalog  the supplier line was matched to a catalog product at parse time
//            and our line uses that same product — no string comparison at all
//   exact    the two SKUs are the same once case and surrounding space are
//            ignored
//   loose    the same once separators (space, hyphen, slash, underscore) are
//            ignored too — "EX9BT-3G" vs "EX9BT3G"
// Dots survive every tier on purpose: 2.5mm² and 25mm² are different cable, and
// a normaliser that eats the decimal quietly prices the wrong one.
//
// What comes out is an OVERRIDE MAP, not a rewritten quote. The override is
// keyed by what it matched on and stored on the quote's own scope/design, so
// both engines price a matched line at the quoted rate and everything else
// keeps pricing from the catalog exactly as before.
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import type { RfqCandidate } from './supplier-rfq'
import { landedCostR, type SupplierQuoteLineRow } from './supplier-quotes'

export type SupplierPriceTier = 'catalog' | 'exact' | 'loose'

/**
 * One price this quote takes from a supplier's quote instead of the catalog.
 *
 * Stored on quote_requests.scope / .system_design under `supplierPrices`, keyed
 * by `cat:<catalogId>` or `sku:<normalisedSku>`. Living on the quote is the
 * whole point: a supplier quote is a price for THIS job for a few days, not a
 * new standing cost, so it must never leak into the catalog other quotes read.
 */
export interface SupplierPriceOverride {
  /** Landed unit cost (rands) — supplier ex-VAT × 1.15, the basis the BOM uses. */
  unitCostR: number
  /** Supplier's ex-VAT rate, kept so the document can be reconciled line by line. */
  unitPriceExVatR: number
  /**
   * What the line cost before this price was applied. Kept so taking the price
   * back off restores the number that was there — a free-text line has no
   * catalog cost to fall back to, and losing a hand-typed cost to an undo would
   * be the worst kind of quiet edit.
   */
  previousUnitCostR: number
  sku: string
  supplier: string
  reference: string | null
  supplierQuoteId: string
  /** supplier_quote_lines.id this price came from. */
  lineId: string
  tier: SupplierPriceTier
  /** ISO timestamp of the apply. */
  appliedAt: string
}

export type SupplierPriceMap = Record<string, SupplierPriceOverride>

// ── Keys ─────────────────────────────────────────────────────────────────────

/** Case/space-insensitive form. Separators and dots are left alone (see header). */
export function normaliseSku(sku: string): string {
  return (sku ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Loose form — separators dropped, dots and digits untouched. */
export function looseSku(sku: string): string {
  return normaliseSku(sku).replace(/[\s\-_/]+/g, '')
}

export const catalogKey = (catalogId: string) => `cat:${catalogId}`
export const skuKey = (sku: string) => `sku:${normaliseSku(sku)}`

/**
 * The override for one quote line, or null. Catalog id wins over SKU: it is the
 * key a line can't typo.
 */
export function lookupSupplierPrice(
  prices: SupplierPriceMap | undefined,
  catalogId: string | null | undefined,
  sku: string | null | undefined,
): SupplierPriceOverride | null {
  if (!prices) return null
  if (catalogId) {
    const byCatalog = prices[catalogKey(catalogId)]
    if (byCatalog && byCatalog.unitCostR > 0) return byCatalog
  }
  if (sku) {
    const bySku = prices[skuKey(sku)]
    if (bySku && bySku.unitCostR > 0) return bySku
  }
  return null
}

// ── Matching ─────────────────────────────────────────────────────────────────

/** One row of the "what will change" review — a quote line and its new price. */
export interface SupplierPriceMatch {
  /** Key the override will be stored under. */
  key: string
  tier: SupplierPriceTier
  section: string
  sku: string
  description: string
  qty: number
  catalogId: string | null
  /** What this line costs the business today (catalog, or a price already applied). */
  currentUnitCostR: number
  /** What the supplier's quote makes it cost. */
  newUnitCostR: number
  unitPriceExVatR: number
  supplierQuoteLineId: string
  supplierDescription: string
  /** True when this exact price is already on the quote — nothing to change. */
  unchanged: boolean
}

export interface SupplierPriceMatchReport {
  matches: SupplierPriceMatch[]
  /** Quote lines this document doesn't price — the manual list. */
  unmatched: Array<{
    section: string
    sku: string
    description: string
    qty: number
    currentUnitCostR: number
  }>
  /** Supplier lines nothing on the quote uses — usually an extra to add by hand. */
  unused: Array<{ lineId: string; sku: string; description: string; qty: number; unitCostR: number }>
}

interface IndexedLine {
  line: SupplierQuoteLineRow
  used: boolean
}

/**
 * Match a supplier quote's lines against the quote's own material items.
 *
 * `candidates` are the same merged material lines the RFQ was built from
 * (bomToRfqCandidates), so what comes back is priced against exactly the list
 * that went out. `currentCost` reads the live unit cost off the priced BOM.
 */
export function matchSupplierQuote(
  candidates: RfqCandidate[],
  supplierLines: SupplierQuoteLineRow[],
  currentCost: (c: RfqCandidate) => number,
  existing: SupplierPriceMap = {},
): SupplierPriceMatchReport {
  const priced = supplierLines.filter((l) => l.unit_price_r > 0)
  const byCatalog = new Map<string, IndexedLine>()
  const byExact = new Map<string, IndexedLine>()
  const byLoose = new Map<string, IndexedLine>()

  for (const line of priced) {
    const entry: IndexedLine = { line, used: false }
    // First line wins a key — a supplier quoting the same part twice (two
    // deliveries, two discounts) must not silently reprice off the last row.
    if (line.catalog_id && !byCatalog.has(line.catalog_id)) byCatalog.set(line.catalog_id, entry)
    const exact = normaliseSku(line.sku)
    if (exact && !byExact.has(exact)) byExact.set(exact, entry)
    const loose = looseSku(line.sku)
    if (loose && !byLoose.has(loose)) byLoose.set(loose, entry)
  }

  const matches: SupplierPriceMatch[] = []
  const unmatched: SupplierPriceMatchReport['unmatched'] = []

  for (const c of candidates) {
    let hit: IndexedLine | undefined
    let tier: SupplierPriceTier = 'catalog'
    if (c.catalogId && byCatalog.has(c.catalogId)) {
      hit = byCatalog.get(c.catalogId)
      tier = 'catalog'
    } else if (c.sku && byExact.has(normaliseSku(c.sku))) {
      hit = byExact.get(normaliseSku(c.sku))
      tier = 'exact'
    } else if (c.sku && byLoose.has(looseSku(c.sku))) {
      hit = byLoose.get(looseSku(c.sku))
      tier = 'loose'
    }

    const current = currentCost(c)
    if (!hit) {
      unmatched.push({
        section: c.section, sku: c.sku, description: c.description, qty: c.qty,
        currentUnitCostR: current,
      })
      continue
    }
    hit.used = true
    // A line with a catalog id pins the price to the product; a free-text line
    // has only its SKU to be found by.
    const key = c.catalogId ? catalogKey(c.catalogId) : skuKey(c.sku)
    const newUnitCostR = landedCostR(hit.line.unit_price_r)
    const already = existing[key]
    matches.push({
      key,
      tier,
      section: c.section,
      sku: c.sku,
      description: c.description,
      qty: c.qty,
      catalogId: c.catalogId,
      currentUnitCostR: current,
      newUnitCostR,
      unitPriceExVatR: hit.line.unit_price_r,
      supplierQuoteLineId: hit.line.id,
      supplierDescription: hit.line.description,
      unchanged: !!already
        && already.lineId === hit.line.id
        && Math.abs(already.unitCostR - newUnitCostR) < 0.005,
    })
  }

  const usedIds = new Set<string>()
  for (const index of [byCatalog, byExact, byLoose]) {
    for (const entry of index.values()) if (entry.used) usedIds.add(entry.line.id)
  }
  const unused = priced
    .filter((l) => !usedIds.has(l.id))
    .map((l) => ({
      lineId: l.id,
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitCostR: landedCostR(l.unit_price_r),
    }))

  return { matches, unmatched, unused }
}

/** Fold chosen matches into the quote's existing override map. */
export function applySupplierPrices(
  existing: SupplierPriceMap | undefined,
  matches: SupplierPriceMatch[],
  meta: { supplierQuoteId: string; supplier: string; reference: string | null; now?: string },
): SupplierPriceMap {
  const appliedAt = meta.now ?? new Date().toISOString()
  const next: SupplierPriceMap = { ...(existing ?? {}) }
  for (const m of matches) {
    if (m.newUnitCostR <= 0) continue
    next[m.key] = {
      unitCostR: m.newUnitCostR,
      unitPriceExVatR: m.unitPriceExVatR,
      // Re-applying a second document must not forget the ORIGINAL cost.
      previousUnitCostR: existing?.[m.key]?.previousUnitCostR ?? m.currentUnitCostR,
      sku: m.sku,
      supplier: meta.supplier,
      reference: meta.reference,
      supplierQuoteId: meta.supplierQuoteId,
      lineId: m.supplierQuoteLineId,
      tier: m.tier,
      appliedAt,
    }
  }
  return next
}

/** Drop every price taken from one supplier quote (the "undo this document" action). */
export function clearSupplierPrices(
  existing: SupplierPriceMap | undefined,
  supplierQuoteId?: string,
): SupplierPriceMap {
  if (!existing) return {}
  if (!supplierQuoteId) return {}
  const next: SupplierPriceMap = {}
  for (const [key, value] of Object.entries(existing)) {
    if (value.supplierQuoteId !== supplierQuoteId) next[key] = value
  }
  return next
}

/** Tolerant parse of a persisted map — one bad entry never poisons the quote. */
export function parseSupplierPrices(raw: unknown): SupplierPriceMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: SupplierPriceMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const cost = typeof v.unitCostR === 'number' && Number.isFinite(v.unitCostR) ? v.unitCostR : 0
    if (cost <= 0) continue
    out[key] = {
      unitCostR: cost,
      unitPriceExVatR: typeof v.unitPriceExVatR === 'number' && Number.isFinite(v.unitPriceExVatR)
        ? v.unitPriceExVatR : 0,
      previousUnitCostR: typeof v.previousUnitCostR === 'number' && Number.isFinite(v.previousUnitCostR)
        ? v.previousUnitCostR : 0,
      sku: typeof v.sku === 'string' ? v.sku : '',
      supplier: typeof v.supplier === 'string' ? v.supplier : '',
      reference: typeof v.reference === 'string' && v.reference ? v.reference : null,
      supplierQuoteId: typeof v.supplierQuoteId === 'string' ? v.supplierQuoteId : '',
      lineId: typeof v.lineId === 'string' ? v.lineId : '',
      tier: v.tier === 'exact' || v.tier === 'loose' ? v.tier : 'catalog',
      appliedAt: typeof v.appliedAt === 'string' ? v.appliedAt : '',
    }
  }
  return out
}
