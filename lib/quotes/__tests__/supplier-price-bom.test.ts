// Run with: npx tsx --test lib/quotes/__tests__/supplier-price-bom.test.ts
//
// A price applied off a supplier's quote (W100) is only worth anything if it
// survives the trip to the customer document. Both engines re-read costs from
// the catalog when a quote is generated — that is the behaviour these tests
// pin against: the override wins there, and nothing else about the quote moves.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { EquipmentCatalogItem } from '../../solar/quote-calculator'
import { designToBom } from '../../solar/design-bom'
import { emptyDesign, type SystemDesign } from '../../solar/system-design'
import { emptyScope, newScopeLine, parseScope, type QuoteScope } from '../scope'
import { scopeToBom } from '../scope-bom'
import { catalogKey, skuKey, type SupplierPriceMap } from '../supplier-price-match'

const MARKUP = 1.15

function catItem(id: string, extra: Partial<EquipmentCatalogItem> = {}): EquipmentCatalogItem {
  return {
    id, category: 'other', brand: 'Test', sku: `SKU-${id}`, description: `Item ${id}`,
    watts_ac: null, watts_dc: null, kwh: null, phase: 'any', cost_rands: 100,
    isc_amps: null, voc_volts: null, active: true, sort_order: 0, notes: null, ...extra,
  }
}

function override(unitCostR: number, sku: string) {
  return {
    unitCostR, unitPriceExVatR: unitCostR / 1.15, previousUnitCostR: 100, sku,
    supplier: 'Key', reference: 'QU-1', supplierQuoteId: 'sq1', lineId: 'l1',
    tier: 'catalog' as const, appliedAt: '2026-08-20T00:00:00Z',
  }
}

function scopeWith(prices: SupplierPriceMap): QuoteScope {
  const scope = emptyScope({ sections: ['Materials'] })
  scope.lines = [
    { ...newScopeLine('Materials'), catalogId: 'db1', sku: 'SKU-db1', qty: 2 },
    { ...newScopeLine('Materials'), sku: 'FREE-1', description: 'Gland kit', qty: 3, unitCostR: 100, unitSellR: 115 },
  ]
  scope.supplierPrices = prices
  return scope
}

const catalog = new Map<string, EquipmentCatalogItem>([['db1', catItem('db1', { cost_rands: 200 })]])

test('scope engine: the applied price beats the catalog cost at generate', () => {
  const bom = scopeToBom(scopeWith({ [catalogKey('db1')]: override(150, 'SKU-db1') }), catalog, MARKUP)
  const line = bom.sections[0].lines[0]
  assert.equal(line.unitCostR, 150)
  assert.equal(line.unitSellR, 172.5)
  assert.equal(line.lineCostR, 300)
})

test('scope engine: a free-text line is priced by its SKU', () => {
  const bom = scopeToBom(scopeWith({ [skuKey('free-1')]: override(60, 'FREE-1') }), catalog, MARKUP)
  const free = bom.sections[0].lines[1]
  assert.equal(free.unitCostR, 60)
  assert.equal(free.unitSellR, 69)
  // The catalog line beside it is untouched.
  assert.equal(bom.sections[0].lines[0].unitCostR, 200)
})

test('scope engine: a hand-set sell price still wins over the markup', () => {
  const scope = scopeWith({ [catalogKey('db1')]: override(150, 'SKU-db1') })
  scope.lines[0] = { ...scope.lines[0], sellOverridden: true, unitSellR: 400 }
  const line = scopeToBom(scope, catalog, MARKUP).sections[0].lines[0]
  assert.equal(line.unitCostR, 150)
  assert.equal(line.unitSellR, 400)
})

test('scope engine: no applied prices prices exactly as before', () => {
  const line = scopeToBom(scopeWith({}), catalog, MARKUP).sections[0].lines[0]
  assert.equal(line.unitCostR, 200)
  assert.equal(line.unitSellR, 230)
})

test('the map survives a save/parse round trip', () => {
  const scope = scopeWith({ [catalogKey('db1')]: override(150, 'SKU-db1') })
  const reparsed = parseScope(JSON.parse(JSON.stringify(scope)))
  assert.ok(reparsed)
  assert.equal(reparsed.supplierPrices?.[catalogKey('db1')].unitCostR, 150)
  assert.equal(scopeToBom(reparsed, catalog, MARKUP).sections[0].lines[0].unitCostR, 150)
})

test('solar engine: the applied price beats the catalog cost too', () => {
  const design: SystemDesign = {
    ...emptyDesign(),
    panels: [{
      id: 'g1', label: 'Roof', catalogId: 'panel1', panelCount: 4, strings: 1,
      panelWatts: 500, panelModel: 'Test 500W', azimuth: 0, pitch: 15, roofType: 'Tile',
    }],
    supplierPrices: { [catalogKey('panel1')]: override(1500, 'SKU-panel1') },
  }
  const withPanel = new Map(catalog)
  withPanel.set('panel1', catItem('panel1', { category: 'panel', cost_rands: 2000, watts_dc: 500 }))

  const bom = designToBom(design, withPanel, MARKUP)
  const panelLine = bom.sections.flatMap((s) => s.lines).find((l) => l.catalogId === 'panel1')
  assert.ok(panelLine)
  assert.equal(panelLine.unitCostR, 1500)
  assert.equal(panelLine.unitSellR, 1725)
  assert.equal(panelLine.qty, 4)
})
