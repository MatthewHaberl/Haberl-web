// ─────────────────────────────────────────────────────────────────────────────
// The people on a job — migration 132's job_staff, shaped for the screens.
//
// A crew (migration 117) is a shortcut for filling this list, not a substitute
// for it. Three things put a name on a job and the list remembers which:
//
//   'quoted' — the quote priced this person into the work. Copied across when
//              the job is created, with the hours and rate the quote used.
//   'crew'   — assigning a crew put them here. Changing the crew replaces
//              exactly these rows.
//   'manual' — somebody added them by hand. A crew change never touches them.
//
// The roster is what a booked day's hours are written from, which is the point:
// "the crew, plus Sipho on Tuesday" used to be unrepresentable, so Sipho was
// paid by memory.
//
// Arithmetic and shaping only — the timesheet rows themselves are still built
// by lib/crews/crews.ts, so a roster day and a crew day pay identically.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CrewPerson, CrewWithPeople } from '@/lib/crews/crews'
import { parseScope, crewLineDays, type ScopeCrewLine, type ScopeLabour } from '@/lib/quotes/scope'

export type RosterSource = 'quoted' | 'crew' | 'manual'

/** One person on a job — a CrewPerson plus where they came from. */
export interface RosterPerson extends CrewPerson {
  source: RosterSource
  fromCrewId: string | null
  /** Hours the quote promised for this person. Null unless source = 'quoted'. */
  quotedHours: number | null
  /** The rate the quote used. A snapshot; may differ from costRateR today. */
  quotedCostRateR: number | null
  notes: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Shape Supabase returns for the job_staff → staff join. */
interface RosterRow {
  job_id: string
  staff_id: string
  role: 'leader' | 'member'
  source: RosterSource
  from_crew_id: string | null
  quoted_hours: number | null
  quoted_cost_rate_r: number | null
  sort_order: number
  notes: string | null
  staff: {
    id: string
    full_name: string
    job_title: string | null
    cost_rate_r: number
    overtime_multiplier: number
    pay_type: 'hourly' | 'piece'
    active: boolean
  } | null
}

const ROSTER_SELECT =
  'job_id, staff_id, role, source, from_crew_id, quoted_hours, quoted_cost_rate_r, sort_order, notes, ' +
  'staff:staff_id (id, full_name, job_title, cost_rate_r, overtime_multiplier, pay_type, active)'

function toRosterPerson(row: RosterRow): RosterPerson | null {
  // A row whose staff record is gone (or unreadable under RLS) is dropped
  // rather than rendered as a blank name on a R0 rate — same call as
  // lib/crews/query.ts.
  if (!row.staff) return null
  return {
    staffId: row.staff_id,
    name: row.staff.full_name,
    jobTitle: row.staff.job_title,
    costRateR: Number(row.staff.cost_rate_r) || 0,
    overtimeMultiplier: Number(row.staff.overtime_multiplier) || 1,
    payType: row.staff.pay_type,
    role: row.role,
    sortOrder: row.sort_order,
    source: row.source,
    fromCrewId: row.from_crew_id,
    quotedHours: row.quoted_hours == null ? null : Number(row.quoted_hours),
    quotedCostRateR: row.quoted_cost_rate_r == null ? null : Number(row.quoted_cost_rate_r),
    notes: row.notes,
  }
}

/** Leader first, then the order they were added, then by name. */
export function sortRoster(people: RosterPerson[]): RosterPerson[] {
  return [...people].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'leader' ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })
}

export async function loadJobRoster(
  supabase: SupabaseClient,
  jobId: string,
): Promise<RosterPerson[]> {
  const { data } = await supabase.from('job_staff').select(ROSTER_SELECT).eq('job_id', jobId)
  const people = ((data ?? []) as unknown as RosterRow[])
    .map(toRosterPerson)
    .filter((p): p is RosterPerson => p !== null)
  return sortRoster(people)
}

// ── Filling the roster ───────────────────────────────────────────────────────

/** A job_staff row ready to upsert. Snake_case — it goes straight to Supabase. */
export interface JobStaffRow {
  job_id: string
  staff_id: string
  role: 'leader' | 'member'
  source: RosterSource
  from_crew_id: string | null
  quoted_hours: number | null
  quoted_cost_rate_r: number | null
  sort_order: number
}

/**
 * The rows a crew contributes to a job's roster.
 *
 * `hasLeader` is what stops the insert from colliding with the job's partial
 * unique index on role='leader': a job that already has a leader takes the
 * crew's leader as a member. Somebody is in charge on site and it is not
 * decided by which crew was assigned second.
 */
export function crewRosterRows(
  jobId: string,
  crew: CrewWithPeople,
  opts: { hasLeader?: boolean } = {},
): JobStaffRow[] {
  let leaderTaken = opts.hasLeader ?? false
  return crew.people.map((p, index) => {
    const isLeader = p.role === 'leader' && !leaderTaken
    if (isLeader) leaderTaken = true
    return {
      job_id: jobId,
      staff_id: p.staffId,
      role: isLeader ? ('leader' as const) : ('member' as const),
      source: 'crew' as const,
      from_crew_id: crew.id,
      quoted_hours: null,
      quoted_cost_rate_r: null,
      sort_order: index,
    }
  })
}

/** One person the quote priced into the work. */
export interface QuotedPerson {
  staffId: string
  name: string
  hours: number
  costRateR: number
}

/**
 * The named people a scope-engine quote priced.
 *
 * Only crew lines that name a real person carry across — a generic "Assistant"
 * line has no staff record behind it and would land on the roster as somebody
 * who cannot be paid. Packages contribute too: a combined quote prices each
 * package's own crew, and the job does all of it.
 *
 * Hours are per person and additive: the same person on two packages is one
 * roster entry carrying both packages' hours.
 *
 * Returns [] for a solar-engine quote, which prices labour inside the system
 * design and never names anyone.
 */
export function quotedPeopleFromScope(rawScope: unknown): QuotedPerson[] {
  const scope = parseScope(rawScope)
  if (!scope) return []

  const byStaff = new Map<string, QuotedPerson>()

  const take = (labour: ScopeLabour) => {
    if (labour.mode !== 'crew') return
    for (const line of labour.crew) {
      const person = quotedFromLine(line, labour)
      if (!person) continue
      const existing = byStaff.get(person.staffId)
      if (existing) {
        existing.hours = round2(existing.hours + person.hours)
        // Two lines for the same person at different rates: the higher one is
        // the safer thing to carry — it is what the job was actually sold at
        // for that person's most expensive hour.
        existing.costRateR = Math.max(existing.costRateR, person.costRateR)
      } else {
        byStaff.set(person.staffId, person)
      }
    }
  }

  take(scope.labour)
  for (const pkg of scope.packages) take(pkg.labour)

  return [...byStaff.values()]
}

function quotedFromLine(line: ScopeCrewLine, labour: ScopeLabour): QuotedPerson | null {
  if (!line.staffId) return null
  // qty means hours only on an hourly line. A 'day' line is days x the shift.
  // A 'job' line is a lump — nothing was quoted in hours — so what carries
  // across is the time on site the line implies: the days it covers at the
  // quote's shift length. It is an expectation, not a promise, and the roster
  // labels it as the quote's figure rather than a commitment.
  const hours =
    line.unit === 'hr'
      ? Number(line.qty) || 0
      : line.unit === 'day'
        ? round2((Number(line.qty) || 0) * labour.crewHoursPerDay)
        : round2(crewLineDays(line, labour) * labour.crewHoursPerDay)
  return {
    staffId: line.staffId,
    name: line.name,
    hours: round2(hours),
    costRateR: Number(line.costR) || 0,
  }
}

/** The roster rows a quote's named people contribute. */
export function quotedRosterRows(jobId: string, people: QuotedPerson[]): JobStaffRow[] {
  return people.map((p, index) => ({
    job_id: jobId,
    staff_id: p.staffId,
    role: 'member' as const,
    source: 'quoted' as const,
    from_crew_id: null,
    quoted_hours: p.hours,
    quoted_cost_rate_r: p.costRateR,
    sort_order: index,
  }))
}

// ── Reading the roster ───────────────────────────────────────────────────────

/** What one hour of this roster costs in wages. */
export function rosterHourlyCostR(people: RosterPerson[]): number {
  return round2(people.reduce((sum, p) => sum + (Number.isFinite(p.costRateR) ? p.costRateR : 0), 0))
}

/** Hours the quote promised across the whole roster. */
export function rosterQuotedHours(people: RosterPerson[]): number {
  return round2(people.reduce((sum, p) => sum + (p.quotedHours ?? 0), 0))
}

/** People on the roster with no rate — they would cost the job nothing. */
export function unratedRoster(people: RosterPerson[]): RosterPerson[] {
  return people.filter((p) => p.payType === 'hourly' && !(p.costRateR > 0))
}

export const SOURCE_LABEL: Record<RosterSource, string> = {
  quoted: 'Quoted',
  crew: 'From crew',
  manual: 'Added',
}
