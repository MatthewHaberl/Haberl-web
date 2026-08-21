import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crewRosterRows,
  effectiveRateR,
  repricedRoster,
  rosterForPay,
  rosterQuotedCostR,
  usingQuotedRate,
  quotedPeopleFromScope,
  quotedRosterRows,
  rosterHourlyCostR,
  rosterQuotedHours,
  sortRoster,
  unratedRoster,
  type RosterPerson,
} from '../staff'
import { emptyScope, newCrewLine } from '@/lib/quotes/scope'
import type { CrewWithPeople } from '@/lib/crews/crews'

/**
 * The job roster (migration 132). What matters:
 *
 *   • only people with a STAFF RECORD carry across — a generic "Assistant"
 *     line on the quote is a price, not somebody who can be paid
 *   • packages contribute too, and the same person twice is one entry
 *   • a crew fills the roster without ever claiming a second leader
 */

const scopeWithCrew = (crew: ReturnType<typeof newCrewLine>[], hoursPerDay = 9) => ({
  ...emptyScope(),
  labour: {
    ...emptyScope().labour,
    mode: 'crew' as const,
    crew,
    crewDays: 3,
    crewHoursPerDay: hoursPerDay,
  },
})

test('only named people carry across from a quote', () => {
  const people = quotedPeopleFromScope(
    scopeWithCrew([
      newCrewLine({ staffId: 's1', name: 'Lucas', qty: 27, unit: 'hr', costR: 85 }),
      newCrewLine({ staffId: null, name: 'Assistant', qty: 27, unit: 'hr', costR: 45 }),
    ]),
  )
  assert.equal(people.length, 1)
  assert.equal(people[0].staffId, 's1')
  assert.equal(people[0].hours, 27)
  assert.equal(people[0].costRateR, 85)
})

test('a day-unit line becomes hours at the quote’s own shift length', () => {
  const people = quotedPeopleFromScope(
    scopeWithCrew([newCrewLine({ staffId: 's1', name: 'Lucas', qty: 3, unit: 'day', costR: 800 })], 8),
  )
  assert.equal(people[0].hours, 24, '3 days x an 8-hour shift, not the 9-hour default')
})

test('the same person on two packages is one roster entry carrying both', () => {
  const base = scopeWithCrew([newCrewLine({ staffId: 's1', name: 'Lucas', qty: 10, unit: 'hr', costR: 85 })])
  const scope = {
    ...base,
    packages: [
      {
        id: 'p1',
        label: 'Boards',
        summary: '',
        sections: [],
        labour: {
          ...base.labour,
          crew: [newCrewLine({ staffId: 's1', name: 'Lucas', qty: 6, unit: 'hr', costR: 95 })],
        },
        coc: { included: false, feeR: 0 },
        sourceQuoteId: null,
      },
    ],
  }
  const people = quotedPeopleFromScope(scope)
  assert.equal(people.length, 1)
  assert.equal(people[0].hours, 16)
  assert.equal(people[0].costRateR, 95, 'the dearer of the two rates is what the job was sold at')
})

test('labour priced any other way names nobody', () => {
  const scope = { ...emptyScope(), labour: { ...emptyScope().labour, mode: 'fixed' as const } }
  assert.deepEqual(quotedPeopleFromScope(scope), [])
})

test('a solar quote — no scope at all — names nobody rather than throwing', () => {
  assert.deepEqual(quotedPeopleFromScope(null), [])
  assert.deepEqual(quotedPeopleFromScope(undefined), [])
  assert.deepEqual(quotedPeopleFromScope('not json'), [])
})

test('quoted rows carry the quote’s hours and rate as a snapshot', () => {
  const rows = quotedRosterRows('job-1', [
    { staffId: 's1', name: 'Lucas', hours: 27, costRateR: 85 },
  ])
  assert.equal(rows[0].source, 'quoted')
  assert.equal(rows[0].quoted_hours, 27)
  assert.equal(rows[0].quoted_cost_rate_r, 85)
  assert.equal(rows[0].role, 'member', 'the quote does not decide who runs the site')
})

// ── Crews filling the roster ─────────────────────────────────────────────────

const crew = (): CrewWithPeople => ({
  id: 'c1',
  name: 'Crew A',
  colour: null,
  notes: null,
  active: true,
  people: [
    { staffId: 's1', name: 'Lucas', jobTitle: null, costRateR: 85, overtimeMultiplier: 1.5, payType: 'hourly', role: 'leader', sortOrder: 0 },
    { staffId: 's2', name: 'Sipho', jobTitle: null, costRateR: 55, overtimeMultiplier: 1.5, payType: 'hourly', role: 'member', sortOrder: 1 },
  ],
})

test('a crew brings its leader when the job has none', () => {
  const rows = crewRosterRows('job-1', crew())
  assert.equal(rows[0].role, 'leader')
  assert.equal(rows[0].from_crew_id, 'c1')
  assert.equal(rows[0].source, 'crew')
})

test('a crew never claims a second leader on a job that already has one', () => {
  const rows = crewRosterRows('job-1', crew(), { hasLeader: true })
  assert.ok(rows.every((r) => r.role === 'member'))
})

// ── Reading the roster ───────────────────────────────────────────────────────

const person = (over: Partial<RosterPerson>): RosterPerson => ({
  staffId: 'x',
  name: 'X',
  jobTitle: null,
  costRateR: 0,
  overtimeMultiplier: 1.5,
  payType: 'hourly',
  role: 'member',
  sortOrder: 0,
  source: 'manual',
  fromCrewId: null,
  quotedHours: null,
  quotedCostRateR: null,
  notes: null,
  ...over,
})

test('the roster reads leader first, then the order people were added', () => {
  const sorted = sortRoster([
    person({ staffId: 'b', name: 'B', sortOrder: 1 }),
    person({ staffId: 'a', name: 'A', sortOrder: 0 }),
    person({ staffId: 'l', name: 'L', sortOrder: 9, role: 'leader' }),
  ])
  assert.deepEqual(sorted.map((p) => p.staffId), ['l', 'a', 'b'])
})

test('an hour of the roster costs what its people cost', () => {
  assert.equal(
    rosterHourlyCostR([person({ staffId: 'a', costRateR: 85 }), person({ staffId: 'b', costRateR: 55.5 })]),
    140.5,
  )
})

test('quoted hours add up across the roster, ignoring people the quote never named', () => {
  assert.equal(
    rosterQuotedHours([
      person({ staffId: 'a', quotedHours: 27 }),
      person({ staffId: 'b', quotedHours: null }),
    ]),
    27,
  )
})

test('an hourly person with no rate is flagged; a piece worker is not', () => {
  const flagged = unratedRoster([
    person({ staffId: 'a', costRateR: 0 }),
    person({ staffId: 'b', costRateR: 0, payType: 'piece' }),
    person({ staffId: 'c', costRateR: 85 }),
  ])
  assert.deepEqual(flagged.map((p) => p.staffId), ['a'])
})

// ── The rate a job actually costs ────────────────────────────────────────────

test('the staff rate wins — it is what the business pays today', () => {
  assert.equal(effectiveRateR(person({ costRateR: 62.5, quotedCostRateR: 60 })), 62.5)
  assert.equal(usingQuotedRate(person({ costRateR: 62.5, quotedCostRateR: 60 })), false)
})

test('with no staff rate, the quote’s rate is what this job costs', () => {
  const owner = person({ name: 'Matthew', costRateR: 0, quotedCostRateR: 250 })
  assert.equal(effectiveRateR(owner), 250, 'R0 would make the job look cheaper than it was sold')
  assert.equal(usingQuotedRate(owner), true)
})

test('a piece worker still costs zero per hour — their money is staff_payments', () => {
  const piece = person({ costRateR: 0, quotedCostRateR: 250, payType: 'piece' })
  assert.equal(effectiveRateR(piece), 0)
  assert.equal(usingQuotedRate(piece), false)
})

test('no rate anywhere is zero, and that person is flagged', () => {
  const nobody = person({ staffId: 'n', costRateR: 0, quotedCostRateR: null })
  assert.equal(effectiveRateR(nobody), 0)
  assert.deepEqual(unratedRoster([nobody]).map((p) => p.staffId), ['n'])
})

test('the roster’s hourly cost includes the quote-rated people', () => {
  // The exact shape of QUO-2026-013: three crew at their own rates, plus an
  // owner the quote priced at R250/hr with no rate on his staff record.
  const roster = [
    person({ staffId: 'a', costRateR: 62.5, quotedCostRateR: 62.5 }),
    person({ staffId: 'b', costRateR: 81.25, quotedCostRateR: 81.25 }),
    person({ staffId: 'c', costRateR: 50, quotedCostRateR: 50 }),
    person({ staffId: 'd', costRateR: 0, quotedCostRateR: 250 }),
  ]
  assert.equal(rosterHourlyCostR(roster), 443.75, 'R193,75 would silently drop the owner')
})

test('quoted wages are hours x the quoted rate, per person', () => {
  const roster = [
    person({ staffId: 'a', quotedHours: 8.5, quotedCostRateR: 62.5 }),
    person({ staffId: 'b', quotedHours: 8.5, quotedCostRateR: 81.25 }),
    person({ staffId: 'c', quotedHours: 8.5, quotedCostRateR: 50 }),
    person({ staffId: 'd', quotedHours: 8.5, quotedCostRateR: 250 }),
  ]
  // Pinned to what the quote's own labour block says for QUO-2026-013.
  assert.equal(rosterQuotedCostR(roster), 3771.88)
})

test('rosterForPay is what carries the rate into the timesheet', () => {
  const paid = rosterForPay([
    person({ staffId: 'a', costRateR: 0, quotedCostRateR: 250 }),
    person({ staffId: 'b', costRateR: 62.5, quotedCostRateR: 60 }),
  ])
  assert.deepEqual(paid.map((p) => p.costRateR), [250, 62.5])
})

test('a rate that has moved since the quote is flagged, an unchanged one is not', () => {
  const moved = person({ staffId: 'a', costRateR: 70, quotedCostRateR: 62.5 })
  const same = person({ staffId: 'b', costRateR: 62.5, quotedCostRateR: 62.5 })
  // Someone with no staff rate is "using the quoted rate", not "repriced" —
  // they belong in one message, not both.
  const noRate = person({ staffId: 'c', costRateR: 0, quotedCostRateR: 250 })
  assert.deepEqual(repricedRoster([moved, same, noRate]).map((p) => p.staffId), ['a'])
})
