'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Build and edit crews. Writes go through the browser Supabase client (RLS:
// managers and admins) — the house pattern, same as StaffDirectory.
//
// The cost readout is the reason this page is worth visiting: it says what an
// hour and a nine-hour day of each team costs in wages, which is the number
// every quoted day rate should be built from.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Crown, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  crewDayCostR,
  crewHourlyCostR,
  unratedCrewPeople,
  type CrewWithPeople,
} from '@/lib/crews/crews'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The standard day the cost readout quotes — the same nine hours payroll uses. */
const DAY_HOURS = 9

interface StaffOption {
  id: string
  full_name: string
  job_title: string | null
  cost_rate_r: number
  pay_type: 'hourly' | 'piece'
}

interface Draft {
  id: string | null
  name: string
  notes: string
  active: boolean
}

export function CrewManager({
  crews,
  staff,
  openJobs,
}: {
  crews: CrewWithPeople[]
  staff: StaffOption[]
  /** crew id → open jobs currently on that crew. */
  openJobs: Record<string, number>
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  const visible = crews.filter((c) => showRetired || c.active)
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  async function saveCrew() {
    if (!draft) return
    if (!draft.name.trim()) {
      setError('Give the crew a name.')
      return
    }
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const payload = {
      name: draft.name.trim(),
      notes: draft.notes.trim() || null,
      active: draft.active,
    }
    const { error: dbError } = draft.id
      ? await supabase.from('crews').update(payload).eq('id', draft.id)
      : await supabase.from('crews').insert(payload)
    setBusy(false)
    if (dbError) {
      // The unique index on live crew names is the likeliest failure here.
      setError(
        dbError.code === '23505'
          ? 'There is already a crew with that name.'
          : dbError.message,
      )
      return
    }
    setDraft(null)
    router.refresh()
  }

  async function addMember(crewId: string, staffId: string, sortOrder: number) {
    if (!staffId) return
    setError(null)
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('crew_members')
      .insert({ crew_id: crewId, staff_id: staffId, role: 'member', sort_order: sortOrder })
    if (dbError) setError(dbError.message)
    else router.refresh()
  }

  async function removeMember(crewId: string, staffId: string) {
    setError(null)
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('crew_members')
      .delete()
      .eq('crew_id', crewId)
      .eq('staff_id', staffId)
    if (dbError) setError(dbError.message)
    else router.refresh()
  }

  /** Promote someone to leader — the old leader steps down first (one per crew). */
  async function makeLeader(crew: CrewWithPeople, staffId: string) {
    setError(null)
    const supabase = createClient()
    const current = crew.people.find((p) => p.role === 'leader')
    if (current) {
      const { error: stepDown } = await supabase
        .from('crew_members')
        .update({ role: 'member' })
        .eq('crew_id', crew.id)
        .eq('staff_id', current.staffId)
      if (stepDown) {
        setError(stepDown.message)
        return
      }
    }
    const { error: dbError } = await supabase
      .from('crew_members')
      .update({ role: 'leader' })
      .eq('crew_id', crew.id)
      .eq('staff_id', staffId)
    if (dbError) setError(dbError.message)
    else router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Show retired crews
        </label>
        <Button
          type="button"
          size="sm"
          onClick={() => setDraft({ id: null, name: '', notes: '', active: true })}
        >
          <Plus className="mr-2 h-4 w-4" />
          New crew
        </Button>
      </div>

      {draft && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary">
                {draft.id ? 'Edit crew' : 'New crew'}
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Crew name" htmlFor="crew-name" required>
                <Input
                  id="crew-name"
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Install team A"
                />
              </FormField>
              <FormField label="Notes" htmlFor="crew-notes" hint="What this crew is for — install, service, standby.">
                <Textarea
                  id="crew-notes"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              </FormField>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => set({ active: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Still working
              </label>
              <div className="flex items-center gap-2">
                {error && <span className="text-xs text-destructive">{error}</span>}
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveCrew} disabled={busy}>
                  {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Create crew'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && !draft && <p className="text-sm text-destructive">{error}</p>}

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="mb-1 font-medium text-foreground">No crews yet</p>
            <p>
              Build the teams that actually travel together. You then pick a crew once on a
              job instead of naming everybody on every booked day.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((crew) => {
            const onCrew = new Set(crew.people.map((p) => p.staffId))
            const spare = staff.filter((s) => !onCrew.has(s.id))
            const unrated = unratedCrewPeople(crew.people)
            const jobs = openJobs[crew.id] ?? 0

            return (
              <Card key={crew.id} className={crew.active ? undefined : 'opacity-70'}>
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{crew.name}</h3>
                        {!crew.active && <Badge variant="outline">Retired</Badge>}
                        {jobs > 0 && (
                          <Badge variant="default">{jobs} open {jobs === 1 ? 'job' : 'jobs'}</Badge>
                        )}
                      </div>
                      {crew.notes && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{crew.notes}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDraft({
                          id: crew.id,
                          name: crew.name,
                          notes: crew.notes ?? '',
                          active: crew.active,
                        })
                      }
                      aria-label={`Edit ${crew.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {crew.people.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nobody on this crew yet.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {crew.people.map((p) => (
                        <li
                          key={p.staffId}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {p.role === 'leader' && (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Crew leader" />
                            )}
                            <span className="truncate font-medium">{p.name}</span>
                            {p.jobTitle && (
                              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                                · {p.jobTitle}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {p.payType === 'piece'
                                ? 'piece work'
                                : p.costRateR > 0
                                  ? `${rand(p.costRateR)}/hr`
                                  : 'no rate'}
                            </span>
                            {p.role !== 'leader' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => makeLeader(crew, p.staffId)}
                                title="Make crew leader"
                                aria-label={`Make ${p.name} crew leader`}
                              >
                                <Crown className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMember(crew.id, p.staffId)}
                              aria-label={`Remove ${p.name} from ${crew.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {spare.length > 0 && (
                    <Select
                      className="h-9 text-sm"
                      value=""
                      onChange={(e) => addMember(crew.id, e.target.value, crew.people.length)}
                      aria-label={`Add someone to ${crew.name}`}
                    >
                      <option value="">Add someone…</option>
                      {spare.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                          {s.pay_type === 'piece'
                            ? ' — piece work'
                            : s.cost_rate_r > 0
                              ? ` — ${rand(s.cost_rate_r)}/hr`
                              : ' — no rate set'}
                        </option>
                      ))}
                    </Select>
                  )}

                  {crew.people.length > 0 && (
                    <div className="rounded-md bg-muted/50 p-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Wages per hour on site</span>
                        <span className="tabular-nums">{rand(crewHourlyCostR(crew.people))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          A {DAY_HOURS}-hour day
                        </span>
                        <span className="font-medium tabular-nums">
                          {rand(crewDayCostR(crew.people, DAY_HOURS))}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Cost to you, before markup — what a quoted day rate has to beat.
                      </p>
                    </div>
                  )}

                  {unrated.length > 0 && (
                    <p className="text-[11px] text-warning">
                      {unrated.map((p) => p.name).join(', ')}{' '}
                      {unrated.length === 1 ? 'has' : 'have'} no cost rate — they quote and cost R0.
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {staff.length === 0 && (
        <p className="text-sm text-muted-foreground">
          <UserPlus className="mr-1 inline h-4 w-4" />
          Add people under Staff first — a crew is built from them.
        </p>
      )}
    </div>
  )
}
