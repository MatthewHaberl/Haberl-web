import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyScope, newScopeLine, type QuoteScope } from '../scope'
import { scopeToBom } from '../scope-bom'
import { buildScopeQuoteData } from '../scope-quote'
import { renderScopeQuote } from '../render-scope-quote'
import { reissueWithCredits } from '../build-quote-document'
import type { QuoteCredit } from '../credits'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * A credit is only real once it reaches the page the customer reads and the two
 * figures the rest of the system spends. These tests walk the whole path —
 * scope → BOM → document data → HTML → reissue — because every one of those
 * hops has its own total and any of them could quietly keep the old one.
 */

const CATALOG = new Map<string, EquipmentCatalogItem>()

/**
 * Materials + labour, because the two are what a credit has to choose between:
 * materials are the deposit, labour is the balance. A fixture that was all
 * materials would have every credit landing on the deposit by accident and
 * prove nothing about which one it MEANT to hit.
 */
function scopeWith(materialsR: number, labourR = 4_000): QuoteScope {
  const scope = emptyScope({ sections: ['Materials'], calloutR: 0 })
  scope.summary = 'Replace the distribution board.'
  const line = newScopeLine('Materials')
  line.description = 'Distribution board'
  line.qty = 1
  line.unitSellR = materialsR
  line.unitCostR = materialsR / 2
  scope.lines = [line]
  scope.labour = { ...scope.labour, mode: 'fixed', fixedBasis: 'amount', fixedR: labourR }
  return scope
}

function build(scope: QuoteScope, credits: QuoteCredit[]) {
  const bom = scopeToBom(scope, CATALOG, 1.15)
  return buildScopeQuoteData({
    scope, bom, catalog: CATALOG,
    req: { customer_name: 'Test' },
    quoteNumber: 'QUO-TEST-001',
    expiryDays: 30,
    workType: 'electrical',
    workTypeLabel: 'Electrical',
    credits,
  })
}

function credit(over: Partial<QuoteCredit> = {}): QuoteCredit {
  return { id: 'c1', kind: 'credit', label: 'Credit', amountR: 1000, note: null, createdAt: null, ...over }
}

test('a quote with no credits carries no credit fields and no credit wording', () => {
  const data = build(scopeWith(10_000), [])
  assert.equal(data.credits, undefined)
  assert.equal(data.payableTotal, undefined)
  const html = renderScopeQuote(data)
  assert.ok(!html.includes('Total payable'))
  assert.ok(!html.includes('<tr class="credit-row"'))
  // The document it has always been: deposit required, quote total at the foot.
  assert.ok(html.includes('Deposit required'))
})

test('a credit prints its reason, comes off the balance, and names the payable total', () => {
  // R10 000 of materials + R4 000 labour = R14 000, of which R10 000 is deposit.
  const data = build(scopeWith(10_000), [credit({ label: 'Geyser element under warranty', amountR: 1_500 })])
  assert.equal(data.quoteTotalRands, 14_000, 'the work still costs what it costs')
  assert.equal(data.payableTotalRands, 12_500)
  assert.equal(data.depositTotalRands, 10_000, 'the materials deposit is untouched by a plain credit')

  const html = renderScopeQuote(data)
  assert.ok(html.includes('Geyser element under warranty'), 'the reason reaches the customer')
  assert.ok(html.includes('Total payable'))
  assert.ok(html.includes('−R'), 'the amount is negative on the page')
})

test('a deposit already paid reduces the deposit line, not the balance line', () => {
  const data = build(scopeWith(10_000), [
    credit({ kind: 'deposit_paid', label: 'Deposit paid 12 Aug', amountR: 4_000 }),
  ])
  assert.equal(data.depositTotalRands, 6_000, 'only the rest of the deposit is still due')
  assert.equal(data.payableTotalRands, 10_000)
  // The balance on completion is the labour, exactly as it was before the
  // deposit was paid — the payment did not buy any of it.
  assert.equal(data.payableTotalRands - data.depositTotalRands, 4_000)
  const html = renderScopeQuote(data)
  assert.ok(html.includes('Deposit still due'), 'the label says what is left, not what was due')
})

test('the customer is never shown a negative total', () => {
  const data = build(scopeWith(2_000, 0), [credit({ amountR: 9_000 })])
  assert.equal(data.payableTotalRands, 0)
  assert.equal(data.depositTotalRands, 0)
  assert.ok(!renderScopeQuote(data).includes('−R-'))
})

// ── Reissue: crediting a quote that already has a document ───────────────────

test('reissuing applies the credit without re-pricing a single line', () => {
  const original = build(scopeWith(10_000), [])
  const out = reissueWithCredits(JSON.stringify(original), [credit({ label: 'Warranty part', amountR: 2_500 })])
  assert.ok(out)
  assert.equal(out.payableTotalR, 11_500)
  const next = JSON.parse(out.generatedQuoteJson)
  // Everything that priced the job is byte-identical — only the money below the
  // sections moved.
  assert.deepEqual(next.sections, original.sections)
  assert.equal(next.quoteTotalRands, 14_000)
  assert.ok(out.html.includes('Warranty part'))
})

test('reissuing twice credits the quote once, not twice', () => {
  const original = build(scopeWith(10_000), [])
  const first = reissueWithCredits(JSON.stringify(original), [credit({ amountR: 2_500 })])!
  const second = reissueWithCredits(first.generatedQuoteJson, [credit({ amountR: 2_500 })])!
  assert.equal(second.payableTotalR, 11_500, 'the gross is re-read, never the credited total')
  assert.equal(second.depositTotalR, first.depositTotalR)
})

test('removing the last credit leaves no trace of one on the document', () => {
  const original = build(scopeWith(10_000), [])
  const credited = reissueWithCredits(JSON.stringify(original), [credit({ amountR: 2_500 })])!
  const cleared = reissueWithCredits(credited.generatedQuoteJson, [])!
  const next = JSON.parse(cleared.generatedQuoteJson)
  assert.equal(next.credits, undefined)
  assert.equal(next.payableTotal, undefined)
  assert.equal(cleared.payableTotalR, 14_000)
  assert.ok(!cleared.html.includes('Total payable'))
})

test('a quote with no document, or a legacy multi-option one, cannot be reissued', () => {
  assert.equal(reissueWithCredits(null, [credit()]), null)
  assert.equal(reissueWithCredits('not json', [credit()]), null)
  assert.equal(reissueWithCredits(JSON.stringify({ type: 'multi-option', options: [] }), [credit()]), null)
})
