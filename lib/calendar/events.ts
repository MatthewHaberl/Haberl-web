import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarEventStatus,
} from '@/types/database'

/**
 * The calendar overlays two sources:
 *   1. calendar_events — the new appointments layer (migration 085)
 *   2. jobs.scheduled_date — installations, read-only (no double entry)
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
  const jobs = (jobRows ?? []).map((j) => jobToItem(j as unknown as JobRow))

  return [...events, ...jobs].sort((a, b) => a.start.localeCompare(b.start))
}
