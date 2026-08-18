import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyScope, newScopeLine, importScopeAsPackage, type QuoteScope } from '../scope'
import { scopeToBom } from '../scope-bom'
import { buildScopeQuoteData } from '../scope-quote'
import { renderScopeQuote } from '../render-scope-quote'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * The two switchable/explanatory parts of the customer document:
 *   — "What You're Getting" is off when the quote says so (migration 121).
 *   — "Taking All of It, or Part of It" says what buying less actually means,
 *     and says the version that matches what the accept page can do.
 */

const CATALOG = new Map<string, EquipmentCatalogItem>([
  ['cat-db', {
    id: 'cat-db', sku: 'DB-3X15', description: 'DB 3x15 way surf',
    cost_rands: 900, category: 'distribution_board',
    primary_image_url: 'https://example.test/db.jpg',
  } as unknown as EquipmentCatalogItem],
  ['cat-brk', {
    id: 'cat-brk', sku: '480187', description: 'CHINT 63A 2P breaker',
    cost_rands: 120, category: 'distribution_board',
    primary_image_url: 'https://example.test/breaker.jpg',
  } as unknown as EquipmentCatalogItem],
])

function boardScope(): QuoteScope {
  const s = emptyScope({ sections: ['Distribution board', 'Wiring'] })
  s.summary = 'Replace the main board'
  s.lines = [
    { ...newScopeLine('Distribution board', 'material'), description: 'DB 3x15 way surf', qty: 1, catalogId: 'cat-db', unitCostR: 900 },
    { ...newScopeLine('Distribution board', 'material'), description: 'CHINT 63A 2P breaker', qty: 2, catalogId: 'cat-brk', unitCostR: 120 },
    { ...newScopeLine('Wiring', 'material'), description: 'Surfix 2.5mm', qty: 30, unitSellR: 22 },
  ]
  return s
}

function documentFor(scope: QuoteScope, showEquipmentPhotos?: boolean) {
  const bom = scopeToBom(scope, CATALOG, 1.15)
  return buildScopeQuoteData({
    scope, bom, catalog: CATALOG,
    req: { customer_name: 'Chris' },
    quoteNumber: 'QUO-2026-121',
    expiryDays: 14,
    workType: 'electrical',
    workTypeLabel: 'Electrical work',
    showEquipmentPhotos,
  })
}

test('product photos are on by default and gone when the quote turns them off', () => {
  const on = documentFor(boardScope())
  assert.ok(on.equipmentPhotos!.length > 0, 'catalog-backed lines should produce photos')
  assert.match(renderScopeQuote(on), /What You&rsquo;re Getting/)

  const off = documentFor(boardScope(), false)
  assert.equal(off.equipmentPhotos!.length, 0)
  const html = renderScopeQuote(off)
  assert.doesNotMatch(html, /What You&rsquo;re Getting/)
  assert.doesNotMatch(html, /example\.test/, 'no product image should survive the switch')
})

test('a multi-section quote explains that sections can be dropped, and re-priced', () => {
  const html = renderScopeQuote(documentFor(boardScope()))
  assert.match(html, /Taking All of It, or Part of It/)
  assert.match(html, /re-issue this quote with only those/)
  // Never imply the subtotals simply subtract.
  assert.match(html, /doesn&rsquo;t simply subtract/)
})

test('a combined quote points at the per-package choice the accept page really offers', () => {
  const a = boardScope()
  const b = emptyScope({ sections: ['Lights'] })
  b.summary = 'Replace the downlights'
  b.lines = [{ ...newScopeLine('Lights', 'material'), description: 'LED downlight', qty: 8, unitSellR: 180 }]
  const { scope } = importScopeAsPackage(a, b, { label: 'Downlights', existingLabel: 'Board' })

  const html = renderScopeQuote(documentFor(scope))
  assert.match(html, /Taking All of It, or Part of It/)
  assert.match(html, /Or just one part/)
  assert.match(html, /Or a different combination/)
  assert.doesNotMatch(html, /Or only some of it/, 'the sections-only wording is for quotes without packages')
})

test('nothing to choose between prints no choice section', () => {
  const s = emptyScope({ sections: ['Callout'] })
  s.summary = 'Fault find'
  s.lines = [{ ...newScopeLine('Callout', 'material'), description: 'Callout', qty: 1, unitSellR: 850 }]
  assert.doesNotMatch(renderScopeQuote(documentFor(s)), /Taking All of It/)
})
