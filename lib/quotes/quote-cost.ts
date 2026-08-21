// ─────────────────────────────────────────────────────────────────────────────
// What a quote costs — landed, and with the supplier VAT taken back out.
//
// Every bought-in line on a BOM carries its cost LANDED: the supplier's ex-VAT
// price × 1.15, because Haberl is not VAT-registered and that input VAT is
// never claimed back. Landed is the honest number for margin — it is money
// that actually leaves the account, and nothing here changes it.
//
// It is the wrong number for two other jobs, which is why this module exists:
//   - checking the BOM against a supplier's quote or price list, both ex-VAT
//   - seeing what the same job would cost once Haberl IS VAT-registered
//
// Only bought-in lines carry that VAT. Wages, Matthew's own time and the CoC
// fee are quoted cost = sell and never had VAT in them, so dividing the whole
// cost total by 1.15 would invent a VAT refund on labour. Hence the split by
// line: isMaterialLine decides, the same predicate the contingency bases use.
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import { isMaterialLine } from '@/lib/solar/design-bom'
import type { BomLine, BomSection, DesignBom } from '@/lib/solar/design-bom'
import { UNRECOVERABLE_VAT } from './supplier-quotes'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Strip the unrecoverable VAT back out of a landed cost. */
export function exVatR(landedR: number): number {
  return round2(Math.max(0, landedR) / UNRECOVERABLE_VAT)
}

export interface QuoteCost {
  /** What the quote costs as the BOM carries it — supplier VAT included. */
  landedR: number
  /** The same cost with supplier VAT taken out of the bought-in lines only. */
  exVatR: number
  /** The unrecoverable VAT sitting inside landedR. */
  vatR: number
  /** Bought-in lines, landed. */
  materialsLandedR: number
  /** Bought-in lines at the supplier's ex-VAT price. */
  materialsExVatR: number
  /** Wages, own time and certificates — no VAT in them, identical in both views. */
  labourR: number
}

/**
 * Cost breakdown for a whole BOM.
 *
 * Optional extras are excluded, exactly as they are from totalCostR/totalSellR:
 * they are not in the quote, so they are not in what the quote costs. Unpriced
 * ("Quote") lines cost 0 by construction — the ex-VAT figure is as complete as
 * the pricing behind it, no more.
 */
export function bomCost(bom: DesignBom): QuoteCost {
  let materialsLandedR = 0
  let labourR = 0
  for (const section of bom.sections) {
    for (const line of section.lines) {
      if (line.optional) continue
      if (isMaterialLine(line)) materialsLandedR += line.lineCostR
      else labourR += line.lineCostR
    }
  }
  return costFrom(materialsLandedR, labourR)
}

/** Same breakdown from figures already split by kind (the scope builder's preview). */
export function costFrom(materialsLandedR: number, labourR: number): QuoteCost {
  const materials = round2(Math.max(0, materialsLandedR))
  const labour = round2(Math.max(0, labourR))
  const materialsEx = exVatR(materials)
  return {
    landedR: round2(materials + labour),
    exVatR: round2(materialsEx + labour),
    vatR: round2(materials - materialsEx),
    materialsLandedR: materials,
    materialsExVatR: materialsEx,
    labourR: labour,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The customer's side of the same arithmetic (W104)
//
// A quote can be sent showing what every figure on it would be with no VAT in
// it — for a customer who talks in ex-VAT numbers because their suppliers do.
// It is per-quote and off by default: it is a transparency most customers
// neither need nor asked for, and the open-book level shows what the parts
// cost us.
//
// The transform is NOT "divide the total by 1.15". A material line sells for
// (supplier ex-VAT × 1.15) × markup, so dividing THAT by 1.15 lands exactly on
// supplier ex-VAT × markup — the honest "if the parts had never been VAT'd"
// price. Labour, own time and the CoC never carried VAT, so they are the same
// figure in both columns and must be left alone. Divide the grand total and
// you quietly hand the customer a 15% discount on the labour that isn't there.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How much of the pricing a customer document states (migration 131).
 * null is 'none' — the document every quote has always had.
 */
export type PricingDisclosure = 'ex_vat' | 'open_book' | null

/** Read a stored quote_requests.pricing_disclosure into that type. */
export function parsePricingDisclosure(raw: unknown): PricingDisclosure {
  return raw === 'ex_vat' || raw === 'open_book' ? raw : null
}

/** What one BOM line would sell for with no VAT in the parts behind it. */
export function lineSellExVatR(line: BomLine): number {
  return isMaterialLine(line) ? exVatR(line.lineSellR) : round2(line.lineSellR)
}

/** A section's subtotal, line by line — never the subtotal ÷ 1.15. */
export function sectionSellExVatR(section: BomSection): number {
  return round2(
    section.lines
      .filter((l) => !l.optional)
      .reduce((t, l) => t + lineSellExVatR(l), 0),
  )
}

/** The whole quote's total with no VAT in it. */
export function bomSellExVatR(bom: DesignBom): number {
  return round2(bom.sections.reduce((t, s) => t + sectionSellExVatR(s), 0))
}

/**
 * The supplier's own ex-VAT price for one unit of a line, and what we add.
 *
 * Only for the open-book setting — this is the figure that shows a customer
 * our margin, and it must never reach a document that wasn't set to show it.
 * Null when the line has no cost behind it (a "Quote" line, or labour).
 */
export function lineSupplierExVat(line: BomLine): { unitExVatR: number; markupPct: number } | null {
  if (!isMaterialLine(line) || !line.priced || line.unitCostR <= 0) return null
  const unitExVatR = exVatR(line.unitCostR)
  if (unitExVatR <= 0) return null
  // Markup measured against the ex-VAT price, because that is the number
  // printed beside it — measuring against landed cost would show a percentage
  // the customer cannot reproduce from what they can see.
  return { unitExVatR, markupPct: (line.unitSellR / unitExVatR - 1) * 100 }
}
