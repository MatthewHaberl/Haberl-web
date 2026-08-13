import type { JobScheduleSlot } from '@/types/database'

/**
 * Multi-day job scheduling (migration 106).
 *
 * A job is booked as one slot per working day, each with its own hours. These
 * helpers turn a date range + working hours into slots, and back again for the
 * editor. Everything is local (SAST) time — the slots themselves are stored as
 * timestamptz.
 */

/** Default site hours when nothing else is chosen. */
export const DEFAULT_START_TIME = '07:00'
export const DEFAULT_END_TIME = '16:00'

/** localStorage key for the user's remembered working hours. */
export const WORKING_HOURS_KEY = 'haberl.workingHours'

export interface WorkingHours {
  start: string
  end: string
  /** Skip Saturday/Sunday when filling a range. */
  skipWeekends: boolean
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: DEFAULT_START_TIME,
  end: DEFAULT_END_TIME,
  skipWeekends: true,
}

/** A slot as the editor holds it: a bare date plus HH:MM times. */
export interface SlotDraft {
  /** Existing row id, or null for a slot that hasn't been saved yet. */
  id: string | null
  date: string  // YYYY-MM-DD
  start: string // HH:MM
  end: string   // HH:MM
  assignedTo: string | null
  notes: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function timeKey(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Local ISO for a date + HH:MM, as the DB wants it. */
export function toISO(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}`).toISOString()
}

export function slotToDraft(slot: JobScheduleSlot): SlotDraft {
  const s = new Date(slot.starts_at)
  const e = new Date(slot.ends_at)
  return {
    id: slot.id,
    date: dateKey(s),
    start: timeKey(s),
    end: timeKey(e),
    assignedTo: slot.assigned_to,
    notes: slot.notes,
  }
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

/**
 * Every working day from `from` to `to` inclusive, honouring skipWeekends.
 * Returns [] if the range is inverted.
 */
export function workingDaysBetween(from: string, to: string, skipWeekends: boolean): string[] {
  if (!from || !to || to < from) return []
  const days: string[] = []
  const cursor = new Date(`${from}T00:00`)
  const last = new Date(`${to}T00:00`)
  // A guard, not a policy: a fat-fingered year shouldn't spin forever.
  for (let i = 0; cursor <= last && i < 400; i++) {
    if (!skipWeekends || !isWeekend(cursor)) days.push(dateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/**
 * Fill a date range with slots at the given hours. Days that already have a
 * slot keep their own hours — re-filling a range extends the booking without
 * flattening the days the user already tuned.
 */
export function fillRange(
  existing: SlotDraft[],
  from: string,
  to: string,
  hours: WorkingHours,
  assignedTo: string | null,
): SlotDraft[] {
  const byDate = new Map(existing.map((s) => [s.date, s]))
  for (const date of workingDaysBetween(from, to, hours.skipWeekends)) {
    if (byDate.has(date)) continue
    byDate.set(date, { id: null, date, start: hours.start, end: hours.end, assignedTo, notes: null })
  }
  return sortDrafts([...byDate.values()])
}

export function sortDrafts(drafts: SlotDraft[]): SlotDraft[] {
  return [...drafts].sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)))
}

/** Hours in one slot, as a decimal. */
export function slotHours(slot: Pick<SlotDraft, 'start' | 'end'>): number {
  const [sh, sm] = slot.start.split(':').map(Number)
  const [eh, em] = slot.end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60)
}

export function totalHours(slots: SlotDraft[]): number {
  return slots.reduce((sum, s) => sum + slotHours(s), 0)
}

/** First problem with a set of drafts, or null when they're bookable. */
export function validateDrafts(slots: SlotDraft[]): string | null {
  for (const s of slots) {
    if (!s.date) return 'Every booked day needs a date.'
    if (s.end <= s.start) return `${s.date}: the end time must be after the start time.`
  }
  const seen = new Set<string>()
  for (const s of sortDrafts(slots)) {
    const key = `${s.date}|${s.start}`
    if (seen.has(key)) return `${s.date}: that day is booked twice at the same time.`
    seen.add(key)
  }
  return null
}

/** "Mon 11 Aug" */
export function dayLabel(date: string): string {
  return new Date(`${date}T00:00`).toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

/** "11–13 Aug 2026 · 3 days" style summary for a saved booking. */
export function scheduleSummary(slots: SlotDraft[]): string | null {
  if (slots.length === 0) return null
  const sorted = sortDrafts(slots)
  const first = new Date(`${sorted[0].date}T00:00`)
  const last = new Date(`${sorted[sorted.length - 1].date}T00:00`)
  const fmt = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
  const span = sorted.length === 1 ? fmt(first) : `${fmt(first)} – ${fmt(last)}`
  const days = `${sorted.length} ${sorted.length === 1 ? 'day' : 'days'}`
  return `${span} · ${days} · ${totalHours(sorted).toFixed(1)}h on site`
}
