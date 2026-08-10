import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildBestPriceReport, offersBySku, type OfferRow } from '../best-price'

function row(sku: string, supplier: string, cost: number, inStock: boolean | null = null): OfferRow {
  return {
    supplier, supplier_sku: null, cost_rands: cost, in_stock: inStock,
    stock_note: null, source_url: null, updated_at: null,
    equipment_catalog: { sku },
  }
}

test('offers group by SKU, cheapest first', () => {
  const map = offersBySku([
    row('INV-8K', 'Existing list', 21000),
    row('INV-8K', 'Key Electric', 18500),
    row('BAT-5K', 'Key Electric', 9900),
  ])
  assert.deepEqual([...map.keys()].sort(), ['BAT-5K', 'INV-8K'])
  assert.equal(map.get('INV-8K')![0].supplier, 'Key Electric')
  assert.equal(map.get('INV-8K')![0].costRands, 18500)
})

test('PostgREST embedding the catalog row as a 1-array still resolves the SKU', () => {
  const asArray: OfferRow = { ...row('INV-8K', 'Key Electric', 1), equipment_catalog: [{ sku: 'INV-8K' }] }
  assert.ok(offersBySku([asArray]).has('INV-8K'))
})

test('an in-stock offer wins a tie against one of unknown/no stock', () => {
  const map = offersBySku([
    row('X', 'Slow supplier', 100, null),
    row('X', 'Has it', 100, true),
  ])
  assert.equal(map.get('X')![0].supplier, 'Has it')
})

test('an out-of-stock cheapest offer is listed but not chosen', () => {
  const map = offersBySku([
    row('X', 'Cheap but empty', 80, false),
    row('X', 'In stock', 95, true),
  ])
  const report = buildBestPriceReport([{ sku: 'X', description: 'X', qty: 1, unitCostCents: 10000 }], map)
  assert.equal(report.lines[0].offers.length, 2)
  assert.equal(report.lines[0].cheapest!.supplier, 'In stock')
})

test('the report totals the current plan against buying each line cheapest', () => {
  const map = offersBySku([
    row('INV-8K', 'Existing list', 21000),
    row('INV-8K', 'Key Electric', 18500),
    row('BAT-5K', 'Key Electric', 9900),
  ])
  const report = buildBestPriceReport([
    { sku: 'INV-8K', description: 'Inverter 8kW', qty: 1, unitCostCents: 21000_00 },
    { sku: 'BAT-5K', description: 'Battery 5kWh', qty: 2, unitCostCents: 10500_00 },
  ], map)

  assert.equal(report.currentTotalR, 21000 + 2 * 10500)
  assert.equal(report.optimisedTotalR, 18500 + 2 * 9900)
  assert.equal(report.savingR, 21000 + 21000 - (18500 + 19800))
  assert.equal(report.savingR, 3700)
})

test('a line with no offer is reported unmatched and never inflates the saving', () => {
  const report = buildBestPriceReport([
    { sku: 'MYSTERY', description: 'Odd part', qty: 3, unitCostCents: 500_00 },
  ], offersBySku([]))
  assert.equal(report.unmatched.length, 1)
  assert.equal(report.savingR, 0)
  // Still has to be bought, so it stays in the current total.
  assert.equal(report.currentTotalR, 1500)
  assert.equal(report.optimisedTotalR, 1500)
})

test('a line already at the best price adds no basket — no PO gets split for R0', () => {
  const map = offersBySku([row('X', 'Key Electric', 100)])
  const report = buildBestPriceReport([{ sku: 'X', description: 'X', qty: 1, unitCostCents: 100_00 }], map)
  assert.equal(report.savingR, 0)
  assert.equal(report.baskets.length, 0)
})

test('baskets group the lines each supplier wins, biggest spend first', () => {
  const map = offersBySku([
    row('A', 'Alpha', 100), row('A', 'Beta', 500),
    row('B', 'Beta', 40), row('B', 'Alpha', 90),
    row('C', 'Alpha', 1000), row('C', 'Beta', 4000),
  ])
  const report = buildBestPriceReport([
    { sku: 'A', description: 'A', qty: 1, unitCostCents: 500_00 },
    { sku: 'B', description: 'B', qty: 1, unitCostCents: 90_00 },
    { sku: 'C', description: 'C', qty: 1, unitCostCents: 4000_00 },
  ], map)

  assert.equal(report.baskets.length, 2)
  assert.equal(report.baskets[0].supplier, 'Alpha')
  assert.deepEqual(report.baskets[0].skus.sort(), ['A', 'C'])
  assert.equal(report.baskets[0].totalCostR, 1100)
  assert.equal(report.baskets[1].supplier, 'Beta')
  assert.deepEqual(report.baskets[1].skus, ['B'])
})

test('a line with no SKU is carried at its booked cost, not dropped', () => {
  const report = buildBestPriceReport([
    { sku: null, description: 'Labour', qty: 1, unitCostCents: 2500_00 },
  ], offersBySku([]))
  assert.equal(report.lines.length, 1)
  assert.equal(report.currentTotalR, 2500)
})
