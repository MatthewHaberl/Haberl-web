// Run with: npx tsx --test lib/finance/__tests__/budget.test.ts
//
// The Budget section stores money as integer cents but takes it in as free-typed
// South African Rands, and sums commitments that recur on five different cadences.
// Two things must never break:
//   1. randToCents — an en-ZA comma decimal must not be read as a thousands
//      separator (that inflates every figure 100x), and 0 must stay 0, not null.
//   2. monthlyEquivalentCents — every cadence must return a number, or a single
//      unhandled case turns the whole monthly commitment total into NaN.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  randToCents,
  monthlyEquivalentCents,
  monthLabel,
  monthStart,
  shiftMonth,
  CADENCES,
  type Cadence,
} from '../budget'

// ── randToCents ───────────────────────────────────────────────────────────────

test('randToCents reads what a South African actually types', () => {
  assert.equal(randToCents('1500'), 150_000)
  assert.equal(randToCents('1500,50'), 150_050)
  assert.equal(randToCents('1 500,50'), 150_050)     // space thousands, comma decimal
  assert.equal(randToCents('R1 500,50'), 150_050)
  assert.equal(randToCents('R1.500,50'), 150_050)    // dot thousands, comma decimal
  assert.equal(randToCents('1,500.50'), 150_050)     // the US form, still understood
  assert.equal(randToCents('R 1 234 567,89'), 123_456_789)
  assert.equal(randToCents('12,5'), 1_250, 'one decimal digit is tenths of a rand, not cents')
})

test('randToCents treats zero as a value, not as "unset"', () => {
  // A budget line of R0 is meaningful (a category deliberately zeroed). If this
  // ever returns null the row is dropped instead of saved as zero.
  assert.equal(randToCents('0'), 0)
  assert.equal(randToCents('R0'), 0)
  assert.equal(randToCents('0,00'), 0)
  assert.notEqual(randToCents('0'), null)
})

test('randToCents returns null — never NaN — for anything unparseable', () => {
  for (const input of ['', '   ', 'abc', 'R', '-', ',', 'R ,']) {
    const out = randToCents(input)
    assert.equal(out, null, `expected null for ${JSON.stringify(input)}, got ${out}`)
  }
  // NaN would sail straight into an integer column; null is what the form checks.
  assert.ok(!Number.isNaN(randToCents('') as unknown as number))
})

test('randToCents always produces whole cents', () => {
  // Sub-cent input is rounded, not truncated and not stored as a fraction — a
  // fractional value would be rejected by the integer cents column.
  assert.equal(randToCents('0,004'), 0)
  assert.equal(randToCents('0,006'), 1)
  assert.equal(randToCents('10,004'), 1_000)
  assert.equal(randToCents('10,005'), 1_001)
  for (const input of ['1,004', '99,999', '0,001', '123,456', '7,777']) {
    const cents = randToCents(input)!
    assert.ok(Number.isInteger(cents), `${input} produced non-integer cents: ${cents}`)
  }
})

test('randToCents keeps the sign on refunds and corrections', () => {
  assert.equal(randToCents('-50'), -5_000)
  assert.equal(randToCents('R-50'), -5_000)
  assert.equal(randToCents('-1 234,56'), -123_456)
})

// ── monthlyEquivalentCents ────────────────────────────────────────────────────

test('monthlyEquivalentCents converts each cadence to a comparable monthly load', () => {
  assert.equal(monthlyEquivalentCents(100_000, 'monthly'), 100_000)
  assert.equal(monthlyEquivalentCents(100_000, 'quarterly'), 33_333)   // /3
  assert.equal(monthlyEquivalentCents(100_000, 'annual'), 8_333)       // /12
  assert.equal(monthlyEquivalentCents(10_000, 'weekly'), 43_333)       // x52/12, NOT x4
  // The weekly trap: 52 weeks a year is ~4.33 months' worth, so a naive x4 would
  // under-state every weekly commitment by ~8%.
  assert.ok(monthlyEquivalentCents(10_000, 'weekly') > 10_000 * 4)
})

test('a one-off is not a recurring monthly load', () => {
  // 'once' must contribute nothing to the recurring total, or every historic
  // one-off inflates this month's commitments forever.
  assert.equal(monthlyEquivalentCents(999_999, 'once'), 0)
  assert.equal(monthlyEquivalentCents(0, 'once'), 0)
})

test('monthlyEquivalentCents x12 recovers the annual cost of every cadence', () => {
  const amount = 120_000 // R1 200
  const annualised: Record<Exclude<Cadence, 'once'>, number> = {
    weekly: amount * 52,
    monthly: amount * 12,
    quarterly: amount * 4,
    annual: amount,
  }
  for (const [cadence, expected] of Object.entries(annualised) as Array<[Exclude<Cadence, 'once'>, number]>) {
    const got = monthlyEquivalentCents(amount, cadence) * 12
    // Rounding to whole cents per month can drift by at most 12 cents a year.
    assert.ok(Math.abs(got - expected) <= 12,
      `${cadence}: annualised to ${got}, expected about ${expected}`)
  }
})

test('every cadence offered in the UI returns a usable integer', () => {
  // CADENCES drives the dropdown. If a cadence is ever added there without a case
  // in the switch, this returns undefined and the commitments total becomes NaN.
  for (const { value } of CADENCES) {
    const out = monthlyEquivalentCents(50_000, value)
    assert.equal(typeof out, 'number', `cadence "${value}" has no conversion`)
    assert.ok(Number.isInteger(out), `cadence "${value}" produced ${out}`)
    assert.ok(out >= 0)
  }
  assert.equal(CADENCES.length, 5, 'a new cadence needs a case in monthlyEquivalentCents')
})

test('monthlyEquivalentCents is sign-preserving and zero-safe', () => {
  assert.equal(monthlyEquivalentCents(0, 'monthly'), 0)
  assert.equal(monthlyEquivalentCents(0, 'weekly'), 0)
  assert.equal(monthlyEquivalentCents(-120_000, 'annual'), -10_000)
})

// ── month helpers ─────────────────────────────────────────────────────────────

test('monthLabel renders a month string the way the UI shows it', () => {
  assert.equal(monthLabel('2026-06-01'), 'June 2026')
  assert.equal(monthLabel('2026-01-01'), 'January 2026')
  assert.equal(monthLabel('2025-12-01'), 'December 2025')
  // The day part is irrelevant — any day in the month gives the same label.
  assert.equal(monthLabel('2026-06-28'), monthLabel('2026-06-01'))
})

test('monthStart and shiftMonth stay on the 1st and cross year boundaries', () => {
  assert.equal(monthStart('2026-06-28'), '2026-06-01')
  assert.equal(monthStart('2026-01-31T22:00:00'), '2026-01-01')
  assert.equal(shiftMonth('2026-06-01', 0), '2026-06-01')
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01', 'stepping back from January must reach last December')
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01')
  assert.equal(shiftMonth('2026-06-01', -12), '2025-06-01')
  // 12 single steps must equal one 12-step jump (the trailing-12-months charts
  // build their axis by repeated shifting).
  let m = '2026-06-01'
  for (let i = 0; i < 12; i++) m = shiftMonth(m, -1)
  assert.equal(m, shiftMonth('2026-06-01', -12))
})

test('shiftMonth never lands on the 31st→short-month overflow', () => {
  // Guards the classic Date bug: new Date(y, 0, 31) shifted a month becomes 3 March.
  // Because everything is normalised to the 1st, January + 1 is always February.
  assert.equal(shiftMonth(monthStart('2026-01-31'), 1), '2026-02-01')
  assert.equal(monthLabel(shiftMonth(monthStart('2026-03-31'), -1)), 'February 2026')
})
