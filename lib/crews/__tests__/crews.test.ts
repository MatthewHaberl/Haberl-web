import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actualLabour,
  crewDayCostR,
  crewDayEntries,
  crewHourlyCostR,
  crewToScopeLines,
  labourVariance,
  sortCrewPeople,
  unratedCrewPeople,
  type CrewPerson,
  type JobTimeEntry,
} from '../crews'
import { crewSellR, emptyScope, newCrewLine } from '@/lib/quotes/scope'

/**
 * Crews (migration 117). The three bindings each have a rule worth holding:
 *
 *   quote → a COPY, so a later raise cannot reprice a sent quote
 *   job   → a reference, tested through the UI
 *   hours → one row per person per booked day, at that person's own rate,
 *           keyed to the slot so re-confirming corrects rather than doubles
 */

function person(over: Partial<CrewPerson> = {}): CrewPerson {
  return {
    staffId: over.staffId ?? 'staff-1',
    name: over.name ?? 'Lindelani',
    jobTitle: over.jobTitle ?? null,
    costRateR: over.costRateR ?? 50,
    overtimeMultiplier: over.overtimeMultiplier ?? 1.5,
    payType: over.payType ?? 'hourly',
    role: over.role ?? 'member',
    sortOrder: over.sortOrder ?? 0,
  }
}

const CREW: CrewPerson[] = [
  person({ staffId: 'a', name: 'Lindelani', costRateR: 50, sortOrder: 0 }),
  person({ staffId: 'b', name: 'Lucas', costRateR: 62.5, sortOrder: 1 }),
  person({ staffId: 'c', name: 'Paris', costRateR: 81.25, role: 'leader', sortOrder: 2 }),
]

// ── Roster ───────────────────────────────────────────────────────────────────

test('the leader sorts first, everyone else in the order they were added', () => {
  assert.deepEqual(sortCrewPeople(CREW).map((p) => p.name), ['Paris', 'Lindelani', 'Lucas'])
})

test('an hour of the crew costs the sum of its wages', () => {
  assert.equal(crewHourlyCostR(CREW), 193.75)
})

test('a nine-hour day is nine hours of wages, an eleven-hour day pays overtime', () => {
  assert.equal(crewDayCostR(CREW, 9), 1743.75)
  // 9 normal + 2 at 1.5x on every rate.
  assert.equal(crewDayCostR(CREW, 11), 1743.75 + 2 * 193.75 * 1.5)
})

test('piece workers are not counted as unrated — their money is not hourly', () => {
  const people = [
    person({ staffId: 'x', name: 'No rate', costRateR: 0 }),
    person({ staffId: 'y', name: 'Piece', costRateR: 0, payType: 'piece' }),
  ]
  assert.deepEqual(unratedCrewPeople(people).map((p) => p.name), ['No rate'])
})

// ── Quote: the snapshot ──────────────────────────────────────────────────────

test('adding a crew to a quote copies each person at their own rate', () => {
  const lines = crewToScopeLines(CREW, { days: 2, hoursPerDay: 9, markup: 1.2 })
  assert.deepEqual(lines.map((l) => l.name), ['Paris', 'Lindelani', 'Lucas'])
  assert.deepEqual(lines.map((l) => l.qty), [18, 18, 18])
  assert.deepEqual(lines.map((l) => l.costR), [81.25, 50, 62.5])
  // Every line follows the quote's shift block rather than pinning its own days.
  assert.deepEqual(lines.map((l) => l.days), [null, null, null])
})

test('a raise after the quote was priced does not reach the quote', () => {
  const scope = emptyScope()
  scope.labour.mode = 'crew'
  scope.labour.crew = crewToScopeLines(CREW, { days: 1, hoursPerDay: 9, markup: 1.2 })
  const priced = crewSellR(scope.labour)

  // The crew record changes; the quote is a copy and must not move.
  const raised = CREW.map((p) => ({ ...p, costRateR: p.costRateR * 2 }))
  assert.equal(crewHourlyCostR(raised), 387.5)
  assert.equal(crewSellR(scope.labour), priced)
})

test('somebody already on the quote is not added twice', () => {
  const existing = [newCrewLine({ staffId: 'b', name: 'Lucas', costR: 62.5, qty: 9 })]
  const lines = crewToScopeLines(CREW, { days: 1, hoursPerDay: 9, markup: 1.2, existing })
  assert.deepEqual(lines.map((l) => l.name), ['Paris', 'Lindelani'])
})

// ── Hours: the actuals ───────────────────────────────────────────────────────

const DAY = { slotId: 'slot-1', jobId: 'job-1', date: '2026-08-18', start: '07:00', end: '16:00' }

test('a booked day becomes one timesheet row per person, at their own rate', () => {
  const rows = crewDayEntries(CREW, DAY)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((r) => r.hours), [9, 9, 9])
  assert.deepEqual(rows.map((r) => r.overtime_hours), [0, 0, 0])
  assert.deepEqual(rows.map((r) => r.cost_rate_r), [81.25, 50, 62.5])
  assert.ok(rows.every((r) => r.slot_id === 'slot-1' && r.job_id === 'job-1'))
  assert.ok(rows.every((r) => r.source === 'crew' && r.status === 'submitted'))
})

test('a long day splits into normal and overtime hours', () => {
  const rows = crewDayEntries(CREW, { ...DAY, end: '18:00' })
  assert.deepEqual(rows.map((r) => r.hours), [9, 9, 9])
  assert.deepEqual(rows.map((r) => r.overtime_hours), [2, 2, 2])
})

test('an unpaid break comes off the day before overtime is worked out', () => {
  const rows = crewDayEntries(CREW, { ...DAY, end: '17:00' }, { breakMinutes: 60 })
  assert.equal(rows[0].hours, 9)
  assert.equal(rows[0].overtime_hours, 0)
  assert.equal(rows[0].break_minutes, 60)
})

test('a night shift ending after midnight is a positive day, not a negative one', () => {
  const rows = crewDayEntries([person()], { ...DAY, start: '18:00', end: '02:00' })
  assert.equal(rows[0].hours + rows[0].overtime_hours, 8)
})

test('piece workers are on the day but cost R0 an hour — their pay is agreed per job', () => {
  const rows = crewDayEntries([person({ staffId: 'p', name: 'Piece', costRateR: 90, payType: 'piece' })], DAY)
  assert.equal(rows[0].hours, 9)
  assert.equal(rows[0].cost_rate_r, 0)
})

test('every row is keyed to the slot, so re-confirming a day corrects it', () => {
  const first = crewDayEntries(CREW, DAY)
  const again = crewDayEntries(CREW, { ...DAY, end: '17:00' })
  const key = (r: { slot_id: string; staff_id: string }) => `${r.slot_id}|${r.staff_id}`
  assert.deepEqual(first.map(key), again.map(key))
  assert.equal(again[0].hours, 9)
  assert.equal(again[0].overtime_hours, 1)
})

// ── Quoted vs actual ─────────────────────────────────────────────────────────

function entry(over: Partial<JobTimeEntry> = {}): JobTimeEntry {
  return {
    id: over.id ?? 'e1',
    staff_id: over.staff_id ?? 'a',
    slot_id: over.slot_id ?? 'slot-1',
    work_date: over.work_date ?? '2026-08-18',
    hours: over.hours ?? 9,
    overtime_hours: over.overtime_hours ?? 0,
    cost_rate_r: over.cost_rate_r ?? 50,
    overtime_multiplier: over.overtime_multiplier ?? 1.5,
    source: over.source ?? 'crew',
    payslip_id: over.payslip_id ?? null,
  }
}

test('actual labour adds hours and wages, overtime at its multiplier', () => {
  const actual = actualLabour([entry(), entry({ id: 'e2', overtime_hours: 2 })])
  assert.equal(actual.hours, 20)
  assert.equal(actual.costR, 9 * 50 + (9 * 50 + 2 * 50 * 1.5))
})

test('an overrun reads positive and eats the labour margin', () => {
  const v = labourVariance({ costR: 1000, sellR: 1400, hours: 18 }, { costR: 1250, hours: 22 })
  assert.equal(v.overrunR, 250)
  assert.equal(v.marginR, 150)
})

test('finishing early reads as a negative overrun, not a loss', () => {
  const v = labourVariance({ costR: 1000, sellR: 1400, hours: 18 }, { costR: 800, hours: 14 })
  assert.equal(v.overrunR, -200)
  assert.equal(v.marginR, 600)
})
