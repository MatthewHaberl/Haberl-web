'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Supplier-line bus (W105) — how the Quoted-line-items panel puts a supplier's
// line ONTO the quote.
//
// Same posture as supplier-prices-bus.ts, and for the same reason: the panel
// sits BESIDE the builder, and the builder owns the quote's live state and its
// autosave. So the panel never writes lines itself. It asks; the builder folds
// the request into its own state and answers with where lines can go and which
// document lines are already on the quote.
//
// The answer is what makes "add the whole document" safe to press twice: the
// panel can grey out the lines that are already there and add only the rest,
// instead of quietly duplicating a 34-line invoice.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'

/** Somewhere a supplier line can land — a scope section, or the solar BOM. */
export interface SupplierLineTarget {
  /** Opaque to the panel; only the builder that published it reads it. */
  id: string
  label: string
}

/** One supplier_quote_lines row, in the shape a builder needs to add it. */
export interface AddableSupplierLine {
  lineId: string
  supplierQuoteId: string
  supplierLabel: string
  sku: string
  description: string
  qty: number
  unit: string
  /** Supplier EX-VAT unit price (rands). */
  unitPriceExVatR: number
}

/** Builder → panel: where lines can go, and what is already on the quote. */
export const SUPPLIER_LINES_STATE = 'haberl:supplier-lines-state'
/** Panel → builder: say again (the panel mounts after the builder's first publish). */
export const SUPPLIER_LINES_REQUEST = 'haberl:supplier-lines-request'
/** Panel → builder: put these lines on the quote. */
export const SUPPLIER_LINES_ADD = 'haberl:supplier-lines-add'

export interface LinesStateDetail {
  targets: SupplierLineTarget[]
  /** supplier_quote_lines.id values already on the quote. */
  addedLineIds: string[]
}

export interface AddLinesDetail {
  targetId: string
  lines: AddableSupplierLine[]
}

export function publishSupplierLineState(detail: LinesStateDetail) {
  window.dispatchEvent(new CustomEvent<LinesStateDetail>(SUPPLIER_LINES_STATE, { detail }))
}

export function requestSupplierLineState() {
  window.dispatchEvent(new Event(SUPPLIER_LINES_REQUEST))
}

export function requestAddSupplierLines(detail: AddLinesDetail) {
  window.dispatchEvent(new CustomEvent<AddLinesDetail>(SUPPLIER_LINES_ADD, { detail }))
}

/**
 * The panel's half: listen for the builder's answer, ask for one on mount.
 * Returns empty targets when no builder is listening, which is the panel's cue
 * to hide the add buttons rather than offer a button that does nothing.
 */
export function useSupplierLineTargets(): LinesStateDetail {
  const [state, setState] = useState<LinesStateDetail>({ targets: [], addedLineIds: [] })
  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<LinesStateDetail>).detail
      setState({ targets: d?.targets ?? [], addedLineIds: d?.addedLineIds ?? [] })
    }
    window.addEventListener(SUPPLIER_LINES_STATE, onState)
    requestSupplierLineState()
    return () => window.removeEventListener(SUPPLIER_LINES_STATE, onState)
  }, [])
  return state
}

/**
 * The builder's half: add requests come in, and the current targets + the ids
 * already on the quote go back out — on every change and on demand.
 */
export function useSupplierLineBridge(
  targets: SupplierLineTarget[],
  addedLineIds: string[],
  onAdd: (detail: AddLinesDetail) => void,
) {
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<AddLinesDetail>).detail
      if (!d?.lines?.length) return
      onAdd(d)
    }
    window.addEventListener(SUPPLIER_LINES_ADD, handler)
    return () => window.removeEventListener(SUPPLIER_LINES_ADD, handler)
  }, [onAdd])

  // Compare by CONTENT, not identity: a builder rebuilds these arrays on every
  // render, and republishing on each keystroke would reset the panel's picker.
  const key = JSON.stringify({ targets, addedLineIds })
  const detail = useMemo<LinesStateDetail>(() => JSON.parse(key) as LinesStateDetail, [key])

  const publish = useCallback(() => publishSupplierLineState(detail), [detail])
  useEffect(() => {
    publish()
    window.addEventListener(SUPPLIER_LINES_REQUEST, publish)
    return () => window.removeEventListener(SUPPLIER_LINES_REQUEST, publish)
  }, [publish])
}
