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
import type { DesignBom } from '@/lib/solar/design-bom'
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
