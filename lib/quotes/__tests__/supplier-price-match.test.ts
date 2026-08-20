import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RfqCandidate } from '../supplier-rfq'
import type { SupplierQuoteLineRow } from '../supplier-quotes'
import {
  applySupplierPrices,
  clearSupplierPrices,
  lookupSupplierPrice,
  matchSupplierQuote,
  parseSupplierPrices,
} from '../supplier-price-match'

function candidate(over: Partial<RfqCandidate> = {}): RfqCandidate {
  return {
    section: 'Distribution board', sku: 'EX9BT3G', description: '3-pole breaker',
    qty: 4, unit: 'ea', catalogId: null, needsCode: false,
    unpriced: false, stale: false, priceAgeDays: 10, ...over,
  }
}

function supplierLine(over: Partial<SupplierQuoteLineRow> = {}): SupplierQuoteLineRow {
  return {
    id: 'l1', supplier_quote_id: 'sq1', line_no: 1, sku: 'EX9BT3G',
    description: 'EX9BT 3P breaker', qty: 4, unit: 'ea', unit_price_r: 100,
    catalog_id: null, created_at: '', ...over,
  }
}

const cost = () => 200

test('matches on the catalog id the parser already resolved', () => {
  const report = matchSupplierQuote(
    [candidate({ catalogId: 'cat-1', sku: 'OURS-1' })],
    [supplierLine({ sku: 'THEIRS-1', catalog_id: 'cat-1' })],
    cost,
  )
  assert.equal(report.matches.length, 1)
  assert.equal(report.matches[0].tier, 'catalog')
  assert.equal(report.matches[0].key, 'cat:cat-1')
  // Landed cost is the supplier's ex-VAT rate x 1.15.
  assert.equal(report.matches[0].newUnitCostR, 115)
  assert.equal(report.unmatched.length, 0)
  assert.equal(report.unused.length, 0)
})

test('matches on the same SKU regardless of case and outer space', () => {
  const report = matchSupplierQuote(
    [candidate({ sku: ' ex9bt3g ' })],
    [supplierLine({ sku: 'EX9BT3G' })],
    cost,
  )
  assert.equal(report.matches.length, 1)
  assert.equal(report.matches[0].tier, 'exact')
  assert.equal(report.matches[0].key, 'sku:EX9BT3G')
})

test('falls back to a near match when only separators differ', () => {
  const report = matchSupplierQuote(
    [candidate({ sku: 'EX9BT-3G' })],
    [supplierLine({ sku: 'EX9BT3G' })],
    cost,
  )
  assert.equal(report.matches[0].tier, 'loose')
})

test('never matches two part numbers that differ by a decimal', () => {
  // 2.5mm² and 25mm² are different cable — a normaliser that eats the dot
  // would price the wrong one, silently.
  const report = matchSupplierQuote(
    [candidate({ sku: 'CAB-2.5' })],
    [supplierLine({ sku: 'CAB-25' })],
    cost,
  )
  assert.equal(report.matches.length, 0)
  assert.equal(report.unmatched.length, 1)
  assert.equal(report.unused.length, 1)
})

test('reports what the document does not price and what the quote does not use', () => {
  const report = matchSupplierQuote(
    [candidate({ sku: 'A' }), candidate({ sku: 'B', description: 'Not quoted' })],
    [supplierLine({ id: 'l1', sku: 'A' }), supplierLine({ id: 'l2', sku: 'Z', line_no: 2 })],
    cost,
  )
  assert.deepEqual(report.matches.map((m) => m.sku), ['A'])
  assert.deepEqual(report.unmatched.map((u) => u.sku), ['B'])
  assert.deepEqual(report.unused.map((u) => u.sku), ['Z'])
})

test('an unpriced supplier line is not a match', () => {
  const report = matchSupplierQuote(
    [candidate({ sku: 'A' })],
    [supplierLine({ sku: 'A', unit_price_r: 0 })],
    cost,
  )
  assert.equal(report.matches.length, 0)
  assert.equal(report.unmatched.length, 1)
})

test('the same price applied twice is flagged unchanged', () => {
  const first = matchSupplierQuote([candidate({ sku: 'A' })], [supplierLine({ sku: 'A' })], cost)
  const map = applySupplierPrices({}, first.matches, {
    supplierQuoteId: 'sq1', supplier: 'Key', reference: 'QU-1', now: '2026-08-20T00:00:00Z',
  })
  const again = matchSupplierQuote(
    [candidate({ sku: 'A' })], [supplierLine({ sku: 'A' })], () => 115, map,
  )
  assert.equal(again.matches[0].unchanged, true)
})

test('the cost before the first apply is remembered, and a second apply keeps it', () => {
  const first = matchSupplierQuote([candidate({ sku: 'A' })], [supplierLine({ sku: 'A' })], () => 200)
  const once = applySupplierPrices({}, first.matches, {
    supplierQuoteId: 'sq1', supplier: 'Key', reference: null, now: 'now',
  })
  assert.equal(once['sku:A'].previousUnitCostR, 200)
  // The second document sees the FIRST document's price as "current" — the
  // original catalog cost must survive that, or undo restores the wrong number.
  const second = matchSupplierQuote([candidate({ sku: 'A' })], [supplierLine({ sku: 'A', unit_price_r: 50 })], () => 115, once)
  const twice = applySupplierPrices(once, second.matches, {
    supplierQuoteId: 'sq2', supplier: 'ACDC', reference: null, now: 'now',
  })
  assert.equal(twice['sku:A'].previousUnitCostR, 200)
})

test('applying stamps the source, and clearing takes back only that document', () => {
  const mine = matchSupplierQuote([candidate({ sku: 'A' })], [supplierLine({ sku: 'A' })], cost)
  let map = applySupplierPrices({}, mine.matches, {
    supplierQuoteId: 'sq1', supplier: 'Key', reference: 'QU-1', now: 'now',
  })
  const other = matchSupplierQuote(
    [candidate({ sku: 'B' })], [supplierLine({ id: 'l9', sku: 'B', unit_price_r: 50 })], cost,
  )
  map = applySupplierPrices(map, other.matches, {
    supplierQuoteId: 'sq2', supplier: 'ACDC', reference: null, now: 'now',
  })
  assert.equal(Object.keys(map).length, 2)
  assert.equal(map['sku:A'].supplier, 'Key')

  const left = clearSupplierPrices(map, 'sq1')
  assert.deepEqual(Object.keys(left), ['sku:B'])
})

test('lookup prefers the catalog key over the SKU key', () => {
  const map = {
    'cat:cat-1': {
      unitCostR: 10, unitPriceExVatR: 8.7, previousUnitCostR: 12, sku: 'A', supplier: 'Key', reference: null,
      supplierQuoteId: 'sq1', lineId: 'l1', tier: 'catalog' as const, appliedAt: '',
    },
    'sku:A': {
      unitCostR: 99, unitPriceExVatR: 86, previousUnitCostR: 100, sku: 'A', supplier: 'Key', reference: null,
      supplierQuoteId: 'sq1', lineId: 'l2', tier: 'exact' as const, appliedAt: '',
    },
  }
  assert.equal(lookupSupplierPrice(map, 'cat-1', 'A')?.unitCostR, 10)
  assert.equal(lookupSupplierPrice(map, null, 'a')?.unitCostR, 99)
  assert.equal(lookupSupplierPrice(map, 'cat-9', 'nope'), null)
  assert.equal(lookupSupplierPrice(undefined, 'cat-1', 'A'), null)
})

test('a persisted map survives junk without poisoning the quote', () => {
  const parsed = parseSupplierPrices({
    'sku:A': { unitCostR: 115, sku: 'A', supplierQuoteId: 'sq1', lineId: 'l1', tier: 'exact' },
    'sku:B': { unitCostR: 'nonsense' },
    'sku:C': null,
    'sku:D': { unitCostR: 0 },
  })
  assert.deepEqual(Object.keys(parsed), ['sku:A'])
  assert.equal(parsed['sku:A'].unitPriceExVatR, 0)
  assert.equal(parsed['sku:A'].previousUnitCostR, 0)
  assert.equal(parseSupplierPrices(undefined)['sku:A'], undefined)
})
