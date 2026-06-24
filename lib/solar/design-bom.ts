// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Bill of materials + pricing from a SystemDesign.
//
// Walks the design (panels, combiners with their per-string/per-output products,
// inverter, batteries + bank wiring, AC board, extras) and produces priced line
// items. Pricing follows the house rule: sell = cost_rands × markup. Cable lengths
// are rough estimates until measured routes are wired in (flagged `approx`).
// ─────────────────────────────────────────────────────────────────────────────

import { cableCostPerMeter, type EquipmentCatalogItem } from './quote-calculator'
import type { CableEdgeData } from './sld-builder'
import {
  designBatteryKwh, designToFlow, type SystemDesign,
} from './system-design'

/** Why a line has no price — drives the "get a quote" view. */
export type BomLineStatus = 'ok' | 'no-product' | 'product-missing' | 'no-cost'

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
  /** False when no product is chosen, the product is gone, or it has no cost yet. */
  priced: boolean
  status: BomLineStatus
}

export interface BomSection {
  name: string
  lines: BomLine[]
  costR: number
  sellR: number
  /** Lines in this section still waiting on a price. */
  needsPricing: number
}

export interface DesignBom {
  sections: BomSection[]
  totalCostR: number
  totalSellR: number
  /** Catalog refs in the design that couldn't be priced (missing/!active). */
  missing: number
  /** Total line items (any section) still waiting on a price. */
  needsPricing: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function designToBom(
  design: SystemDesign,
  catalog: Map<string, EquipmentCatalogItem>,
  markup: number,
  opts: { gridSupply?: string } = {},
): DesignBom {
  const lines: BomLine[] = []
  let missing = 0

  // Every component is listed — priced when a costed catalog product is attached,
  // otherwise surfaced as a "Quote" line so it can be sent to the supplier.
  const add = (section: string, catalogId: string | null | undefined, qty: number, opts: { approx?: boolean; label?: string } = {}) => {
    if (qty <= 0) return
    const label = opts.label
    const unpriced = (id: string, sku: string, description: string, status: BomLineStatus) => {
      lines.push({
        section, catalogId: id, sku, description, qty,
        unitCostR: 0, unitSellR: 0, lineCostR: 0, lineSellR: 0,
        priced: false, status,
      })
    }
    if (!catalogId) { unpriced(`unpriced:${section}:${label ?? lines.length}`, '—', label ?? `${section} item`, 'no-product'); return }
    const item = catalog.get(catalogId)
    if (!item) { missing += 1; unpriced(catalogId, '—', label ? `${label} (product not in catalog)` : '(product not in catalog)', 'product-missing'); return }
    if (!item.cost_rands || item.cost_rands <= 0) { unpriced(catalogId, item.sku, item.description || label || item.sku, 'no-cost'); return }
    const unitCostR = item.cost_rands
    const unitSellR = round2(unitCostR * markup)
    lines.push({
      section, catalogId, sku: item.sku, description: item.description, qty,
      unitCostR, unitSellR, lineCostR: round2(unitCostR * qty), lineSellR: round2(unitSellR * qty),
      approx: opts.approx, priced: true, status: 'ok',
    })
  }

  // Panels
  for (const g of design.panels) add('Panels', g.catalogId, g.panelCount, { label: g.panelModel || 'PV module' })

  // DC combiners
  for (const c of design.dcCombiners) {
    add('DC combiner', c.enclosureCatalogId, 1, { label: 'DC combiner enclosure' })
    for (const sid of c.inputStringIds) {
      const k = c.stringConnections[sid]
      if (!k) continue
      add('DC combiner', k.breakerId, 1, { label: 'String breaker' })
      add('DC combiner', k.fuseHolderId, 1, { label: 'Fuse holder' })
      add('DC combiner', k.fuseId, Math.max(1, k.fuseQty), { label: 'PV fuse' })
      add('DC combiner', k.isolatorId, 1, { label: 'DC isolator' })
    }
    for (const o of c.outputs) {
      add('DC combiner', o.spdId, 1, { label: 'DC SPD' })
      if (o.stringIds.length > 1) add('DC combiner', o.mainBreakerId, 1, { label: 'DC main breaker' })
    }
  }

  // Inverter
  for (const u of design.inverters) add('Inverter', u.catalogId, u.qty, { label: u.model || 'Inverter' })

  // Batteries + bank wiring
  const batteryCount = design.batteries.reduce((s, b) => s + b.qty, 0)
  for (const b of design.batteries) add('Batteries', b.catalogId, b.qty, { label: b.model || 'Battery module' })
  const bank = design.bank
  if (designBatteryKwh(design) > 0) {
    // Rough cable metres until measured routes exist: ~3m per battery lead + 6m feed.
    if (bank.cableProductId) add('Batteries', bank.cableProductId, Math.max(6, batteryCount * 3 + 6), { approx: true, label: 'Battery cable' })
    if (bank.perBatteryDisconnect) add('Batteries', bank.perBatteryDisconnectId, Math.max(1, batteryCount), { label: 'Battery disconnect' })
    if (bank.mainDisconnect) add('Batteries', bank.mainDisconnectId, 1, { label: 'Main DC disconnect' })
  }

  // AC board(s)
  for (const c of design.acCombiners) {
    add('AC board', c.enclosureCatalogId, 1, { label: 'AC board enclosure' })
    add('AC board', c.mainBreakerId, 1, { label: 'AC main breaker' })
    add('AC board', c.rccbId, 1, { label: 'RCCB / earth leakage' })
    add('AC board', c.spdId, 1, { label: 'AC SPD' })
  }

  // Extras
  for (const x of design.extras) add('Extras', x.productId, 1, { label: x.label })

  // Cabling — priced from the diagram's conductors, honouring per-cable overrides.
  // Conductor-metres = length × parallel runs × cores; cores follow the phase/circuit.
  const conductorCount = (data: CableEdgeData): number => {
    if (data.circuitType === 'earth') return 1
    if (data.circuitType === 'dc' || data.circuitType === 'battery') return 2
    return (data.conductors as Record<string, boolean> | undefined)?.l1 === true ? 5 : 3
  }
  const flow = designToFlow(design, { gridSupply: opts.gridSupply })
  for (const edge of flow.edges) {
    const data = edge.data as CableEdgeData | undefined
    if (!data || data.isDirect || data.circuitType === 'communication') continue
    const material = (data.cableType as string | undefined) ?? data.spec?.split(' ')[0] ?? 'CU'
    const cs = (data.crossSection as string | undefined) ?? data.spec?.match(/\d+mm²/)?.[0]
    if (!cs) continue
    // Measured route wins over the rough default length when segments are entered.
    const segs = (data.segments as Array<{ lengthM: number }> | undefined) ?? []
    const measured = segs.length > 0
    const lengthM = measured ? segs.reduce((s, x) => s + (Number(x.lengthM) || 0), 0) : (Number(data.lengthM) || 0)
    if (lengthM <= 0) continue
    const runs = Math.max(1, Math.round(Number((data as { runs?: number }).runs) || 1))
    const qtyM = Math.round(lengthM * runs * conductorCount(data))
    const desc = typeof edge.label === 'string' ? edge.label : `${material} ${cs}`
    const perM = cableCostPerMeter(material, cs)
    if (perM <= 0) {
      lines.push({
        section: 'Cabling', catalogId: `cable:${edge.id}`, sku: `${material} ${cs}`,
        description: desc, qty: qtyM, unitCostR: 0, unitSellR: 0, lineCostR: 0, lineSellR: 0,
        priced: false, status: 'no-cost',
      })
      continue
    }
    const unitSellR = round2(perM * markup)
    lines.push({
      section: 'Cabling', catalogId: `cable:${edge.id}`, sku: `${material} ${cs}`,
      description: desc, qty: qtyM, unitCostR: perM, unitSellR,
      lineCostR: round2(perM * qtyM), lineSellR: round2(unitSellR * qtyM),
      approx: !measured, priced: true, status: 'ok',
    })
  }

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
      needsPricing: sl.filter((l) => !l.priced).length,
    }
  })

  return {
    sections,
    totalCostR: round2(sections.reduce((s, x) => s + x.costR, 0)),
    totalSellR: round2(sections.reduce((s, x) => s + x.sellR, 0)),
    missing,
    needsPricing: lines.filter((l) => !l.priced).length,
  }
}
