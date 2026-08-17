import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPayslipDraft,
  datesBetween,
  entryHours,
  entryPayR,
  hoursFromClock,
  isoDate,
  payPeriod,
  outstandingOn,
  payslipReference,
  splitOvertime,
  totalPay,
  weekStart,
  type PayableAmount,
  type PayableEntry,
} from '../pay'

/**
 * Wages are the one number in this app a person notices when it's wrong. These
 * tests pin the two rules the module is built on: rates come off the ENTRY
 * (never the current staff record), and advances come off the pay — oldest
 * first, never below zero, with whatever the period could not cover carried to
 * the next slip.
 */

const entry = (over: Partial<PayableEntry> = {}): PayableEntry => ({
  id: 'e1',
  work_date: '2026-08-17',
  hours: 8,
  overtime_hours: 0,
  cost_rate_r: 150,
  overtime_multiplier: 1.5,
  category: 'work',
  ...over,
})

const advance = (over: Partial<PayableAmount> = {}): PayableAmount => ({
  id: 'p1',
  pay_date: '2026-08-18',
  kind: 'advance',
  description: 'Cash advance',
  amount_r: 500,
  ...over,
})

// ── Clock arithmetic ─────────────────────────────────────────────────────────

test('hoursFromClock subtracts the unpaid break', () => {
  const h = hoursFromClock('2026-08-17T07:00:00+02:00', '2026-08-17T16:00:00+02:00', 60)
  assert.equal(h, 8)
})

test('hoursFromClock never returns a negative day', () => {
  // Clock ran 20 minutes, break booked as 30 — a data-entry slip, not -0.17h owed.
  assert.equal(hoursFromClock('2026-08-17T07:00:00Z', '2026-08-17T07:20:00Z', 30), 0)
})

test('hoursFromClock rejects an end before the start', () => {
  assert.equal(hoursFromClock('2026-08-17T16:00:00Z', '2026-08-17T07:00:00Z'), 0)
})

test('hoursFromClock handles a clock that crosses midnight', () => {
  assert.equal(hoursFromClock('2026-08-17T22:00:00+02:00', '2026-08-18T02:30:00+02:00'), 4.5)
})

// ── Overtime split ───────────────────────────────────────────────────────────

test('splitOvertime leaves a normal day alone', () => {
  assert.deepEqual(splitOvertime(8), { normal: 8, overtime: 0 })
})

test('splitOvertime pushes hours past the threshold into overtime', () => {
  assert.deepEqual(splitOvertime(11.5), { normal: 9, overtime: 2.5 })
})

test('splitOvertime with an infinite threshold never splits', () => {
  assert.deepEqual(splitOvertime(14, Infinity), { normal: 14, overtime: 0 })
})

// ── One entry ────────────────────────────────────────────────────────────────

test('entryPayR pays overtime at the multiplier', () => {
  // 8h @ R150 = 1200; 2h @ R150 × 1.5 = 450.
  assert.equal(entryPayR(entry({ overtime_hours: 2 })), 1650)
})

test('entryPayR uses the SNAPSHOT rate, not a later raise', () => {
  // The staff record may now say R200/hr — the entry was captured at R150 and
  // must stay worth R1 200.
  assert.equal(entryPayR(entry({ cost_rate_r: 150 })), 1200)
})

test('entryPayR treats a missing multiplier as 1x rather than free overtime', () => {
  const e = { ...entry({ overtime_hours: 2 }), overtime_multiplier: 0 }
  assert.equal(entryPayR(e), 1200 + 2 * 150)
})

test('entryHours adds normal and overtime', () => {
  assert.equal(entryHours(entry({ hours: 7.5, overtime_hours: 1.25 })), 8.75)
})

// ── Period totals ────────────────────────────────────────────────────────────

test('totalPay sums hours, piece work and bonuses into gross', () => {
  const entries = [
    entry({ id: 'a', hours: 8 }),
    entry({ id: 'b', work_date: '2026-08-18', hours: 9, overtime_hours: 1 }),
  ]
  const payments: PayableAmount[] = [
    { id: 'p1', pay_date: '2026-08-18', kind: 'piece', description: 'DB rewire', amount_r: 2000 },
    { id: 'p2', pay_date: '2026-08-18', kind: 'bonus', description: 'Callout', amount_r: 300 },
  ]

  const t = totalPay(entries, payments)
  assert.equal(t.normalHours, 17)
  assert.equal(t.overtimeHours, 1)
  assert.equal(t.hoursPayR, 17 * 150 + 1 * 225) // 2550 + 225
  assert.equal(t.piecePayR, 2000)
  assert.equal(t.otherPayR, 300)
  assert.equal(t.grossPayR, 2775 + 2300)
})

// ── Advances and deductions ────────────────────────────────────────────

test('an advance comes off the pay it was an advance on', () => {
  const t = totalPay([entry()], [advance({ amount_r: 500 })])
  assert.equal(t.grossPayR, 1200)
  assert.equal(t.deductionsR, 500)
  assert.equal(t.netPayR, 700)
  assert.equal(t.carryForwardR, 0)
})

test('a deduction is subtracted the same way an advance is', () => {
  const t = totalPay([entry()], [advance({ kind: 'deduction', amount_r: 200, description: 'Tool' })])
  assert.equal(t.netPayR, 1000)
  assert.equal(t.deductions[0].kind, 'deduction')
})

test('an advance bigger than the week takes what it can and carries the rest', () => {
  // R2 000 handed over, R1 200 earned. The slip cannot ask for R800 back, so he
  // takes nothing home this week and the R800 follows him to the next run.
  const t = totalPay([entry()], [advance({ amount_r: 2000 })])
  assert.equal(t.grossPayR, 1200)
  assert.equal(t.deductionsR, 1200)
  assert.equal(t.netPayR, 0, 'a payslip can never pay a negative amount')
  assert.equal(t.carryForwardR, 800)
  assert.deepEqual(t.deductions, [
    {
      paymentId: 'p1',
      kind: 'advance',
      date: '2026-08-18',
      description: 'Cash advance',
      outstandingBeforeR: 2000,
      appliedR: 1200,
      carriedR: 800,
    },
  ])
})

test('the carried balance is what comes back next week, not the whole advance', () => {
  // The same R2 000 advance a week later: R1 200 of it is already recovered.
  const t = totalPay([entry()], [advance({ amount_r: 2000, recovered_r: 1200 })])
  assert.equal(t.outstandingR, 800)
  assert.equal(t.deductionsR, 800)
  assert.equal(t.netPayR, 400)
  assert.equal(t.carryForwardR, 0)
})

test('a fully recovered advance stops taking money', () => {
  const t = totalPay([entry()], [advance({ amount_r: 500, recovered_r: 500 })])
  assert.equal(t.deductionsR, 0)
  assert.equal(t.netPayR, 1200)
  assert.deepEqual(t.deductions, [])
})

test('advances clear oldest first when the week cannot cover both', () => {
  const t = totalPay(
    [entry({ hours: 4 })], // R600
    [
      advance({ id: 'new', pay_date: '2026-08-19', amount_r: 400 }),
      advance({ id: 'old', pay_date: '2026-08-10', amount_r: 500 }),
    ],
  )
  assert.deepEqual(
    t.deductions.map((d) => [d.paymentId, d.appliedR, d.carriedR]),
    [
      ['old', 500, 0],
      ['new', 100, 300],
    ],
  )
  assert.equal(t.netPayR, 0)
  assert.equal(t.carryForwardR, 300)
})

test('a week with no pay recovers nothing and carries everything', () => {
  const t = totalPay([], [advance({ amount_r: 500 })])
  assert.equal(t.grossPayR, 0)
  assert.equal(t.deductionsR, 0)
  assert.equal(t.netPayR, 0)
  assert.equal(t.carryForwardR, 500)
})

test('an advance is recovered out of piece work when there are no hours', () => {
  const t = totalPay([], [
    { id: 'p0', pay_date: '2026-08-18', kind: 'piece', description: 'Geyser', amount_r: 900 },
    advance({ amount_r: 400 }),
  ])
  assert.equal(t.grossPayR, 900)
  assert.equal(t.netPayR, 500)
})

test('totalPay on an empty period is all zeroes, not NaN', () => {
  const t = totalPay([], [])
  assert.equal(t.grossPayR, 0)
  assert.equal(t.netPayR, 0)
  assert.equal(t.normalHours, 0)
  assert.equal(t.deductionsR, 0)
  assert.equal(t.carryForwardR, 0)
})

test('outstandingOn ignores earnings and never goes negative', () => {
  const earned: PayableAmount = {
    id: 'x', pay_date: '2026-08-18', kind: 'piece', description: '', amount_r: 900,
  }
  assert.equal(outstandingOn(earned), 0)
  assert.equal(outstandingOn(advance({ amount_r: 500, recovered_r: 800 })), 0)
  assert.equal(outstandingOn(advance({ amount_r: 500, recovered_r: 125.5 })), 374.5)
})

test('totalPay ignores junk rates instead of producing NaN pay', () => {
  const junk = { ...entry(), cost_rate_r: Number.NaN, hours: 8 }
  assert.equal(totalPay([junk]).grossPayR, 0)
})

// ── Payslip snapshot ─────────────────────────────────────────────────────────

test('buildPayslipDraft emits a line per entry, split normal vs overtime', () => {
  const draft = buildPayslipDraft(
    [entry({ id: 'a', hours: 8, overtime_hours: 2, job_id: 'j1' })],
    [],
    new Map([['j1', 'Smit — 8kW install']]),
  )
  assert.equal(draft.lines.length, 2)
  assert.equal(draft.lines[0].kind, 'hours')
  assert.equal(draft.lines[0].amountR, 1200)
  assert.equal(draft.lines[0].jobRef, 'Smit — 8kW install')
  assert.equal(draft.lines[1].kind, 'overtime')
  assert.equal(draft.lines[1].rateR, 225)
  assert.equal(draft.lines[1].amountR, 450)
})

test('buildPayslipDraft orders lines by date', () => {
  const draft = buildPayslipDraft([
    entry({ id: 'b', work_date: '2026-08-19' }),
    entry({ id: 'a', work_date: '2026-08-17' }),
  ])
  assert.deepEqual(draft.lines.map((l) => l.date), ['2026-08-17', '2026-08-19'])
})

test('buildPayslipDraft prints earnings, then what came off them', () => {
  const draft = buildPayslipDraft([entry()], [
    advance({ amount_r: 500 }),
    { id: 'p2', pay_date: '2026-08-18', kind: 'piece', description: 'Geyser swap', amount_r: 800 },
  ])
  assert.deepEqual(draft.lines.map((l) => l.kind), ['hours', 'piece', 'advance'])
  assert.equal(draft.grossPayR, 1200 + 800)
  assert.equal(draft.netPayR, 1500)

  const deduction = draft.lines[2]
  assert.equal(deduction.amountR, 500, 'deduction amounts are positive; the kind says which way')
  assert.equal(deduction.paymentId, 'p1', 'the line names its advance so a reversal can undo it')
  assert.equal(deduction.carriedForwardR, 0)
})

test('a partly recovered advance prints what it took and what it left', () => {
  const draft = buildPayslipDraft([entry()], [advance({ amount_r: 2000 })])
  const deduction = draft.lines[draft.lines.length - 1]
  assert.equal(deduction.amountR, 1200)
  assert.equal(deduction.carriedForwardR, 800)
  assert.equal(draft.netPayR, 0)
})

test('buildPayslipDraft claims earnings but NOT an advance it could not settle', () => {
  // paymentIds is what create_payslip stamps as paid. An advance still owing a
  // balance must stay unclaimed, or the next run will never see it again.
  const draft = buildPayslipDraft([entry()], [
    advance({ amount_r: 2000 }),
    { id: 'p2', pay_date: '2026-08-18', kind: 'bonus', description: 'Callout', amount_r: 300 },
  ])
  assert.deepEqual(draft.paymentIds, ['p2'])
  // The bonus is gross too, so the advance takes R1 500 of its R2 000 — R1 200
  // of hours plus the R300 callout — and R500 carries.
  assert.deepEqual(
    draft.deductions.map((d) => [d.paymentId, d.appliedR, d.carriedR]),
    [['p1', 1500, 500]],
  )
  assert.equal(draft.netPayR, 0)
})

test('an advance the period cannot touch gets no line, only a carry', () => {
  const draft = buildPayslipDraft([], [advance({ amount_r: 500 })])
  assert.deepEqual(draft.lines, [], 'a R0 deduction line would just be noise')
  assert.equal(draft.carryForwardR, 500)
})

test('buildPayslipDraft skips zero-hour entries but keeps their payments', () => {
  const draft = buildPayslipDraft([entry({ hours: 0, overtime_hours: 0 })], [
    { id: 'p1', pay_date: '2026-08-18', kind: 'piece', description: 'Fixed price', amount_r: 1500 },
  ])
  assert.equal(draft.lines.length, 1)
  assert.equal(draft.grossPayR, 1500)
})

test('buildPayslipDraft records which rows it consumed', () => {
  const draft = buildPayslipDraft([entry({ id: 'a' }), entry({ id: 'b' })], [
    { id: 'p1', pay_date: '2026-08-18', kind: 'piece', description: 'x', amount_r: 10 },
  ])
  assert.deepEqual(draft.entryIds, ['a', 'b'])
  assert.deepEqual(draft.paymentIds, ['p1'])
})

test('a slip already handed over is not rewritten by a later advance', () => {
  // Freezing is what protects this: the slip keeps the lines it was built with,
  // so settling the balance afterwards changes the NEXT slip, not this one.
  const frozen = buildPayslipDraft([entry()], [advance({ amount_r: 2000 })]).lines
  const settled = buildPayslipDraft([entry()], [advance({ amount_r: 2000, recovered_r: 2000 })])
  assert.equal(frozen[frozen.length - 1].amountR, 1200)
  assert.equal(settled.deductionsR, 0)
})

// ── References and periods ───────────────────────────────────────────────────

test('payslipReference stamps the period month and pads the sequence', () => {
  assert.equal(payslipReference('2026-08-31', 7), 'PS-202608-007')
})

test('weekStart returns Monday for every day of that week', () => {
  // 2026-08-17 is a Monday; the whole week must collapse onto it.
  for (const d of ['2026-08-17', '2026-08-20', '2026-08-23']) {
    assert.equal(isoDate(weekStart(new Date(`${d}T09:00:00`))), '2026-08-17')
  }
})

test('payPeriod weekly runs Monday to Sunday', () => {
  assert.deepEqual(payPeriod('weekly', new Date('2026-08-20T09:00:00')), {
    start: '2026-08-17',
    end: '2026-08-23',
  })
})

test('payPeriod monthly covers the whole calendar month', () => {
  assert.deepEqual(payPeriod('monthly', new Date('2026-08-20T09:00:00')), {
    start: '2026-08-01',
    end: '2026-08-31',
  })
})

test('payPeriod fortnightly spans 14 days from the Monday', () => {
  assert.deepEqual(payPeriod('fortnightly', new Date('2026-08-20T09:00:00')), {
    start: '2026-08-17',
    end: '2026-08-30',
  })
})

test('isoDate uses the LOCAL date — a SAST morning must not shift back a day', () => {
  // 2026-08-17T01:00+02:00 is still 2026-08-16 in UTC; toISOString() would lose a day.
  assert.equal(isoDate(new Date(2026, 7, 17, 1, 0, 0)), '2026-08-17')
})

test('datesBetween yields every day inclusive', () => {
  const days = datesBetween('2026-08-17', '2026-08-23')
  assert.equal(days.length, 7)
  assert.equal(days[0], '2026-08-17')
  assert.equal(days[6], '2026-08-23')
})

test('datesBetween is empty when the range is inverted', () => {
  assert.deepEqual(datesBetween('2026-08-23', '2026-08-17'), [])
})
