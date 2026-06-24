// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Bill of materials + pricing from a SystemDesign.
//
// Walks the design (panels, combiners with their per-string/per-output products,
// inverter, batteries + bank wiring, AC board, extras) and produces priced line
// items. Pricing follows the house rule: sell = cost_rands × markup. Cable lengths
// are rough estimates until measured routes are wired in (flagged `approx`).
// ─────────────────────────────────────────────────────────────────────────────

import { cableCostPerMeter, terminationCost, heatShrinkCost, type EquipmentCatalogItem, type PricingSettings } from './quote-calculator'
import type { CableEdgeData } from './sld-builder'
import {
  designBatteryKwh, designToFlow, type SystemDesign,
} from './system-design'

// Defensive mirror of ProductPicker's custom sentinel (CUSTOM_PREFIX). A finished
// design should only carry real catalog ids (custom quick-adds become `pending`
// rows), but an older save or a failed insert may still hold a `custom:<label>`
// value — we never print the raw marker, we surface the label as a "Quote" line.
const CUSTOM_PREFIX = 'custom:'
const isCustomValue = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.startsWith(CUSTOM_PREFIX)
const customLabel = (v: string): string => v.slice(CUSTOM_PREFIX.length)

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
  opts: { gridSupply?: string; pricing?: PricingSettings } = {},
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
    // Stray custom placeholder (sentinel) — render its label, flag for pricing, and
    // never leak the raw `custom:` marker into the BOM.
    if (isCustomValue(catalogId)) { unpriced(`unpriced:${section}:${label ?? lines.length}`, '—', customLabel(catalogId) || label || `${section} item`, 'no-product'); return }
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

  // DC combiners — qualify each line with its combiner so the itemised view shows
  // which enclosure an occurrence lives in (consolidation later sums identical items).
  design.dcCombiners.forEach((c, ci) => {
    const where = design.dcCombiners.length > 1 ? ` — DC combiner ${ci + 1}` : ''
    add('DC combiner', c.enclosureCatalogId, 1, { label: `DC combiner enclosure${where}` })
    for (const sid of c.inputStringIds) {
      const k = c.stringConnections[sid]
      if (!k) continue
      add('DC combiner', k.breakerId, 1, { label: `String breaker${where}` })
      add('DC combiner', k.fuseHolderId, 1, { label: `Fuse holder${where}` })
      add('DC combiner', k.fuseId, Math.max(1, k.fuseQty), { label: `PV fuse${where}` })
      add('DC combiner', k.isolatorId, 1, { label: `DC isolator${where}` })
    }
    for (const o of c.outputs) {
      add('DC combiner', o.spdId, 1, { label: `DC SPD${where}` })
      if (o.stringIds.length > 1) add('DC combiner', o.mainBreakerId, 1, { label: `DC main breaker${where}` })
    }
  })

  // Inverter
  for (const u of design.inverters) add('Inverter', u.catalogId, u.qty, { label: u.model || 'Inverter' })

  // Batteries + bank wiring
  const batteryCount = design.batteries.reduce((s, b) => s + b.qty, 0)
  for (const b of design.batteries) add('Batteries', b.catalogId, b.qty, { label: b.model || 'Battery module' })
  const bank = design.bank
  if (designBatteryKwh(design) > 0) {
    // Rough cable metres until measured routes exist: ~3m per battery lead + 6m feed.
    // (Itemised bank cables in bank.cables[] are priced via the diagram's conductors below.)
    if (bank.cableProductId) add('Batteries', bank.cableProductId, Math.max(6, batteryCount * 3 + 6), { approx: true, label: 'Battery cable' })
    // Per-battery + main disconnect products (item 23): prefer the chosen product/type,
    // falling back to the legacy ids so old saved designs still price.
    const perBatProduct = bank.perBatteryDisconnectChoice?.product ?? bank.perBatteryDisconnectId
    const mainProduct = bank.mainDisconnectChoice?.product ?? bank.mainDisconnectId
    const perBatLabel = bank.perBatteryDisconnectChoice?.type ? `Battery disconnect (${bank.perBatteryDisconnectChoice.type})` : 'Battery disconnect'
    const mainLabel = bank.mainDisconnectChoice?.type ? `Main DC disconnect (${bank.mainDisconnectChoice.type})` : 'Main DC disconnect'
    if (bank.perBatteryDisconnect) add('Batteries', perBatProduct, Math.max(1, batteryCount), { label: perBatLabel })
    if (bank.mainDisconnect) add('Batteries', mainProduct, 1, { label: mainLabel })
    // Busbar fabrication (item 27) — only listed when a non-default bar is spec'd.
    if (bank.busbar && bank.busbarSpec) {
      const bs = bank.busbarSpec
      const dims = bs.lengthMm && bs.widthMm ? ` ${bs.widthMm}×${bs.lengthMm}mm` : ''
      const busLabel = `DC busbar${bs.material ? ` (${bs.material})` : ''}${dims}`.trim()
      add('Batteries', bs.product, 1, { label: busLabel })
    }
  }

  // AC board(s) — enclosure + every device on the inside, in wiring order.
  design.acCombiners.forEach((c, bi) => {
    const where = design.acCombiners.length > 1 ? ` — AC board ${bi + 1}` : ''
    add('AC board', c.enclosureCatalogId, 1, { label: `AC board enclosure${where}` })
    const components = c.components ?? []
    if (components.length > 0) {
      for (const comp of components) add('AC board', comp.productId, Math.max(1, comp.qty || 1), { label: `${comp.label}${where}` })
    } else {
      // Legacy boards saved before the component list (defensive — parseDesign normalizes).
      add('AC board', c.mainBreakerId, 1, { label: `AC main breaker${where}` })
      add('AC board', c.rccbId, 1, { label: `RCCB / earth leakage${where}` })
      add('AC board', c.spdId, 1, { label: `AC SPD${where}` })
    }
  })

  // Extras — the block itself plus any nested sub-components (item 31).
  for (const x of design.extras) {
    add('Extras', x.productId, 1, { label: x.label })
    for (const sc of x.components ?? []) {
      add('Extras', sc.product, Math.max(1, sc.qty || 1), { label: `${x.label} — ${sc.label || sc.kind}` })
    }
  }

  // Monitoring / comms hardware (item 26) — dongles, meters, gateways per inverter.
  for (const m of design.monitoring ?? []) {
    const label = `${m.label || 'Monitoring'}${m.commsType ? ` (${m.commsType})` : ''}${m.role === 'bundled' ? ' — bundled' : ''}`
    add('Monitoring', m.catalogId, 1, { label })
  }

  // Earthing hardware (rods + bars). No catalog product field yet → surfaced to quote.
  const earth = design.earthing
  const electrodeCount = earth.electrodes.length
    ? earth.electrodes.reduce((s, el) => s + Math.max(1, el.spikeCount || 1), 0)
    : (earth.spikeCount ?? 0)
  if (electrodeCount > 0) add('Earthing', earth.spikeProductId, electrodeCount, { label: 'Earth spike / rod' })
  for (const bar of earth.bars) add('Earthing', earth.barProductId, 1, { label: bar.label || 'Earth bar' })

  // Cabling — priced from the diagram's conductors, honouring per-cable overrides.
  // Conductor-metres = length × parallel runs × cores; cores follow the phase/circuit.
  const conductorCount = (data: CableEdgeData): number => {
    if (data.circuitType === 'earth') return 1
    if (data.circuitType === 'dc' || data.circuitType === 'battery') return 2
    return (data.conductors as Record<string, boolean> | undefined)?.l1 === true ? 5 : 3
  }
  // Consumables (terminations + heat shrink) accumulate across cables, then group.
  const consumables = new Map<string, { qty: number; unit: number }>()
  const addConsumable = (description: string, qty: number, unit: number) => {
    if (qty <= 0) return
    const c = consumables.get(description) ?? { qty: 0, unit }
    c.qty += qty
    c.unit = unit
    consumables.set(description, c)
  }

  const flow = designToFlow(design, { gridSupply: opts.gridSupply })
  for (const edge of flow.edges) {
    const data = edge.data as CableEdgeData | undefined
    if (!data || data.isDirect || data.circuitType === 'communication') continue
    const material = (data.cableType as string | undefined) ?? data.spec?.split(' ')[0] ?? 'CU'
    const cs = (data.crossSection as string | undefined) ?? data.spec?.match(/\d+mm²/)?.[0]
    if (!cs) continue
    const cores = conductorCount(data)
    const runs = Math.max(1, Math.round(Number((data as { runs?: number }).runs) || 1))

    // Terminations on each end + optional heat shrink, sized to the cable.
    let terminatedEnds = 0
    for (const term of [data.terminationFrom, data.terminationTo] as Array<{ type?: string; size?: string } | undefined>) {
      const ttype = term?.type
      if (!ttype || /direct/i.test(ttype)) continue
      terminatedEnds += 1
      const tsize = term?.size || cs
      const label = /lug|bootlace/i.test(ttype) ? `${ttype} ${tsize}` : ttype
      addConsumable(label, cores * runs, terminationCost(ttype, tsize))
    }
    if (data.heatShrink) {
      const ends = terminatedEnds > 0 ? terminatedEnds : 2
      addConsumable(`Heat shrink ${cs}`, cores * runs * ends, heatShrinkCost(cs))
    }

    // Measured route wins over the rough default length when segments are entered.
    const segs = (data.segments as Array<{ lengthM: number }> | undefined) ?? []
    const measured = segs.length > 0
    const lengthM = measured ? segs.reduce((s, x) => s + (Number(x.lengthM) || 0), 0) : (Number(data.lengthM) || 0)
    if (lengthM <= 0) continue
    const qtyM = Math.round(lengthM * runs * cores)
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

  // Consumables section — terminations + heat shrink grouped across all cables.
  for (const [description, c] of consumables) {
    if (c.unit <= 0) {
      lines.push({
        section: 'Consumables', catalogId: `consumable:${description}`, sku: '—',
        description, qty: c.qty, unitCostR: 0, unitSellR: 0, lineCostR: 0, lineSellR: 0,
        priced: false, status: 'no-cost',
      })
    } else {
      const unitSellR = round2(c.unit * markup)
      lines.push({
        section: 'Consumables', catalogId: `consumable:${description}`, sku: '—',
        description, qty: c.qty, unitCostR: c.unit, unitSellR,
        lineCostR: round2(c.unit * c.qty), lineSellR: round2(unitSellR * c.qty),
        approx: true, priced: true, status: 'ok',
      })
    }
  }

  // Labour (installation) from pricing settings — sell-only, no markup.
  const pricing = opts.pricing
  if (pricing) {
    const panelW = design.panels.reduce((s, g) => s + g.panelCount * g.panelWatts, 0)
    const invW = design.inverters.reduce((s, u) => s + u.kw * 1000 * u.qty, 0)
    const pushLabour = (description: string, amt: number) => {
      if (amt <= 0) return
      const r = round2(amt)
      lines.push({
        section: 'Labour', catalogId: `labour:${description}`, sku: '—', description, qty: 1,
        unitCostR: r, unitSellR: r, lineCostR: r, lineSellR: r, priced: true, status: 'ok',
      })
    }
    if (panelW > 0) pushLabour(`Panel install (${panelW} Wp)`, panelW * pricing.labourPanelPerW)
    if (invW > 0) pushLabour(`Inverter install (${+(invW / 1000).toFixed(1)} kW)`, invW * pricing.labourInverterPerW)
    if (panelW > 0 || invW > 0) {
      pushLabour('Certificate of Compliance (CoC)', pricing.cocRands)
      const storeys = Math.max(1, design.storeys ?? 1)
      if (storeys >= 3) pushLabour('Access premium (3-storey)', pricing.storeyPremium3)
      else if (storeys === 2) pushLabour('Access premium (2-storey)', pricing.storeyPremium2)
    }
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

// ── Consolidation ─────────────────────────────────────────────────────────────
// Itemised BOM = one line per occurrence per location (built above). The
// consolidated view SUMS identical items across the whole design into one line:
// the same catalog product reused in three combiners (2 each) becomes "order 6";
// equal cable colour+spec lengths add up (H07Z red 12m + 35m + 8m → 55m). Lines
// merge when they share an identity key — the catalog product for a real product,
// else the sku + a normalised description with the location qualifier stripped.

/** Strip a trailing "— DC combiner 1 / — AC board 2 / — <extra>" location tag. */
function stripLocation(description: string): string {
  return description.replace(/\s+—\s+.*$/, '').trim()
}

/** Stable identity for grouping identical items across the whole design. */
function consolidationKey(l: BomLine): string {
  // Drop the location qualifier and any "N× " run-count prefix so the same cable
  // colour+spec merges regardless of where it ran or how many parallel cores.
  const base = stripLocation(l.description).replace(/^\d+×\s+/, '')
  // A real catalog product is the same item wherever it appears.
  if (l.priced && l.status === 'ok' && !l.catalogId.startsWith('cable:') && !l.catalogId.startsWith('consumable:') && !l.catalogId.startsWith('labour:')) {
    return `prod:${l.catalogId}`
  }
  // Cables, consumables, labour and unpriced lines group on sku + base label.
  return `spec:${l.sku}|${base}|${l.status}`
}

/**
 * Collapse an itemised BOM into one line per identity, summing qty + line totals.
 * Preserves section + line order (first occurrence wins). Used by the BOM panel's
 * Consolidated view; the same DesignBom shape comes back, so renderers are shared.
 */
export function consolidateBom(bom: DesignBom): DesignBom {
  const sections: BomSection[] = bom.sections.map((section) => {
    const order: string[] = []
    const map = new Map<string, BomLine>()
    for (const l of section.lines) {
      const key = consolidationKey(l)
      const existing = map.get(key)
      if (!existing) {
        order.push(key)
        // Clone, dropping the per-location qualifier + "N× " run prefix from the
        // shown description (summed metres live in qty for the consolidated line).
        map.set(key, { ...l, description: stripLocation(l.description).replace(/^\d+×\s+/, '') })
      } else {
        existing.qty += l.qty
        existing.lineCostR = round2(existing.lineCostR + l.lineCostR)
        existing.lineSellR = round2(existing.lineSellR + l.lineSellR)
        existing.approx = existing.approx || l.approx
      }
    }
    const lines = order.map((k) => map.get(k)!)
    return {
      name: section.name, lines,
      costR: round2(lines.reduce((s, l) => s + l.lineCostR, 0)),
      sellR: round2(lines.reduce((s, l) => s + l.lineSellR, 0)),
      needsPricing: lines.filter((l) => !l.priced).length,
    }
  })
  return {
    sections,
    totalCostR: round2(sections.reduce((s, x) => s + x.costR, 0)),
    totalSellR: round2(sections.reduce((s, x) => s + x.sellR, 0)),
    missing: bom.missing,
    needsPricing: sections.reduce((s, x) => s + x.needsPricing, 0),
  }
}
