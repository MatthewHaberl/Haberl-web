'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CalendarPlus, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import {
  DEFAULT_WORKING_HOURS,
  WORKING_HOURS_KEY,
  dayLabel,
  fillRange,
  scheduleSummary,
  slotHours,
  slotToDraft,
  sortDrafts,
  toISO,
  totalHours,
  validateDrafts,
  type SlotDraft,
  type WorkingHours,
} from '@/lib/jobs/schedule'
import type { JobScheduleSlot } from '@/types/database'

interface StaffOption { id: string; full_name: string }

/**
 * Books a job across as many days as it actually takes, each day between set
 * hours. Saving replaces the job's slots wholesale (delete removed, upsert the
 * rest) — small sets, and it keeps the editor and the DB honest.
 * jobs.scheduled_date follows the first day automatically (migration 106).
 */
export function SchedulePanel({
  jobId,
  initialSlots,
  staff,
  defaultAssignee,
  canEdit,
}: {
  jobId: string
  initialSlots: JobScheduleSlot[]
  staff: StaffOption[]
  defaultAssignee: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const supabase = createClient()

  const serverSaved = useMemo(() => sortDrafts(initialSlots.map(slotToDraft)), [initialSlots])
  // After a save, the upsert result (with real row ids) becomes the baseline
  // immediately — router.refresh() catches the server copy up moments later.
  const [baseline, setBaseline] = useState<SlotDraft[] | null>(null)
  const saved = baseline ?? serverSaved
  const [slots, setSlots] = useState<SlotDraft[]>(saved)
  const [hours, setHours] = useState<WorkingHours>(DEFAULT_WORKING_HOURS)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Working hours are a habit, not job data — remember the last ones used.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORKING_HOURS_KEY)
      // Client-only preference — reading it during render would mismatch SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off hydration of a stored preference
      if (raw) setHours({ ...DEFAULT_WORKING_HOURS, ...JSON.parse(raw) })
    } catch { /* first run, or storage blocked */ }
  }, [])

  function updateHours(next: WorkingHours) {
    setHours(next)
    try { localStorage.setItem(WORKING_HOURS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const dirty = useMemo(
    () => JSON.stringify(slots) !== JSON.stringify(saved),
    [slots, saved],
  )

  function addRange() {
    setError(null)
    const start = from || to
    const end = to || from
    if (!start) { setError('Pick a date to book from.'); return }
    setSlots(fillRange(slots, start, end, hours, defaultAssignee))
    setFrom('')
    setTo('')
  }

  function addDay() {
    const last = slots[slots.length - 1]
    const next = last ? new Date(`${last.date}T00:00`) : new Date()
    if (last) next.setDate(next.getDate() + 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
    setSlots(sortDrafts([
      ...slots,
      { id: null, date, start: hours.start, end: hours.end, assignedTo: defaultAssignee, notes: null },
    ]))
  }

  function patch(index: number, changes: Partial<SlotDraft>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...changes } : s)))
  }

  function removeAt(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index))
  }

  async function save() {
    setError(null)
    const problem = validateDrafts(slots)
    if (problem) { setError(problem); return }
    setBusy(true)

    const keptIds = new Set(slots.map((s) => s.id).filter(Boolean) as string[])
    const removed = saved.filter((s) => s.id && !keptIds.has(s.id)).map((s) => s.id as string)

    try {
      // Upsert FIRST, delete after: if the upsert fails nothing has been
      // deleted, and if the delete fails the extra rows are still visible and
      // a retry cleans them up. Never delete-then-fail into lost days.
      const rows = sortDrafts(slots).map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        job_id: jobId,
        starts_at: toISO(s.date, s.start),
        ends_at: toISO(s.date, s.end),
        assigned_to: s.assignedTo,
        notes: s.notes,
      }))
      let upserted: JobScheduleSlot[] = []
      if (rows.length > 0) {
        const { data, error: upError } = await supabase
          .from('job_schedule_slots')
          .upsert(rows)
          .select('*')
        if (upError) throw upError
        upserted = (data as JobScheduleSlot[]) ?? []
      }
      // Adopt the returned ids straight away so a retry after a delete failure
      // updates these rows instead of inserting them again.
      const upsertedDrafts = sortDrafts(upserted.map(slotToDraft))
      setSlots(upsertedDrafts)

      if (removed.length > 0) {
        const { error: delError } = await supabase.from('job_schedule_slots').delete().in('id', removed)
        if (delError) throw delError
      }

      setBaseline(upsertedDrafts)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the schedule.')
    } finally {
      setBusy(false)
    }
  }

  const summary = scheduleSummary(saved)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Schedule</CardTitle>
          <span className="text-xs text-muted-foreground">{summary ?? 'Not booked yet'}</span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {canEdit && (
          <div className="rounded-lg border border-border p-3 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Book days</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                From
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                To (blank = one day)
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Start time
                <Input type="time" value={hours.start} onChange={(e) => updateHours({ ...hours, start: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                End time
                <Input type="time" value={hours.end} onChange={(e) => updateHours({ ...hours, end: e.target.value })} />
              </label>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={hours.skipWeekends}
                  onChange={(e) => updateHours({ ...hours, skipWeekends: e.target.checked })}
                />
                Skip weekends
              </label>
              <Button type="button" size="sm" onClick={addRange}>
                <CalendarPlus className="h-3.5 w-3.5" /> Add these days
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={addDay}>
                <Plus className="h-3.5 w-3.5" /> Add a day
              </Button>
            </div>
          </div>
        )}

        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No days booked. Pick a date range and the hours the crew is on site.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {slots.map((slot, i) => (
              <div
                key={slot.id ?? `new-${i}`}
                className="grid gap-2 sm:grid-cols-[1fr_auto_auto_1fr_auto] sm:items-center rounded-lg border border-border p-2"
              >
                <div className="flex flex-col">
                  <Input
                    type="date"
                    value={slot.date}
                    disabled={!canEdit}
                    onChange={(e) => patch(i, { date: e.target.value })}
                  />
                  <span className="text-[11px] text-muted-foreground pl-1 pt-0.5">
                    Day {i + 1} · {dayLabel(slot.date)}
                  </span>
                </div>
                <Input
                  type="time"
                  value={slot.start}
                  disabled={!canEdit}
                  onChange={(e) => patch(i, { start: e.target.value })}
                />
                <Input
                  type="time"
                  value={slot.end}
                  disabled={!canEdit}
                  onChange={(e) => patch(i, { end: e.target.value })}
                />
                <Select
                  value={slot.assignedTo ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => patch(i, { assignedTo: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </Select>
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-xs text-muted-foreground tabular-nums">{slotHours(slot).toFixed(1)}h</span>
                  {canEdit && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeAt(i)} aria-label="Remove this day">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pl-1">
              {slots.length} {slots.length === 1 ? 'day' : 'days'} · {totalHours(slots).toFixed(1)}h on site
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button type="button" onClick={save} disabled={busy || !dirty}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save schedule
            </Button>
            {dirty && !busy && (
              <Button type="button" variant="ghost" onClick={() => { setSlots(saved); setError(null) }}>
                Discard
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
