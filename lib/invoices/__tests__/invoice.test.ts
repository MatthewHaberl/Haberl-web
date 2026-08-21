import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dueDateFrom,
  isOverdue,
  issueBlocker,
  jobBilling,
  linesForBasis,
  linesTotalCents,
  overBillWarning,
  randsToCents,
  type InvoiceSummaryRow,
} from '../invoice'

/**
 * Invoicing a job (migration 133). The rules worth holding:
 *
 *   • void never counts; draft always does (so nothing gets billed twice)
 *   • a deposit taken through the OLD proof-of-payment flow is money already
 *     in the bank, and the final invoice must not claim it again
 *   • cents in, cents out — nothing recovers a part by dividing a lump
 */

const invoice = (over: Partial<InvoiceSummaryRow> = {}): InvoiceSummaryRow => ({
  id: 'i1',
  invoice_number: 'INV-2026-0001',
  kind: 'progress',
  status: 'sent',
  issue_date: '2026-08-01',
  due_date: null,
  total_cents: 0,
  amount_paid_cents: 0,
  ...over,
})

// ── Rands → cents ────────────────────────────────────────────────────────────

test('rands parse from whatever a person actually types', () => {
  assert.equal(randsToCents('1234.56'), 123456)
  assert.equal(randsToCents('R1 234,56'), 123456)
  assert.equal(randsToCents(1234.56), 123456)
  assert.equal(randsToCents(''), 0)
  assert.equal(randsToCents('not a number'), 0)
})

// ── What a job has been billed ───────────────────────────────────────────────

test('void invoices do not count towards what a job has been billed', () => {
  const b = jobBilling({
    contractCents: 100_000_00,
    invoices: [
      invoice({ id: 'a', total_cents: 40_000_00, status: 'sent' }),
      invoice({ id: 'b', total_cents: 60_000_00, status: 'void' }),
    ],
    quoteDepositCents: null,
    depositConfirmed: false,
  })
  assert.equal(b.issuedCents, 40_000_00)
  assert.equal(b.remainingCents, 60_000_00)
})

test('a draft counts against the remaining figure so nothing is billed twice', () => {
  const b = jobBilling({
    contractCents: 100_000_00,
    invoices: [
      invoice({ id: 'a', total_cents: 40_000_00, status: 'sent' }),
      invoice({ id: 'b', total_cents: 25_000_00, status: 'draft', invoice_number: null }),
    ],
    quoteDepositCents: null,
    depositConfirmed: false,
  })
  assert.equal(b.issuedCents, 40_000_00, 'a draft is not issued money')
  assert.equal(b.draftCents, 25_000_00)
  assert.equal(b.remainingCents, 35_000_00, 'but it is money already claimed for')
})

test('a deposit confirmed through the old proof flow is not billed again', () => {
  const b = jobBilling({
    contractCents: 100_000_00,
    invoices: [],
    quoteDepositCents: 30_000_00,
    depositConfirmed: true,
  })
  assert.equal(b.depositCollectedCents, 30_000_00)
  assert.equal(b.remainingCents, 70_000_00)
})

test('once a deposit INVOICE exists, the invoice is the record and the old flow stops counting', () => {
  const b = jobBilling({
    contractCents: 100_000_00,
    invoices: [invoice({ id: 'd', kind: 'deposit', total_cents: 30_000_00 })],
    quoteDepositCents: 30_000_00,
    depositConfirmed: true,
  })
  assert.equal(b.depositCollectedCents, 0, 'no double subtraction')
  assert.equal(b.remainingCents, 70_000_00)
})

test('over-billing is reported, never a negative remaining figure', () => {
  const b = jobBilling({
    contractCents: 50_000_00,
    invoices: [invoice({ total_cents: 65_000_00 })],
    quoteDepositCents: null,
    depositConfirmed: false,
  })
  assert.equal(b.overContract, true)
  assert.equal(b.remainingCents, 0)
})

test('a job with no quote behind it has no contract and no remaining figure', () => {
  const b = jobBilling({
    contractCents: null,
    invoices: [invoice({ total_cents: 12_000_00 })],
    quoteDepositCents: null,
    depositConfirmed: false,
  })
  assert.equal(b.contractCents, null)
  assert.equal(b.remainingCents, null)
  assert.equal(b.overContract, false)
  assert.equal(b.issuedCents, 12_000_00, 'it can still be invoiced')
})

test('outstanding is what has been issued and not yet paid', () => {
  const b = jobBilling({
    contractCents: 100_000_00,
    invoices: [
      invoice({ id: 'a', total_cents: 40_000_00, amount_paid_cents: 40_000_00, status: 'paid' }),
      invoice({ id: 'b', total_cents: 30_000_00, amount_paid_cents: 10_000_00 }),
    ],
    quoteDepositCents: null,
    depositConfirmed: false,
  })
  assert.equal(b.paidCents, 50_000_00)
  assert.equal(b.outstandingCents, 20_000_00)
})

// ── Building the lines ───────────────────────────────────────────────────────

const ctx = (over: Partial<Parameters<typeof linesForBasis>[1]> = {}) => ({
  billing: jobBilling({
    contractCents: 100_000_00,
    invoices: [],
    quoteDepositCents: 30_000_00,
    depositConfirmed: false,
  }),
  quoteNumber: 'QUO-2026-001',
  quoteDepositCents: 30_000_00,
  workLabel: 'Solar PV',
  ...over,
})

test('a percentage claim is rounded once, off the contract', () => {
  const lines = linesForBasis('percentage', ctx(), { percent: 33.33 })
  assert.equal(lines.length, 1)
  assert.equal(lines[0].amountCents, Math.round(100_000_00 * 33.33 / 100))
  // en-ZA, so the decimal separator is a comma — the same one formatCents uses
  // for every amount in the app, and the one the quote documents already print.
  assert.match(lines[0].description, /33[.,]33%/)
})

test('a percentage over 100 or below 0 is clamped rather than billed', () => {
  assert.equal(linesForBasis('percentage', ctx(), { percent: 150 })[0].amountCents, 100_000_00)
  assert.equal(linesForBasis('percentage', ctx(), { percent: -20 })[0].amountCents, 0)
})

test('the final invoice bills the remainder and shows the subtraction', () => {
  const billing = jobBilling({
    contractCents: 100_000_00,
    invoices: [invoice({ total_cents: 30_000_00 })],
    quoteDepositCents: 20_000_00,
    depositConfirmed: true,
  })
  const lines = linesForBasis('final', ctx({ billing }))
  assert.equal(lines[0].amountCents, 50_000_00)
  assert.match(lines[0].detail ?? '', /already invoiced/)
  assert.match(lines[0].detail ?? '', /deposit received/)
})

test('the deposit basis bills what the quote asked for', () => {
  const lines = linesForBasis('deposit', ctx())
  assert.equal(lines[0].amountCents, 30_000_00)
})

test('materials bill qty x sell price, and a zero-qty pick is dropped', () => {
  const lines = linesForBasis('materials', ctx(), {
    materials: [
      { id: 'm1', section: 'Panels', description: 'Aiko 500W', qty: 12, unitSellCents: 2_450_00 },
      { id: 'm2', section: 'Panels', description: 'Rail', qty: 0, unitSellCents: 300_00 },
    ],
  })
  assert.equal(lines.length, 1)
  assert.equal(lines[0].amountCents, 12 * 2_450_00)
  assert.equal(lines[0].sourceRef, 'm1')
})

test('a typed amount keeps its own wording', () => {
  const lines = linesForBasis('amount', ctx(), {
    amountCents: 12_345_67,
    description: 'First fix complete',
  })
  assert.equal(lines[0].amountCents, 12_345_67)
  assert.equal(lines[0].description, 'First fix complete')
})

test('lines add up in cents, credits included', () => {
  assert.equal(
    linesTotalCents([
      { description: 'a', qty: 1, unitPriceCents: 0, amountCents: 150_00, source: 'manual' },
      { description: 'b', qty: 1, unitPriceCents: 0, amountCents: -25_00, source: 'credit' },
    ]),
    125_00,
  )
})

// ── Guards ───────────────────────────────────────────────────────────────────

test('an invoice for nothing cannot be issued', () => {
  assert.ok(issueBlocker([], { name: 'Someone' }))
  assert.ok(
    issueBlocker(
      [{ description: 'x', qty: 1, unitPriceCents: 0, amountCents: 0, source: 'manual' }],
      { name: 'Someone' },
    ),
  )
})

test('an invoice addressed to nobody cannot be issued', () => {
  assert.ok(
    issueBlocker(
      [{ description: 'x', qty: 1, unitPriceCents: 0, amountCents: 100, source: 'manual' }],
      { name: '  ' },
    ),
  )
})

test('a good invoice has no blocker', () => {
  assert.equal(
    issueBlocker(
      [{ description: 'Balance of works', qty: 1, unitPriceCents: 0, amountCents: 100, source: 'manual' }],
      { name: 'Matthew' },
    ),
    null,
  )
})

test('over-billing warns rather than blocks, and only when it really is over', () => {
  const billing = jobBilling({
    contractCents: 100_000_00,
    invoices: [invoice({ total_cents: 90_000_00 })],
    quoteDepositCents: null,
    depositConfirmed: false,
  })
  assert.equal(overBillWarning(billing, 10_000_00), null, 'exactly the contract is not over')
  assert.ok(overBillWarning(billing, 15_000_00))
  assert.equal(
    overBillWarning({ ...billing, contractCents: null }, 999_999_00),
    null,
    'no contract, nothing to be over',
  )
})

// ── Dates ────────────────────────────────────────────────────────────────────

test('due on receipt means the issue date', () => {
  assert.equal(dueDateFrom('2026-08-21', 0), '2026-08-21')
  assert.equal(dueDateFrom('2026-08-21', 30), '2026-09-20')
})

test('only an issued, unpaid, past-due invoice is overdue', () => {
  const today = new Date('2026-08-21T12:00:00')
  assert.equal(isOverdue(invoice({ due_date: '2026-08-01' }), today), true)
  assert.equal(isOverdue(invoice({ due_date: '2026-08-21' }), today), false, 'due today is not late')
  assert.equal(isOverdue(invoice({ due_date: '2026-08-01', status: 'paid' }), today), false)
  assert.equal(isOverdue(invoice({ due_date: '2026-08-01', status: 'void' }), today), false)
  assert.equal(isOverdue(invoice({ due_date: null }), today), false)
})
