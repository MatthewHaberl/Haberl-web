'use client'

// The week's hours: a read-only grid at the top, the editable entry list below.
//
// Every write here snapshots the person's CURRENT cost rate onto the entry
// (cost_rate_r / overtime_multiplier). That is what makes a later raise safe —
// see the header of lib/staff/pay.ts.

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { datesBetween, entryPayR, type TimeEntryCategory } from '@/lib/staff/pay'
import type { TimeEntry } from '@/types/database'
import { rand } from '../shared'

interface StaffLite {
  id: string
  full_name: string
  cost_rate_r: number
  overtime_multiplier: number
}

const CATEGORIES: { value: TimeEntryCategory; label: string }[] = [
  { value: 'work', label: 'On site' },
  { value: 'travel', label: 'Travel' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'standby', label: 'Standby' },
  { value: 'other', label: 'Other' },
]

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' })

interface Draft {
  staff_id: string
  work_date: string
  job_id: string
  hours: string
  overtime_hours: string
  category: TimeEntryCategory
  notes: string
}

export function TimesheetWeek({
  weekStartIso,
  weekEndIso,
  prevWeek,
  nextWeek,
  thisWeek,
  staff,
  jobs,
  entries,
}: {
  weekStartIso: string
  weekEndIso: string
  prevWeek: string
  nextWeek: string
  thisWeek: string
  staff: StaffLite[]
  jobs: { id: string; title: string }[]
  entries: TimeEntry[]
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const days = useMemo(() => datesBetween(weekStartIso, weekEndIso), [weekStartIso, weekEndIso])
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j.title])), [jobs])

  /** hours per person per day, for the grid. */
  const grid = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) {
      const key = `${e.staff_id}|${e.work_date}`
      m.set(key, (m.get(key) ?? 0) + Number(e.hours) + Number(e.overtime_hours))
    }
    return m
  }, [entries])

  const weekCost = entries.reduce((sum, e) => sum + entryPayR(e), 0)
  const weekHours = entries.reduce((sum, e) => sum + Number(e.hours) + Number(e.overtime_hours), 0)
  const unapproved = entries.filter((e) => e.status === 'submitted').length

  function openDraft(staffId: string, date: string) {
    setError(null)
    setDraft({
      staff_id: staffId,
      work_date: date,
      job_id: '',
      hours: '',
      overtime_hours: '',
      category: 'work',
      notes: '',
    })
  }

  async function addEntry() {
    if (!draft) return
    const person = staffById.get(draft.staff_id)
    if (!person) {
      setError('Pick who worked')
      return
    }
    const hours = Math.max(0, Number(draft.hours) || 0)
    const overtime = Math.max(0, Number(draft.overtime_hours) || 0)
    if (hours <= 0 && overtime <= 0) {
      setError('Enter some hours')
      return
    }

    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()

    const { error: dbError } = await supabase.from('time_entries').insert({
      staff_id: draft.staff_id,
      job_id: draft.job_id || null,
      work_date: draft.work_date,
      hours,
      overtime_hours: overtime,
      category: draft.category,
      notes: draft.notes.trim() || null,
      // Rate snapshot — the whole point. See lib/staff/pay.ts.
      cost_rate_r: person.cost_rate_r,
      overtime_multiplier: person.overtime_multiplier,
      source: 'manual',
      status: 'submitted',
      created_by: auth.user?.id ?? null,
    })

    setBusy(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    // Keep the person and day loaded — days are captured in runs.
    setDraft({ ...draft, hours: '', overtime_hours: '', notes: '' })
    router.refresh()
  }

  async function approve(entry: TimeEntry) {
    setBusy(true)
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    await supabase
      .from('time_entries')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: auth.user?.id ?? null,
      })
      .eq('id', entry.id)
    setBusy(false)
    router.refresh()
  }

  async function approveAll() {
    const ids = entries.filter((e) => e.status === 'submitted').map((e) => e.id)
    if (!ids.length) return
    setBusy(true)
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    await supabase
      .from('time_entries')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: auth.user?.id ?? null,
      })
      .in('id', ids)
    setBusy(false)
    router.refresh()
  }

  async function remove(entry: TimeEntry) {
    if (entry.payslip_id) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('time_entries').delete().eq('id', entry.id)
    setBusy(false)
    router.refresh()
  }

  const weekLink = (w: string) => `/portal/employee/staff/timesheet?week=${w}`

  return (
    <>
      {/* Week navigation + the week's totals */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={weekLink(prevWeek)} aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="px-1 text-sm font-semibold">
              {weekStartIso} → {weekEndIso}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={weekLink(nextWeek)} aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            {weekStartIso !== thisWeek && (
              <Button asChild variant="ghost" size="sm">
                <Link href={weekLink(thisWeek)}>This week</Link>
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              Hours <span className="font-semibold text-foreground tabular-nums">{weekHours.toFixed(1)}</span>
            </span>
            <span className="text-muted-foreground">
              Wages <span className="font-semibold text-foreground tabular-nums">{rand(weekCost)}</span>
            </span>
            {unapproved > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={approveAll} disabled={busy}>
                <Check className="mr-2 h-4 w-4" />
                Approve {unapproved}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* The week at a glance. Click a cell to book hours for that person/day. */}
      <Card>
        <CardContent className="pt-6">
          {staff.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Add someone on the{' '}
              <Link href="/portal/employee/staff" className="text-primary hover:underline">
                Staff page
              </Link>{' '}
              before capturing hours.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 text-left font-medium">Person</th>
                    {days.map((d) => (
                      <th key={d} className="pb-2 px-1 text-center font-medium">
                        {dayLabel(d)}
                      </th>
                    ))}
                    <th className="pb-2 pl-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((person) => {
                    const total = days.reduce(
                      (sum, d) => sum + (grid.get(`${person.id}|${d}`) ?? 0),
                      0,
                    )
                    return (
                      <tr key={person.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 font-medium">{person.full_name}</td>
                        {days.map((d) => {
                          const hours = grid.get(`${person.id}|${d}`) ?? 0
                          const selected = draft?.staff_id === person.id && draft?.work_date === d
                          return (
                            <td key={d} className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => openDraft(person.id, d)}
                                className={`w-full rounded-md border px-2 py-1.5 text-xs tabular-nums transition-colors ${
                                  selected
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : hours > 0
                                      ? 'border-border bg-muted/50 font-medium'
                                      : 'border-transparent text-muted-foreground hover:border-primary/40'
                                }`}
                                title={`Book hours for ${person.full_name} on ${d}`}
                              >
                                {hours > 0 ? hours.toFixed(1) : '+'}
                              </button>
                            </td>
                          )
                        })}
                        <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                          {total > 0 ? total.toFixed(1) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capture form — opens pre-filled when a grid cell is clicked. */}
      {draft && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <h3 className="mb-3 text-sm font-semibold text-primary">
              Book hours — {staffById.get(draft.staff_id)?.full_name} · {draft.work_date}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <FormField label="Person" htmlFor="ts-staff">
                <Select
                  id="ts-staff"
                  value={draft.staff_id}
                  onChange={(e) => setDraft({ ...draft, staff_id: e.target.value })}
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Date" htmlFor="ts-date">
                <Input
                  id="ts-date"
                  type="date"
                  value={draft.work_date}
                  onChange={(e) => setDraft({ ...draft, work_date: e.target.value })}
                />
              </FormField>
              <FormField label="Job" htmlFor="ts-job" className="lg:col-span-2">
                <Select
                  id="ts-job"
                  value={draft.job_id}
                  onChange={(e) => setDraft({ ...draft, job_id: e.target.value })}
                >
                  <option value="">No job (workshop, yard, training)</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Hours" htmlFor="ts-hours">
                <Input
                  id="ts-hours"
                  inputMode="decimal"
                  trailingText="hr"
                  value={draft.hours}
                  onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                  placeholder="8"
                />
              </FormField>
              <FormField label="Overtime" htmlFor="ts-ot">
                <Input
                  id="ts-ot"
                  inputMode="decimal"
                  trailingText="hr"
                  value={draft.overtime_hours}
                  onChange={(e) => setDraft({ ...draft, overtime_hours: e.target.value })}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Type" htmlFor="ts-cat">
                <Select
                  id="ts-cat"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as TimeEntryCategory })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Note" htmlFor="ts-notes" className="lg:col-span-5">
                <Input
                  id="ts-notes"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Optional — what was done"
                />
              </FormField>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {error && <span className="mr-auto text-xs text-destructive">{error}</span>}
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Done
              </Button>
              <Button type="button" onClick={addEntry} disabled={busy}>
                <Plus className="mr-2 h-4 w-4" />
                {busy ? 'Saving…' : 'Add hours'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Every entry in the week. */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-sm font-semibold">Entries this week</h2>
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hours booked yet. Click a day in the grid above to start.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Date</th>
                    <th className="pb-2 pr-3 font-medium">Person</th>
                    <th className="pb-2 pr-3 font-medium">Job</th>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 pr-3 text-right font-medium">Hours</th>
                    <th className="pb-2 pr-3 text-right font-medium">OT</th>
                    <th className="pb-2 pr-3 text-right font-medium">Cost</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 tabular-nums">{e.work_date}</td>
                      <td className="py-2 pr-3 font-medium">
                        {staffById.get(e.staff_id)?.full_name ?? 'Unknown'}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {e.job_id ? (jobById.get(e.job_id) ?? 'Job') : '—'}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}
                        {e.source === 'clock' && (
                          <span className="ml-1 text-xs text-accent">· clocked</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{Number(e.hours).toFixed(1)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {Number(e.overtime_hours) > 0 ? Number(e.overtime_hours).toFixed(1) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">
                        {rand(entryPayR(e))}
                      </td>
                      <td className="py-2 pr-3">
                        {e.payslip_id ? (
                          <Badge variant="default">Paid</Badge>
                        ) : e.status === 'approved' ? (
                          <Badge variant="success">Approved</Badge>
                        ) : (
                          <Badge variant="warning">Submitted</Badge>
                        )}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {e.status === 'submitted' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => approve(e)}
                            disabled={busy}
                            title="Approve"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {!e.payslip_id && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(e)}
                            disabled={busy}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
