// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Bill of materials + pricing from a SystemDesign.
//
// Walks the design (panels, combiners with their per-string/per-output products,
// inverter, batteries + bank wiring, AC board, extras) and produces priced line
// items. Pricing follows the house rule: sell = cost_rands × markup. Cable lengths
// are rough estimates until measured routes are wired in (flagged `approx`).
// ─────────────────────────────────────────────────────────────────────────────

import type { EquipmentCatalogItem } from './quote-calculator'
import {
  designBatteryKwh, type SystemDesign,
} from './system-design'

export interface BomLine {
  section: string
  catalogId: string
  sku: string
  description: string
  qty: number
  unitCostR: number
  unitSellR: number
  lineCostR: number
  lineSellR: number
  approx?: boolean
}

export interface BomSection {
  name: string
  lines: BomLine[]
  costR: number
  sellR: number
}

export interface DesignBom {
  sections: BomSection[]
  totalCostR: number
  totalSellR: number
  /** Catalog refs in the design that couldn't be priced (missing/!active). */
  missing: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function designToBom(
  design: SystemDesign,
  catalog: Map<string, EquipmentCatalogItem>,
  markup: number,
): DesignBom {
  const lines: BomLine[] = []
  let missing = 0

  const add = (section: string, catalogId: string | null | undefined, qty: number, approx = false) => {
    if (!catalogId || qty <= 0) return
    const item = catalog.get(catalogId)
    if (!item) { missing += 1; return }
    const unitCostR = item.cost_rands
    const unitSellR = round2(unitCostR * markup)
    lines.push({
      section, catalogId, sku: item.sku, description: item.description, qty,
      unitCostR, unitSellR, lineCostR: round2(unitCostR * qty), lineSellR: round2(unitSellR * qty), approx,
    })
  }

  // Panels
  for (const g of design.panels) add('Panels', g.catalogId, g.panelCount)

  // DC combiners
  for (const c of design.dcCombiners) {
    add('DC combiner', c.enclosureCatalogId, 1)
    for (const sid of c.inputStringIds) {
      const k = c.stringConnections[sid]
      if (!k) continue
      add('DC combiner', k.breakerId, 1)
      add('DC combiner', k.fuseHolderId, 1)
      add('DC combiner', k.fuseId, Math.max(1, k.fuseQty))
      add('DC combiner', k.isolatorId, 1)
    }
    for (const o of c.outputs) {
      add('DC combiner', o.spdId, 1)
      if (o.stringIds.length > 1) add('DC combiner', o.mainBreakerId, 1)
    }
  }

  // Inverter
  for (const u of design.inverters) add('Inverter', u.catalogId, u.qty)

  // Batteries + bank wiring
  const batteryCount = design.batteries.reduce((s, b) => s + b.qty, 0)
  for (const b of design.batteries) add('Batteries', b.catalogId, b.qty)
  const bank = design.bank
  if (designBatteryKwh(design) > 0) {
    // Rough cable metres until measured routes exist: ~3m per battery lead + 6m feed.
    if (bank.cableProductId) add('Batteries', bank.cableProductId, Math.max(6, batteryCount * 3 + 6), true)
    if (bank.perBatteryDisconnect) add('Batteries', bank.perBatteryDisconnectId, Math.max(1, batteryCount))
    if (bank.mainDisconnect) add('Batteries', bank.mainDisconnectId, 1)
  }

  // AC board(s)
  for (const c of design.acCombiners) {
    add('AC board', c.enclosureCatalogId, 1)
    add('AC board', c.mainBreakerId, 1)
    add('AC board', c.rccbId, 1)
    add('AC board', c.spdId, 1)
  }

  // Extras
  for (const x of design.extras) add('Extras', x.productId, 1)

  // Group by section, preserving first-seen order.
  const order: string[] = []
  const map = new Map<string, BomLine[]>()
  for (const l of lines) {
    if (!map.has(l.section)) { map.set(l.section, []); order.push(l.section) }
    map.get(l.section)!.push(l)
  }
  const sections: BomSection[] = order.map((name) => {
    const sl = map.get(name)!
    return {
      name, lines: sl,
      costR: round2(sl.reduce((s, l) => s + l.lineCostR, 0)),
      sellR: round2(sl.reduce((s, l) => s + l.lineSellR, 0)),
    }
  })

  return {
    sections,
    totalCostR: round2(sections.reduce((s, x) => s + x.costR, 0)),
    totalSellR: round2(sections.reduce((s, x) => s + x.sellR, 0)),
    missing,
  }
}
