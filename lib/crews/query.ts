// ─────────────────────────────────────────────────────────────────────────────
// Crews — the Supabase half. Shaping only; the arithmetic lives in ./crews.
//
// Client-agnostic on purpose: it takes whichever SupabaseClient the caller
// already has, so the server pages and the quote builder's browser panel read
// crews through exactly the same query.
//
// Every query goes through the caller's RLS-scoped client. Crews and their
// membership are readable by any employee (roster information); the RATES on
// those people come from `staff`, which RLS still limits to managers — so a
// field worker calling loadCrews() gets the names and R0 rates, and that is
// the correct answer for them.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Crew } from '@/types/database'
import { crewCostR, crewHours, crewSellR, labourAmountR, labourCostR, parseScope } from '@/lib/quotes/scope'
import { sortCrewPeople, type CrewPerson, type CrewWithPeople, type QuotedLabour } from './crews'

/** Shape Supabase returns for the members join. */
interface MemberRow {
  crew_id: string
  staff_id: string
  role: 'leader' | 'member'
  sort_order: number
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

const MEMBER_SELECT =
  'crew_id, staff_id, role, sort_order, ' +
  'staff:staff_id (id, full_name, job_title, cost_rate_r, overtime_multiplier, pay_type, active)'

function toPerson(row: MemberRow): CrewPerson | null {
  // A member whose staff row is gone (or unreadable under RLS) is dropped
  // rather than rendered as a blank name with a R0 rate.
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
  }
}

export async function loadCrews(
  supabase: SupabaseClient,
  opts: { includeInactive?: boolean } = {},
): Promise<CrewWithPeople[]> {
  let q = supabase.from('crews').select('id, name, colour, notes, active').order('name')
  if (!opts.includeInactive) q = q.eq('active', true)
  const { data: crewRows } = await q
  const crews = (crewRows ?? []) as Pick<Crew, 'id' | 'name' | 'colour' | 'notes' | 'active'>[]
  if (crews.length === 0) return []

  const { data: memberRows } = await supabase
    .from('crew_members')
    .select(MEMBER_SELECT)
    .in('crew_id', crews.map((c) => c.id))

  const byCrew = new Map<string, CrewPerson[]>()
  for (const raw of (memberRows ?? []) as unknown as MemberRow[]) {
    const person = toPerson(raw)
    if (!person) continue
    const list = byCrew.get(raw.crew_id) ?? []
    list.push(person)
    byCrew.set(raw.crew_id, list)
  }

  return crews.map((c) => ({
    id: c.id,
    name: c.name,
    colour: c.colour,
    notes: c.notes,
    active: c.active,
    people: sortCrewPeople(byCrew.get(c.id) ?? []),
  }))
}

export async function loadCrew(
  supabase: SupabaseClient,
  crewId: string,
): Promise<CrewWithPeople | null> {
  const { data } = await supabase
    .from('crews')
    .select('id, name, colour, notes, active')
    .eq('id', crewId)
    .maybeSingle()
  if (!data) return null

  const { data: memberRows } = await supabase
    .from('crew_members')
    .select(MEMBER_SELECT)
    .eq('crew_id', crewId)

  const people = ((memberRows ?? []) as unknown as MemberRow[])
    .map(toPerson)
    .filter((p): p is CrewPerson => p !== null)

  const crew = data as Pick<Crew, 'id' | 'name' | 'colour' | 'notes' | 'active'>
  return {
    id: crew.id,
    name: crew.name,
    colour: crew.colour,
    notes: crew.notes,
    active: crew.active,
    people: sortCrewPeople(people),
  }
}


/**
 * What a job's quote promised for labour.
 *
 * Only the scope engine's quotes carry a labour block this can read; a solar
 * design prices labour inside the system design, so those return null and the
 * job shows its actual hours without a yardstick rather than an invented one.
 *
 * `fromCrew` matters: crew mode is the only labour mode that knows a real wage
 * cost. The other three are a price with no cost behind them, so comparing
 * them to actual wages would read as a margin that was never quoted.
 */
export async function loadQuotedLabour(
  supabase: SupabaseClient,
  quoteRequestId: string,
): Promise<QuotedLabour | null> {
  const { data } = await supabase
    .from('quote_requests')
    .select('scope')
    .eq('id', quoteRequestId)
    .maybeSingle()

  const scope = parseScope((data as { scope?: unknown } | null)?.scope)
  if (!scope) return null

  const fromCrew = scope.labour.mode === 'crew'
  return {
    costR: fromCrew ? crewCostR(scope.labour) : labourCostR(scope.labour),
    sellR: fromCrew ? crewSellR(scope.labour) : labourAmountR(scope.labour),
    hours: fromCrew ? crewHours(scope.labour) : scope.labour.hours,
    fromCrew,
  }
}
