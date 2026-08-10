// Run with: npx tsx --test lib/solar/__tests__/design-bom.test.ts
//
// Covers the Quotes-v2 pricing path — what customers are actually quoted from
// now. Previously untested end to end: designToBom (pricing + unpriced lines),
// consolidateBom (must never change the money), computeDeposit (line items, not
// a flat %), and bomToSupplierBom (what gets frozen into job materials).
import test from 'node:test'
import assert from 'node:assert/strict'
import { designToBom, consolidateBom, type DesignBom } from '../design-bom'
import { computeDeposit, bomToSupplierBom } from '../design-quote'
import { emptyDesign, type SystemDesign, type PanelGroup, type DcCombiner } from '../system-design'
import type { EquipmentCatalogItem } from '../quote-calculator'

const MARKUP = 1.35

function catalogItem(over: Partial<EquipmentCatalogItem> & { id: string }): EquipmentCatalogItem {
  return {
    category: 'other', brand: 'Test', sku: over.id.toUpperCase(), description: `Item ${over.id}`,
    watts_ac: null, watts_dc: null, kwh: null, phase: 'any', cost_rands: 100,
    isc_amps: null, voc_volts: null, active: true, sort_order: 0, notes: null,
    ...over,
  } as EquipmentCatalogItem
}

function panelGroup(over: Partial<PanelGroup> = {}): PanelGroup {
  return {
    id: 'pg1', label: 'Roof A', panelCount: 10, strings: 1, panelWatts: 500,
    panelModel: 'Test 500W', catalogId: 'panel', azimuth: 0, pitch: 15, roofType: 'Tile',
    ...over,
  } as PanelGroup
}

/** A DC combiner holding one component, so the same product can appear twice. */
function combiner(id: string, productId: string, qty = 1): DcCombiner {
  return {
    id, label: id, material: 'steel', mount: 'surface', ways: 12, rows: 1, ipRating: 'IP65',
    productCode: id, productCodeLocked: false, enclosureCatalogId: null,
    inputStringIds: [], outputs: [], stringConnections: {},
    components: [{ productId, qty, label: 'DC breaker' }],
  } as unknown as DcCombiner
}

function baseCatalog(): Map<string, EquipmentCatalogItem> {
  return new Map([
    ['panel', catalogItem({ id: 'panel', sku: 'PANEL-500', description: 'Test 500W panel', cost_rands: 1000, watts_dc: 500 })],
    ['inv', catalogItem({ id: 'inv', sku: 'INV-8K', description: '8kW inverter', cost_rands: 20000, watts_ac: 8000 })],
    ['bat', catalogItem({ id: 'bat', sku: 'BAT-10', description: '10kWh battery', cost_rands: 30000, kwh: 10 })],
    ['brk', catalogItem({ id: 'brk', sku: 'DC-BRK', description: 'DC breaker', cost_rands: 200 })],
  ])
}

function designWith(over: Partial<SystemDesign> = {}): SystemDesign {
  return { ...emptyDesign(), ...over }
}

/** Sum every line in the BOM — used to prove section/grand totals are consistent. */
function sumLines(bom: DesignBom) {
  let cost = 0, sell = 0
  for (const s of bom.sections) for (const l of s.lines) { cost += l.lineCostR; sell += l.lineSellR }
  return { cost: Math.round(cost * 100) / 100, sell: Math.round(sell * 100) / 100 }
}

test('designToBom prices sell = cost x markup and totals stay internally consistent', () => {
  const design = designWith({
    panels: [panelGroup({ panelCount: 10, strings: 1 })],
    inverters: [{ id: 'i1', catalogId: 'inv', model: '8kW', kw: 8, qty: 1, phases: 1 }],
  } as Partial<SystemDesign>)

  const bom = designToBom(design, baseCatalog(), MARKUP)

  const panelLine = bom.sections.flatMap((s) => s.lines).find((l) => l.catalogId === 'panel')
  assert.ok(panelLine, 'panel line should be present')
  assert.equal(panelLine.qty, 10)
  assert.equal(panelLine.unitCostR, 1000)
  assert.equal(panelLine.unitSellR, 1350) // 1000 x 1.35
  assert.equal(panelLine.lineCostR, 10000)
  assert.equal(panelLine.lineSellR, 13500)
  assert.equal(panelLine.priced, true)
  assert.equal(panelLine.status, 'ok')

  // Grand totals must equal the sum of every line — no section double-count or drop.
  const summed = sumLines(bom)
  assert.equal(bom.totalCostR, summed.cost)
  assert.equal(bom.totalSellR, summed.sell)
  // And sell must be strictly above cost once anything is priced (margin preserved).
  assert.ok(bom.totalSellR > bom.totalCostR, 'sell total should exceed cost total')
})

test('designToBom flags unpriced lines instead of silently pricing them at zero', () => {
  const catalog = baseCatalog()
  catalog.set('nocost', catalogItem({ id: 'nocost', sku: 'NC', description: 'Uncosted', cost_rands: 0 }))

  const design = designWith({
    // 'ghost' is not in the catalog at all; 'nocost' exists but has no cost yet.
    panels: [panelGroup({ id: 'pg1', catalogId: 'ghost' }), panelGroup({ id: 'pg2', catalogId: 'nocost' })],
  } as Partial<SystemDesign>)

  const bom = designToBom(design, catalog, MARKUP)
  const lines = bom.sections.flatMap((s) => s.lines)

  const ghost = lines.find((l) => l.status === 'product-missing')
  assert.ok(ghost, 'a catalog id absent from the catalog should be surfaced')
  assert.equal(ghost.priced, false)
  assert.equal(ghost.lineSellR, 0)

  const nocost = lines.find((l) => l.status === 'no-cost')
  assert.ok(nocost, 'a product with no cost should be surfaced, not treated as free')
  assert.equal(nocost.priced, false)

  assert.equal(bom.missing, 1, 'only the truly absent product counts as missing')
  assert.ok(bom.needsPricing >= 2, 'both unpriced lines must be counted as needing pricing')

  // Critically: EVERY unpriced line must contribute exactly zero money, so an
  // unpriced item can never quietly inflate or discount the quote. (The BOM still
  // has priced derived lines — mounting, cable, labour — so the grand total is
  // legitimately non-zero here; what matters is that unpriced lines carry no value
  // and are reported via needsPricing.)
  for (const l of lines.filter((x) => !x.priced)) {
    assert.equal(l.lineCostR, 0, `unpriced line "${l.description}" carried a cost`)
    assert.equal(l.lineSellR, 0, `unpriced line "${l.description}" carried a sell value`)
    assert.equal(l.unitSellR, 0)
  }
})

test('consolidateBom merges repeated products without changing the money', () => {
  // Same DC breaker product used in two separate combiners — the consolidated
  // view must show one line of qty 2, with identical totals.
  const design = designWith({
    dcCombiners: [combiner('c1', 'brk', 1), combiner('c2', 'brk', 1)],
  } as Partial<SystemDesign>)

  const bom = designToBom(design, baseCatalog(), MARKUP)
  const consolidated = consolidateBom(bom)

  // Money is an invariant across consolidation — this is the important guarantee.
  assert.equal(consolidated.totalCostR, bom.totalCostR)
  assert.equal(consolidated.totalSellR, bom.totalSellR)

  const merged = consolidated.sections.flatMap((s) => s.lines).filter((l) => l.catalogId === 'brk')
  assert.equal(merged.length, 1, 'the same product in two combiners should merge to one line')
  assert.equal(merged[0].qty, 2, 'quantities should sum')
  assert.equal(merged[0].lineCostR, 400)  // 200 x 2
  assert.equal(merged[0].lineSellR, 540)  // 270 x 2
  // The location qualifier ("— DC combiner 1") must not leak into the merged label.
  assert.ok(!merged[0].description.includes('—'), `location tag leaked: ${merged[0].description}`)
})

test('computeDeposit bills the starred equipment sections, not a flat percentage', () => {
  const design = designWith({
    panels: [panelGroup({ panelCount: 10 })],
    inverters: [{ id: 'i1', catalogId: 'inv', model: '8kW', kw: 8, qty: 1, phases: 1 }],
    batteries: [{ id: 'b1', catalogId: 'bat', model: '10kWh', kwh: 10, qty: 2 }],
  } as Partial<SystemDesign>)

  const bom = designToBom(design, baseCatalog(), MARKUP)
  const { items, totalR } = computeDeposit(bom)

  const names = items.map((i) => i.name)
  assert.ok(names.includes('Panels'), 'panels are a deposit item')
  assert.ok(names.includes('Inverter'), 'inverter is a deposit item')
  assert.ok(names.includes('Batteries'), 'batteries are a deposit item')

  // The deposit total is exactly the sum of its line items.
  const summed = Math.round(items.reduce((t, i) => t + i.amountRands, 0) * 100) / 100
  assert.equal(totalR, summed)

  // Each deposit item matches its BOM section sell total (no markup applied twice).
  for (const item of items) {
    const section = bom.sections.find((s) => s.name === item.name)
    assert.ok(section, `section ${item.name} should exist in the BOM`)
    assert.equal(item.amountRands, Math.round(section.sellR * 100) / 100)
  }

  // A deposit can never exceed the quote total.
  assert.ok(totalR <= bom.totalSellR, `deposit ${totalR} exceeded quote total ${bom.totalSellR}`)
})

test('computeDeposit returns nothing when no starred equipment is priced', () => {
  const bom = designToBom(designWith(), baseCatalog(), MARKUP)
  const { items, totalR } = computeDeposit(bom)
  assert.deepEqual(items, [])
  assert.equal(totalR, 0)
})

test('bomToSupplierBom preserves every line and its money for the job-materials snapshot', () => {
  const design = designWith({
    panels: [panelGroup({ panelCount: 10 })],
    inverters: [{ id: 'i1', catalogId: 'inv', model: '8kW', kw: 8, qty: 1, phases: 1 }],
  } as Partial<SystemDesign>)

  const bom = designToBom(design, baseCatalog(), MARKUP)
  const supplier = bomToSupplierBom(bom)

  const lineCount = bom.sections.reduce((n, s) => n + s.lines.length, 0)
  assert.equal(supplier.length, lineCount, 'no line may be dropped on the way to job materials')

  const sellTotal = Math.round(supplier.reduce((t, i) => t + i.lineSellRands, 0) * 100) / 100
  assert.equal(sellTotal, bom.totalSellR, 'flattening must not change the total')

  // Section names carry through — procurement groups by them.
  assert.ok(supplier.every((i) => typeof i.section === 'string' && i.section.length > 0))
})
