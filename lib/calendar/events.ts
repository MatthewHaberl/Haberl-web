import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarEventStatus,
} from '@/types/database'

/**
 * The calendar overlays two sources:
 *   1. calendar_events — the new appointments layer (migration 085)
 *   2. job_schedule_slots — installation working days, read-only (migration 106).
 *      A job booked across three days shows as three timed blocks.
 *   3. jobs.scheduled_date — the fallback for jobs booked before slots existed
 *      (or created straight from the manual-job form); shown as an all-day block.
 *
 * Both are flattened into one CalendarItem the UI can render uniformly.
 */
export type CalendarItemKind = CalendarEventType | 'installation'

export interface CalendarItem {
  /** Namespaced id so events and jobs never collide: "event:<uuid>" / "job:<uuid>". */
  id: string
  source: 'event' | 'job'
  kind: CalendarItemKind
  title: string
  /** ISO timestamp. */
  start: string
  /** ISO timestamp. */
  end: string
  allDay: boolean
  status: string
  assignedTo: string | null
  assigneeName: string | null
  /** The crew on site, for booked installation days (migration 117). */
  crewName?: string | null
  location: string | null
  /** Where clicking the item should go (jobs link out; events open the editor). */
  href: string | null
  /** The raw row — present for editable events only. */
  event?: CalendarEvent
}

interface KindMeta {
  label: string
  /** Tailwind classes for a filled chip/block. */
  block: string
  /** Tailwind classes for a small dot. */
  dot: string
  /** Legend swatch background. */
  swatch: string
}

/** One palette entry per kind — distinct, readable in light mode. */
export const KIND_META: Record<CalendarItemKind, KindMeta> = {
  site_meeting:      { label: 'Site meeting',  block: 'bg-blue-100 text-blue-900 border-blue-300',       dot: 'bg-blue-500',    swatch: 'bg-blue-500' },
  inspection:        { label: 'Inspection',    block: 'bg-violet-100 text-violet-900 border-violet-300', dot: 'bg-violet-500',  swatch: 'bg-violet-500' },
  quote_appointment: { label: 'Quote appt',    block: 'bg-amber-100 text-amber-900 border-amber-300',    dot: 'bg-amber-500',   swatch: 'bg-amber-500' },
  service:           { label: 'Service',       block: 'bg-emerald-100 text-emerald-900 border-emerald-300', dot: 'bg-emerald-500', swatch: 'bg-emerald-500' },
  follow_up:         { label: 'Follow-up',     block: 'bg-rose-100 text-rose-900 border-rose-300',       dot: 'bg-rose-500',    swatch: 'bg-rose-500' },
  other:             { label: 'Other',         block: 'bg-slate-100 text-slate-900 border-slate-300',    dot: 'bg-slate-500',   swatch: 'bg-slate-500' },
  installation:      { label: 'Installation',  block: 'bg-orange-100 text-orange-900 border-orange-400', dot: 'bg-orange-500',  swatch: 'bg-orange-500' },
}

/** Types a user can actually create (installations come from jobs, not here). */
export const CREATABLE_TYPES: CalendarEventType[] = [
  'site_meeting', 'inspection', 'quote_appointment', 'service', 'follow_up', 'other',
]

export const STATUS_LABEL: Record<CalendarEventStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show:   'No-show',
}

export function kindLabel(kind: CalendarItemKind): string {
  return KIND_META[kind]?.label ?? kind
}

/** "09:30" in SA time. */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function eventToItem(e: CalendarEvent, assigneeName: string | null): CalendarItem {
  return {
    id: `event:${e.id}`,
    source: 'event',
    kind: e.type,
    title: e.title,
    start: e.starts_at,
    end: e.ends_at,
    allDay: e.all_day,
    status: e.status,
    assignedTo: e.assigned_to,
    assigneeName,
    location: e.location,
    href: null,
    event: e,
  }
}

interface JobRow {
  id: string
  title: string
  scheduled_date: string
  stage: string
  assigned_to: string | null
  site?: { name: string | null; address: string | null } | null
  assignee?: { full_name: string | null } | null
}

function jobToItem(j: JobRow): CalendarItem {
  // scheduled_date is a bare date — treat the install as an all-day block.
  const start = `${j.scheduled_date}T00:00:00`
  return {
    id: `job:${j.id}`,
    source: 'job',
    kind: 'installation',
    title: j.title,
    start,
    end: start,
    allDay: true,
    status: j.stage,
    assignedTo: j.assigned_to,
    assigneeName: j.assignee?.full_name ?? null,
    location: j.site?.address ?? j.site?.name ?? null,
    href: `/portal/employee/jobs/${j.id}`,
  }
}

interface SlotRow {
  id: string
  job_id: string
  starts_at: string
  ends_at: string
  assigned_to: string | null
  crew_id: string | null
  job?: {
    title: string
    stage: string
    assigned_to: string | null
    crew_id: string | null
    site?: { name: string | null; address: string | null } | null
  } | null
}

/** One booked working day on a job — a timed block, not an all-day one. */
function slotToItem(
  s: SlotRow,
  dayNumber: number,
  dayCount: number,
  assigneeName: string | null,
  crewName: string | null,
): CalendarItem {
  const suffix = dayCount > 1 ? ` (day ${dayNumber}/${dayCount})` : ''
  return {
    id: `slot:${s.id}`,
    source: 'job',
    kind: 'installation',
    title: `${s.job?.title ?? 'Installation'}${suffix}`,
    start: s.starts_at,
    end: s.ends_at,
    allDay: false,
    status: s.job?.stage ?? 'scheduled',
    assignedTo: s.assigned_to ?? s.job?.assigned_to ?? null,
    assigneeName,
    crewName,
    location: s.job?.site?.address ?? s.job?.site?.name ?? null,
    href: `/portal/employee/jobs/${s.job_id}`,
  }
}

/**
 * Load every calendar item between two instants. RLS already scopes rows to the
 * caller (field workers see only their own events/jobs), so this just reads what
 * it's allowed to. `rangeStart`/`rangeEnd` are ISO timestamps; `rangeEnd` is
 * exclusive.
 */
export async function loadCalendarItems(
  supabase: SupabaseClient,
  rangeStart: string,
  rangeEnd: string,
): Promise<CalendarItem[]> {
  // Staff name lookup for event assignees (jobs join their own).
  const { data: staffRows } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('role', ['field_worker', 'manager', 'admin'])
  const nameById = new Map<string, string>(
    (staffRows ?? []).map((s) => [s.id as string, (s.full_name as string) || 'Unnamed']),
  )

  const { data: eventRows } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('starts_at', rangeStart)
    .lt('starts_at', rangeEnd)
    .order('starts_at', { ascending: true })

  // Installation working days. Jobs with slots are rendered from these; the
  // bare scheduled_date query below skips them so nothing shows twice.
  const { data: slotRows } = await supabase
    .from('job_schedule_slots')
    .select('id, job_id, starts_at, ends_at, assigned_to, crew_id, job:jobs(title, stage, assigned_to, crew_id, site:sites(name, address))')
    .gte('starts_at', rangeStart)
    .lt('starts_at', rangeEnd)
    .order('starts_at', { ascending: true })

  const slots = ((slotRows ?? []) as unknown as SlotRow[])
    .filter((s) => s.job && s.job.stage !== 'cancelled')
  const slottedJobIds = new Set(slots.map((s) => s.job_id))

  // Day numbering is per job, so "day 2/3" reads right on a multi-day install.
  // Counted over ALL the job's slots, not just the loaded window — otherwise a
  // booking straddling a month boundary renumbers itself as you page around.
  const dayNumberBySlot = new Map<string, { n: number; of: number }>()
  if (slottedJobIds.size > 0) {
    const { data: allRows } = await supabase
      .from('job_schedule_slots')
      .select('id, job_id, starts_at')
      .in('job_id', [...slottedJobIds])
      .order('starts_at', { ascending: true })
    const counts = new Map<string, number>()
    for (const r of allRows ?? []) counts.set(r.job_id as string, (counts.get(r.job_id as string) ?? 0) + 1)
    const seen = new Map<string, number>()
    for (const r of allRows ?? []) {
      const jobId = r.job_id as string
      const n = (seen.get(jobId) ?? 0) + 1
      seen.set(jobId, n)
      dayNumberBySlot.set(r.id as string, { n, of: counts.get(jobId) ?? 1 })
    }
  }

  // Crew names for the booked days — the slot's own crew, else the job's
  // (migration 117). One lookup for the whole window.
  const crewIds = new Set(
    slots.map((s) => s.crew_id ?? s.job?.crew_id ?? null).filter((id): id is string => !!id),
  )
  const crewNameById = new Map<string, string>()
  if (crewIds.size > 0) {
    const { data: crewRows } = await supabase.from('crews').select('id, name').in('id', [...crewIds])
    for (const c of crewRows ?? []) crewNameById.set(c.id as string, c.name as string)
  }

  const slotItems = slots.map((s) => {
    const pos = dayNumberBySlot.get(s.id) ?? { n: 1, of: 1 }
    const assignee = s.assigned_to ?? s.job?.assigned_to ?? null
    const crewId = s.crew_id ?? s.job?.crew_id ?? null
    return slotToItem(
      s,
      pos.n,
      pos.of,
      assignee ? nameById.get(assignee) ?? null : null,
      crewId ? crewNameById.get(crewId) ?? null : null,
    )
  })

  const startDate = rangeStart.slice(0, 10)
  const endDate = rangeEnd.slice(0, 10)
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('id, title, scheduled_date, stage, assigned_to, site:sites(name, address), assignee:user_profiles!jobs_assigned_to_fkey(full_name)')
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', startDate)
    .lt('scheduled_date', endDate)
    .not('stage', 'in', '(cancelled)')

  const events = (eventRows ?? []).map((e) =>
    eventToItem(e as CalendarEvent, e.assigned_to ? nameById.get(e.assigned_to as string) ?? null : null),
  )
  const jobs = (jobRows ?? [])
    .filter((j) => !slottedJobIds.has(j.id as string))
    .map((j) => jobToItem(j as unknown as JobRow))

  return [...events, ...slotItems, ...jobs].sort((a, b) => a.start.localeCompare(b.start))
}
