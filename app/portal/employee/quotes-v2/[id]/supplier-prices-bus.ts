'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Supplier-price bus (W100) — how the Quoted-line-items panel talks to whichever
// builder is on the page.
//
// The panel sits BESIDE the builder, not inside it, and the builder owns both
// the quote's live state and its autosave. So the panel never writes prices
// itself: it asks, the builder applies, and the builder answers with what is
// now on the quote. Same posture as SUPPLIER_QUOTES_CHANGED / RFQS_CHANGED —
// one window event each way, so a third listener can be added without either
// side knowing about it.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import {
  applySupplierPrices, clearSupplierPrices,
  type SupplierPriceMap, type SupplierPriceMatch,
} from '@/lib/quotes/supplier-price-match'

/** Panel → builder: put these prices on the quote. */
export const SUPPLIER_PRICES_APPLY = 'haberl:supplier-prices-apply'
/** Panel → builder: take every price that came from this document back off. */
export const SUPPLIER_PRICES_CLEAR = 'haberl:supplier-prices-clear'
/** Builder → panel: this is what is applied right now. */
export const SUPPLIER_PRICES_STATE = 'haberl:supplier-prices-state'
/**
 * Panel → builder: say again. The builder's first publish happens before the
 * panel below it has mounted its listener, so the panel asks on mount rather
 * than showing no badges until the next change.
 */
export const SUPPLIER_PRICES_REQUEST = 'haberl:supplier-prices-request'

export interface ApplyDetail {
  matches: SupplierPriceMatch[]
  supplierQuoteId: string
  supplier: string
  reference: string | null
}

export interface ClearDetail {
  supplierQuoteId: string
}

export interface StateDetail {
  /** How many prices are applied, per supplier_quotes.id. */
  countBySupplierQuote: Record<string, number>
  total: number
}

export function requestApplySupplierPrices(detail: ApplyDetail) {
  window.dispatchEvent(new CustomEvent<ApplyDetail>(SUPPLIER_PRICES_APPLY, { detail }))
}

export function requestClearSupplierPrices(detail: ClearDetail) {
  window.dispatchEvent(new CustomEvent<ClearDetail>(SUPPLIER_PRICES_CLEAR, { detail }))
}

export function requestSupplierPriceState() {
  window.dispatchEvent(new Event(SUPPLIER_PRICES_REQUEST))
}

export function publishSupplierPriceState(detail: StateDetail) {
  window.dispatchEvent(new CustomEvent<StateDetail>(SUPPLIER_PRICES_STATE, { detail }))
}

/** How many prices on the quote came from each supplier quote. */
export function supplierPriceCounts(prices: SupplierPriceMap | undefined): StateDetail {
  const countBySupplierQuote: Record<string, number> = {}
  let total = 0
  for (const value of Object.values(prices ?? {})) {
    if (!value.supplierQuoteId) continue
    countBySupplierQuote[value.supplierQuoteId] = (countBySupplierQuote[value.supplierQuoteId] ?? 0) + 1
    total += 1
  }
  return { countBySupplierQuote, total }
}

/**
 * One request from the panel, in the shape the builder folds into its state.
 * Carrying the matches (not just the resulting map) is what lets the scope
 * builder stamp its own line rows in the SAME setState, so its live totals
 * move the moment the prices are applied.
 */
export type BridgeRequest =
  | { kind: 'apply'; matches: SupplierPriceMatch[]; supplierQuoteId: string; supplier: string; reference: string | null }
  | { kind: 'clear'; supplierQuoteId: string }

/** The map after one request. Pure — call it inside the builder's setState. */
export function foldSupplierPriceRequest(
  current: SupplierPriceMap | undefined,
  req: BridgeRequest,
): SupplierPriceMap {
  if (req.kind === 'clear') return clearSupplierPrices(current, req.supplierQuoteId)
  return applySupplierPrices(current, req.matches, {
    supplierQuoteId: req.supplierQuoteId,
    supplier: req.supplier,
    reference: req.reference,
  })
}

/**
 * The builder's half of the bus: requests come in, the builder folds them into
 * its own state (so the fold always sees the live map, never a copy captured in
 * the panel), and the resulting counts go back out to the panel.
 */
export function useSupplierPriceBridge(
  prices: SupplierPriceMap | undefined,
  handle: (req: BridgeRequest) => void,
) {
  useEffect(() => {
    const onApply = (e: Event) => {
      const d = (e as CustomEvent<ApplyDetail>).detail
      if (!d?.matches?.length) return
      handle({
        kind: 'apply', matches: d.matches, supplierQuoteId: d.supplierQuoteId,
        supplier: d.supplier, reference: d.reference,
      })
    }
    const onClear = (e: Event) => {
      const d = (e as CustomEvent<ClearDetail>).detail
      if (!d?.supplierQuoteId) return
      handle({ kind: 'clear', supplierQuoteId: d.supplierQuoteId })
    }
    window.addEventListener(SUPPLIER_PRICES_APPLY, onApply)
    window.addEventListener(SUPPLIER_PRICES_CLEAR, onClear)
    return () => {
      window.removeEventListener(SUPPLIER_PRICES_APPLY, onApply)
      window.removeEventListener(SUPPLIER_PRICES_CLEAR, onClear)
    }
  }, [handle])

  // Republished on every change, and on demand, so the panel's badges are right
  // after a reload without it having to read the quote itself.
  useEffect(() => {
    publishSupplierPriceState(supplierPriceCounts(prices))
    const onRequest = () => publishSupplierPriceState(supplierPriceCounts(prices))
    window.addEventListener(SUPPLIER_PRICES_REQUEST, onRequest)
    return () => window.removeEventListener(SUPPLIER_PRICES_REQUEST, onRequest)
  }, [prices])
}
