import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyScope, newScopeLine, type QuoteScope } from '../scope'
import { scopeToBom } from '../scope-bom'
import { buildScopeQuoteData } from '../scope-quote'
import { renderScopeQuote } from '../render-scope-quote'
import type { PricingDisclosure } from '../quote-cost'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * Showing a customer the pricing ex VAT (migration 131).
 *
 * Three properties carry it:
 *   off is byte-for-byte the document every quote has always had — a column
 *     added under a sent quote must not change what the customer is holding;
 *   the ex-VAT figures come from the LINES, so labour reads the same in both
 *     columns and only the materials shed 15%;
 *   open book is a level of its own, because it is the only one that shows a
 *     customer what we pay and what we add.
 */

const CATALOG = new Map<string, EquipmentCatalogItem>()

// One material line at a landed R1 150 (supplier R1 000 ex VAT) and R2 000 of
// labour: any wrong division shows up immediately in numbers this round.
function jobScope(): QuoteScope {
  const s = emptyScope({ sections: ['Distribution board'] })
  s.summary = 'Replace the main board'
  s.lines = [
    { ...newScopeLine('Distribution board', 'material'), description: 'DB 3x15 way surf',
      qty: 2, unitCostR: 1150, unitSellR: 1322.5 },
  ]
  s.labour.mode = 'fixed'
  s.labour.fixedR = 2000
  s.coc = { included: true, feeR: 1500 }
  return s
}

function documentFor(disclosure: PricingDisclosure, scope = jobScope()) {
  const bom = scopeToBom(scope, CATALOG, 1.15)
  const data = buildScopeQuoteData({
    scope, bom, catalog: CATALOG,
    req: { customer_name: 'Test', address: '1 Test Rd' },
    quoteNumber: 'Q-131', expiryDays: 7,
    workType: 'electrical', workTypeLabel: 'Electrical work',
    showLineItems: true,
    pricingDisclosure: disclosure,
  })
  return { data, html: renderScopeQuote(data) }
}

// ── Off is the document that already exists ──────────────────────────────────

test('with the setting off nothing about the document changes', () => {
  const { data, html } = documentFor(null)
  assert.equal(data.pricingDisclosure, undefined)
  assert.equal(data.quoteTotalExVat, undefined)
  assert.equal(data.depositTotalExVat, undefined)
  assert.equal(data.sections[0].subtotalExVat, undefined)
  assert.equal(data.sections[0].lines?.[0].amountExVat, undefined)
  assert.ok(!html.includes('Excl. VAT'), 'no ex-VAT column')
  assert.ok(!html.includes('Supplier'), 'no supplier price')
})

test('off and ex-VAT render the same prices — only the extra column is added', () => {
  const off = documentFor(null)
  const on = documentFor('ex_vat')
  assert.equal(on.data.quoteTotal, off.data.quoteTotal)
  assert.equal(on.data.depositTotal, off.data.depositTotal)
  assert.equal(on.data.balanceTotal, off.data.balanceTotal)
  assert.deepEqual(
    on.data.sections.map((s) => s.subtotal),
    off.data.sections.map((s) => s.subtotal),
  )
})

// ── The arithmetic the customer can check ────────────────────────────────────

test('materials shed the 15%, labour and the CoC do not', () => {
  const { data } = documentFor('ex_vat')
  const section = (name: string) => data.sections.find((s) => s.name === name)!
  // 2 × R1 322.50 = R2 645 incl, R2 300 with the supplier VAT out of it.
  assert.equal(section('Distribution board').subtotalExVatRands, 2300)
  assert.equal(section('Labour').subtotalExVatRands, section('Labour').subtotalRands)
  assert.equal(section('Compliance').subtotalExVatRands, section('Compliance').subtotalRands)
})

test('the ex-VAT total is the sections added up, not the total divided', () => {
  const { data } = documentFor('ex_vat')
  const summed = data.sections.reduce((t, s) => t + (s.subtotalExVatRands ?? 0), 0)
  assert.equal(data.quoteTotalExVat, `R${summed.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  // 2 645 + 2 000 + 1 500 = 6 145 incl; 2 300 + 2 000 + 1 500 = 5 800 ex.
  assert.equal(data.quoteTotalRands, 6145)
  assert.equal(summed, 5800)
})

test('deposit and balance still add up to the total in the ex-VAT column', () => {
  const { data } = documentFor('ex_vat')
  // en-ZA money: "R2 300,00" — the comma is the decimal point.
  const money = (s?: string) =>
    Number((s ?? '').replace(/[^0-9,]/g, '').replace(',', '.'))
  // The deposit is material lines only, so it sheds the full 15%: 2 645 → 2 300.
  assert.equal(money(data.depositTotalExVat), 2300)
  assert.equal(
    money(data.depositTotalExVat) + money(data.balanceTotalExVat),
    money(data.quoteTotalExVat),
  )
})

test('the ex-VAT balance is exactly the labour and the certificate', () => {
  // Real prices, deliberately: rounding the deposit as a LUMP (58 216.02 / 1.15)
  // lands a cent away from the sum of its sections, and the customer then reads
  // a balance of R11 299,99 against labour + CoC of R11 300,00.
  const s = emptyScope({ sections: ['Inverter', 'Wiring'] })
  const part = (section: string, qty: number, cost: number) => ({
    ...newScopeLine(section, 'material'),
    description: section, qty, unitCostR: cost, unitSellR: Math.round(cost * 1.15 * 100) / 100,
  })
  s.lines = [part('Inverter', 1, 28449.13), part('Wiring', 80, 258.99)]
  s.labour.mode = 'fixed'
  s.labour.fixedR = 9800
  s.coc = { included: true, feeR: 1500 }

  const { data } = documentFor('ex_vat', s)
  const money = (v?: string) => Number((v ?? '').replace(/[^0-9,]/g, '').replace(',', '.'))
  assert.equal(money(data.balanceTotalExVat), 11300)
  assert.equal(
    Math.round((money(data.depositTotalExVat) + money(data.balanceTotalExVat)) * 100) / 100,
    money(data.quoteTotalExVat),
  )
})

test('a line states its own ex-VAT amount', () => {
  const { data, html } = documentFor('ex_vat')
  const line = data.sections[0].lines![0]
  assert.equal(line.amount, 'R2 645,00'.replace(/\u00a0/g, ' ').replace(/ /g, '\u00a0'))
  assert.ok(line.amountExVat, 'the line carries an ex-VAT figure')
  assert.ok(html.includes('Excl. VAT'), 'the table gains the column')
})

// ── Open book is its own level ───────────────────────────────────────────────

test('supplier prices appear at open book and nowhere else', () => {
  const open = documentFor('open_book')
  const exVat = documentFor('ex_vat')
  const line = open.data.sections[0].lines![0]
  // Landed R1 150 → the supplier charges R1 000 ex VAT; we sell at R1 322.50.
  assert.ok(line.supplier?.includes('R1'), `supplier price stated: ${line.supplier}`)
  assert.ok(line.supplier?.includes('32.3%'), `markup stated: ${line.supplier}`)
  assert.ok(open.html.includes('Supplier'))
  assert.equal(exVat.data.sections[0].lines![0].supplier, undefined)
  assert.ok(!exVat.html.includes('Supplier'), 'ex-VAT alone never shows cost')
})

test('open book still shows the ex-VAT column', () => {
  const { data, html } = documentFor('open_book')
  assert.equal(data.pricingDisclosure, 'open_book')
  assert.ok(data.quoteTotalExVat)
  assert.ok(html.includes('Excl. VAT'))
})

test('labour never gets a supplier price, whatever the setting', () => {
  const { data } = documentFor('open_book')
  const labour = data.sections.find((s) => s.name === 'Labour')!
  assert.equal(labour.lines?.[0].supplier, undefined)
})
