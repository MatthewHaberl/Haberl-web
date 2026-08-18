// ─────────────────────────────────────────────────────────────────────────────
// Crews — the arithmetic. Pure, so it can be tested without a database.
//
// A crew is a named list of staff (migration 117). It reaches the rest of the
// system three different ways, and keeping those three apart is the whole
// design:
//
//   QUOTE  → crewToScopeLines()  — a SNAPSHOT. Names and rates are copied into
//            the quote. A raise next month must not reprice a sent quote.
//   JOB    → jobs.crew_id        — a REFERENCE. Assign once; every booked day
//            inherits it until a day says otherwise.
//   HOURS  → crewDayEntries()    — ACTUALS. One timesheet row per person per
//            booked day, at each person's own rate.
//
// The fetching lives in ./query; nothing here touches Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { clockSpan, splitOvertime } from '@/lib/staff/pay'
import { newCrewLine, type ScopeCrewLine } from '@/lib/quotes/scope'

const round2 = (n: number) => Math.round(n * 100) / 100

/** One person on a crew, with everything pricing and payroll need. */
export interface CrewPerson {
  staffId: string
  name: string
  jobTitle: string | null
  /** R/hr this person costs the business. */
  costRateR: number
  overtimeMultiplier: number
  payType: 'hourly' | 'piece'
  role: 'leader' | 'member'
  sortOrder: number
}

/** A crew and the people on it — what every screen here works with. */
export interface CrewWithPeople {
  id: string
  name: string
  colour: string | null
  notes: string | null
  active: boolean
  people: CrewPerson[]
}

/** Leader first, then the order the crew was built in, then by name. */
export function sortCrewPeople(people: CrewPerson[]): CrewPerson[] {
  return [...people].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'leader' ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })
}

/** What one hour of this crew costs in wages — the number a day rate is built from. */
export function crewHourlyCostR(people: CrewPerson[]): number {
  return round2(people.reduce((sum, p) => sum + (Number.isFinite(p.costRateR) ? p.costRateR : 0), 0))
}

/**
 * What a day of this crew costs in wages.
 *
 * Overtime is applied per person at the same threshold payroll uses, so a
 * quoted 11-hour day costs what the payslips will actually pay out.
 */
export function crewDayCostR(people: CrewPerson[], hoursPerDay: number, dailyThreshold = 9): number {
  const { normal, overtime } = splitOvertime(hoursPerDay, dailyThreshold)
  return round2(
    people.reduce(
      (sum, p) => sum + normal * p.costRateR + overtime * p.costRateR * (p.overtimeMultiplier || 1),
      0,
    ),
  )
}

/** People on a crew with no cost rate — they would quote and cost R0. */
export function unratedCrewPeople(people: CrewPerson[]): CrewPerson[] {
  return people.filter((p) => p.payType === 'hourly' && !(p.costRateR > 0))
}

// ── Quote: the snapshot ──────────────────────────────────────────────────────

/**
 * Copy a crew onto a quote as priced lines.
 *
 * Deliberately a copy. The quote's crew lines carry the name and the rate as
 * they were on the day it was priced; nothing here holds a live reference back
 * to `crews`, so retiring a crew or raising a wage can never change a quote a
 * customer is already holding.
 *
 * `existing` is what the quote already has: anyone already on it is skipped
 * rather than doubled, which is what "add crew A" means when Lucas is already
 * on the list by hand.
 */
export function crewToScopeLines(
  people: CrewPerson[],
  opts: { days: number; hoursPerDay: number; markup: number; existing?: ScopeCrewLine[] },
): ScopeCrewLine[] {
  const taken = new Set(
    (opts.existing ?? []).map((c) => c.staffId).filter((id): id is string => id !== null),
  )
  return sortCrewPeople(people)
    .filter((p) => !taken.has(p.staffId))
    .map((p) =>
      newCrewLine({
        staffId: p.staffId,
        name: p.name,
        costR: p.costRateR,
        markup: opts.markup,
        // Follows the quote's shift block; see ScopeCrewLine.days.
        days: null,
        qty: round2(opts.days * opts.hoursPerDay),
        unit: 'hr',
      }),
    )
}

// ── Hours: the actuals ───────────────────────────────────────────────────────

/** The booked day a crew is being confirmed against. */
export interface BookedDay {
  slotId: string
  jobId: string
  /** YYYY-MM-DD, SAST. */
  date: string
  /** HH:MM on site. */
  start: string
  end: string
}

/** A time_entries row, ready to upsert. Snake_case because it goes straight to Supabase. */
export interface CrewDayEntry {
  slot_id: string
  staff_id: string
  job_id: string
  work_date: string
  started_at: string | null
  ended_at: string | null
  break_minutes: number
  hours: number
  overtime_hours: number
  category: 'work'
  cost_rate_r: number
  overtime_multiplier: number
  source: 'crew'
  status: 'submitted'
  notes: string | null
}

/**
 * One timesheet row per person on the crew for one booked day.
 *
 * Rates are snapshotted from the crew's people, exactly as the manual
 * timesheet does — a raise must never reprice a day already worked. Hours come
 * off the booked window and split at the payroll overtime threshold, so a
 * 07:00–18:00 day books 9 normal + 2 overtime rather than 11 flat.
 *
 * `slot_id` is what makes this repeatable: the unique index on
 * (slot_id, staff_id) means re-confirming a day updates its rows instead of
 * paying the day a second time.
 *
 * Piece workers are included with their hours but a R0 rate — their money comes
 * from staff_payments, and dropping them would lose the record that they were
 * on site.
 */
export function crewDayEntries(
  people: CrewPerson[],
  day: BookedDay,
  opts: { breakMinutes?: number; dailyThreshold?: number; note?: string | null } = {},
): CrewDayEntry[] {
  const breakMinutes = Math.max(0, opts.breakMinutes ?? 0)
  const { startedAt, endedAt } = clockSpan(day.date, day.start, day.end)
  const worked = Math.max(0, hoursBetween(day.start, day.end) - breakMinutes / 60)
  const { normal, overtime } = splitOvertime(worked, opts.dailyThreshold ?? 9)

  return sortCrewPeople(people).map((p) => ({
    slot_id: day.slotId,
    staff_id: p.staffId,
    job_id: day.jobId,
    work_date: day.date,
    started_at: startedAt,
    ended_at: endedAt,
    break_minutes: breakMinutes,
    hours: normal,
    overtime_hours: overtime,
    category: 'work' as const,
    // Piece workers cost nothing per hour — their pay is agreed per job.
    cost_rate_r: p.payType === 'piece' ? 0 : p.costRateR,
    overtime_multiplier: p.overtimeMultiplier || 1,
    source: 'crew' as const,
    status: 'submitted' as const,
    notes: opts.note ?? null,
  }))
}

/** Decimal hours between two HH:MM times; an end at or before the start is next morning. */
function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0
  const mins = eh * 60 + em - (sh * 60 + sm)
  return round2((mins > 0 ? mins : mins + 1440) / 60)
}

// ── Quoted vs actual ─────────────────────────────────────────────────────────

/** The slice of a time_entries row a job's labour readout needs. */
export interface JobTimeEntry {
  id: string
  staff_id: string
  slot_id: string | null
  work_date: string
  hours: number
  overtime_hours: number
  cost_rate_r: number
  overtime_multiplier: number
  source: 'manual' | 'clock' | 'crew'
  /** Set once a pay run has claimed these hours — they stop being editable. */
  payslip_id: string | null
}

/** What the quote said this job's labour would be. Null when nothing quoted it. */
export interface QuotedLabour {
  costR: number
  sellR: number
  hours: number
  /** True when the quote priced named people, so costR is a real wage figure. */
  fromCrew: boolean
}

/** Hours and wages actually booked against a job. */
export function actualLabour(entries: JobTimeEntry[]): { costR: number; hours: number } {
  let costR = 0
  let hours = 0
  for (const e of entries) {
    const rate = Number(e.cost_rate_r) || 0
    const ot = Number(e.overtime_multiplier) || 1
    costR += (Number(e.hours) || 0) * rate + (Number(e.overtime_hours) || 0) * rate * ot
    hours += (Number(e.hours) || 0) + (Number(e.overtime_hours) || 0)
  }
  return { costR: round2(costR), hours: round2(hours) }
}


/** Labour as the quote promised it against labour as the timesheets recorded it. */
export interface LabourVariance {
  quotedCostR: number
  quotedSellR: number
  quotedHours: number
  actualCostR: number
  actualHours: number
  /** Wage cost over (positive) or under (negative) what was quoted. */
  overrunR: number
  /** What is left of the labour the customer is paying for. */
  marginR: number
}

export function labourVariance(quoted: {
  costR: number
  sellR: number
  hours: number
}, actual: { costR: number; hours: number }): LabourVariance {
  return {
    quotedCostR: round2(quoted.costR),
    quotedSellR: round2(quoted.sellR),
    quotedHours: round2(quoted.hours),
    actualCostR: round2(actual.costR),
    actualHours: round2(actual.hours),
    overrunR: round2(actual.costR - quoted.costR),
    marginR: round2(quoted.sellR - actual.costR),
  }
}
