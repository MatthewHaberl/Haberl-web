import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCredits, creditViews, creditsTotalR, parseCredits, type QuoteCredit,
} from '../credits'

/**
 * A credit is the customer's money. Four properties carry the feature:
 * it can never become a surcharge; it can never turn a quote into a payment
 * out; a credit must eat the BALANCE before it touches the deposit that buys
 * the materials; and a deposit already paid must do the opposite, or the
 * customer is asked for the same deposit twice.
 */

function credit(over: Partial<QuoteCredit> = {}): QuoteCredit {
  return { id: 'c1', kind: 'credit', label: 'Credit', amountR: 1000, note: null, createdAt: null, ...over }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

test('a quote with no credits parses to none, from every empty shape', () => {
  assert.deepEqual(parseCredits(null), [])
  assert.deepEqual(parseCredits(undefined), [])
  assert.deepEqual(parseCredits([]), [])
  assert.deepEqual(parseCredits('[]'), [])
  assert.deepEqual(parseCredits('not json'), [])
  // The column shape changing under an old row must not throw.
  assert.deepEqual(parseCredits({ amountR: 500 }), [])
})

test('a negative or zero amount is dropped, never flipped into a charge', () => {
  const parsed = parseCredits([
    { id: 'a', label: 'Warranty part', amountR: -2500 },
    { id: 'b', label: 'Nothing', amountR: 0 },
    { id: 'c', label: 'Real', amountR: 750 },
    { id: 'd', label: 'Junk', amountR: 'abc' },
  ])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].id, 'c')
  assert.equal(parsed[0].amountR, 750)
})

test('an unknown kind reads as a plain credit — the option that spares the deposit', () => {
  const [c] = parseCredits([{ id: 'a', kind: 'refund_v2', label: 'x', amountR: 100 }])
  assert.equal(c.kind, 'credit')
})

test('a credit with no reason takes its kind’s wording, never a blank row', () => {
  const [a] = parseCredits([{ id: 'a', kind: 'deposit_paid', label: '   ', amountR: 400 }])
  assert.equal(a.label, 'Deposit already paid')
  const [b] = parseCredits([{ id: 'b', kind: 'refund', label: '', amountR: 400 }])
  assert.equal(b.label, 'Reimbursement')
})

test('a numeric string amount is read — a form posts strings', () => {
  const [c] = parseCredits('[{"id":"a","kind":"credit","label":"Callout","amountR":"1234.50"}]')
  assert.equal(c.amountR, 1234.5)
})

// ── Arithmetic ───────────────────────────────────────────────────────────────

test('no credits leaves every figure exactly as it was', () => {
  const t = applyCredits(50_000, 30_000, [])
  assert.equal(t.grossR, 50_000)
  assert.equal(t.payableR, 50_000)
  assert.equal(t.depositR, 30_000)
  assert.equal(t.balanceR, 20_000)
  assert.equal(t.appliedR, 0)
})

test('a credit comes off the balance, not the deposit that buys materials', () => {
  const t = applyCredits(50_000, 30_000, [credit({ amountR: 5_000 })])
  assert.equal(t.payableR, 45_000)
  assert.equal(t.depositR, 30_000, 'the materials deposit is untouched')
  assert.equal(t.balanceR, 15_000)
})

test('a deposit already paid comes off the DEPOSIT, so it is not asked for twice', () => {
  const t = applyCredits(50_000, 30_000, [credit({ kind: 'deposit_paid', amountR: 10_000 })])
  assert.equal(t.payableR, 40_000)
  assert.equal(t.depositR, 20_000, 'only the rest of the deposit is still due')
  assert.equal(t.balanceR, 20_000, 'the balance on completion is unchanged')
})

test('a payment bigger than the deposit clears it and spills onto the balance', () => {
  const t = applyCredits(50_000, 30_000, [credit({ kind: 'payment', amountR: 35_000 })])
  assert.equal(t.depositR, 0)
  assert.equal(t.balanceR, 15_000)
  assert.equal(t.payableR, 15_000)
})

test('a reimbursement and a deposit paid on one quote each hit their own figure', () => {
  const t = applyCredits(50_000, 30_000, [
    credit({ id: 'a', kind: 'refund', amountR: 4_000 }),
    credit({ id: 'b', kind: 'deposit_paid', amountR: 10_000 }),
  ])
  assert.equal(t.depositR, 20_000)
  assert.equal(t.balanceR, 16_000)
  assert.equal(t.payableR, 36_000)
  assert.equal(t.appliedR, 14_000)
})

test('a credit bigger than the balance eats into the deposit, never past zero', () => {
  const t = applyCredits(50_000, 30_000, [credit({ amountR: 25_000 })])
  assert.equal(t.payableR, 25_000)
  assert.equal(t.depositR, 25_000)
  assert.equal(t.balanceR, 0)
})

test('a credit worth more than the whole quote pays nothing out — the rest stays owed', () => {
  const t = applyCredits(10_000, 6_000, [credit({ amountR: 15_000 })])
  assert.equal(t.payableR, 0)
  assert.equal(t.depositR, 0)
  assert.equal(t.balanceR, 0)
  assert.equal(t.appliedR, 10_000)
  assert.equal(t.unappliedR, 5_000, 'carried on the statement, not refunded by the quote')
})

test('several credits add up and round to the cent', () => {
  const credits = [
    credit({ id: 'a', amountR: 1_250.55 }),
    credit({ id: 'b', amountR: 99.45 }),
  ]
  assert.equal(creditsTotalR(credits), 1_350)
  assert.equal(applyCredits(20_000, 5_000, credits).payableR, 18_650)
})

test('a deposit larger than the quote is clamped before anything is applied', () => {
  // Bad data, but it must not produce a negative balance.
  const t = applyCredits(10_000, 12_000, [credit({ amountR: 1_000 })])
  assert.equal(t.payableR, 9_000)
  assert.equal(t.depositR, 9_000)
  assert.equal(t.balanceR, 0)
})

// ── Document rows ────────────────────────────────────────────────────────────

test('document rows are signed, and are trimmed to what the quote can absorb', () => {
  const credits = [
    credit({ id: 'a', label: 'Warranty part', amountR: 8_000 }),
    credit({ id: 'b', label: 'Goodwill', kind: 'goodwill', amountR: 5_000 }),
  ]
  const t = applyCredits(10_000, 0, credits)
  const views = creditViews(credits, t.appliedR)
  assert.equal(views.length, 2)
  assert.equal(views[0].label, 'Warranty part')
  assert.ok(views[0].amount.startsWith('−R8'), views[0].amount)
  // The second is trimmed to the R2 000 left in the quote, so the rows still
  // add up to the total payable printed under them.
  assert.ok(views[1].amount.startsWith('−R2'), views[1].amount)
})

test('rows print in the order the money is spent — banked payments first', () => {
  const credits = [
    credit({ id: 'a', label: 'Goodwill', kind: 'goodwill', amountR: 1_000 }),
    credit({ id: 'b', label: 'Deposit already paid', kind: 'deposit_paid', amountR: 2_000 }),
  ]
  const t = applyCredits(20_000, 10_000, credits)
  const views = creditViews(credits, t.appliedR)
  assert.equal(views[0].label, 'Deposit already paid')
  assert.equal(views[1].label, 'Goodwill')
})

test('a credit that the quote cannot absorb at all prints no row', () => {
  const credits = [credit({ id: 'a', amountR: 500 }), credit({ id: 'b', amountR: 500 })]
  const t = applyCredits(500, 0, credits)
  assert.equal(creditViews(credits, t.appliedR).length, 1)
})
