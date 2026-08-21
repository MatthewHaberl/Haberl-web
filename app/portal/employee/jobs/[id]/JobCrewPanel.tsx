'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Who is on this job, and what their labour is costing (migrations 117 + 132).
//
// A crew is the shortcut: one pick and four people land on the roster. The
// roster underneath is the truth, and it can hold anybody — the crew, plus the
// apprentice who is only here for the boards, plus the person the QUOTE priced
// into this job in the first place. Every row says where it came from, because
// that is what decides what a crew change is allowed to overwrite.
//
// The readout at the bottom is the reason the loop is worth closing: quoted
// labour against the hours actually confirmed, which is the only place the
// business finds out whether its labour rates are right.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Crown, HardHat, Loader2, Plus, Sparkles, Trash2, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  actualLabour,
  labourVariance,
  type CrewWithPeople,
  type JobTimeEntry,
  type QuotedLabour,
} from '@/lib/crews/crews'
import {
  SOURCE_LABEL,
  rosterHourlyCostR,
  rosterQuotedHours,
  type RosterPerson,
} from '@/lib/jobs/staff'

/** Someone who could be added to the roster by hand. */
export interface StaffOption {
  id: string
  name: string
  jobTitle: string | null
}

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hoursText = (n: number) => `${n.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} h`

export function JobCrewPanel({
  jobId,
  crewId,
  crews,
  roster,
  allStaff,
  hasQuotedPeople,
  entries,
  quoted,
  canEdit,
}: {
  jobId: string
  crewId: string | null
  crews: CrewWithPeople[]
  /** Everyone currently on this job. */
  roster: RosterPerson[]
  /** The whole staff directory, for adding one person. */
  allStaff: StaffOption[]
  /** The quote priced named people who are not on the roster yet. */
  hasQuotedPeople: boolean
  entries: JobTimeEntry[]
  quoted: QuotedLabour | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [addStaffId, setAddStaffId] = useState('')

  const crew = crews.find((c) => c.id === crewId) ?? null
  const actual = actualLabour(entries)
  // Only crew-priced quotes know a real wage cost — see loadQuotedLabour.
  const variance = quoted?.fromCrew ? labourVariance(quoted, actual) : null
  const quotedHours = rosterQuotedHours(roster)

  const onRoster = new Set(roster.map((p) => p.staffId))
  const addable = allStaff.filter((s) => !onRoster.has(s.id))

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.message) setNotice(data.message)
      else if (typeof data.added === 'number') {
        setNotice(
          data.added === 0
            ? 'Everyone was already on the job.'
            : `${data.added} ${data.added === 1 ? 'person' : 'people'} added.`,
        )
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  /** Adding, removing and promoting one person is a single row — no route needed. */
  async function mutate(label: string, run: () => Promise<{ error: { message: string } | null }>) {
    setBusy(label)
    setError(null)
    setNotice(null)
    const { error: dbError } = await run()
    setBusy(null)
    if (dbError) setError(dbError.message)
    else router.refresh()
  }

  async function addStaff() {
    if (!addStaffId) return
    const supabase = createClient()
    await mutate('add', async () => {
      const { error: dbError } = await supabase.from('job_staff').insert({
        job_id: jobId,
        staff_id: addStaffId,
        role: 'member',
        source: 'manual',
        sort_order: roster.length,
      })
      return { error: dbError }
    })
    setAddStaffId('')
  }

  async function remove(person: RosterPerson) {
    const supabase = createClient()
    await mutate(`remove:${person.staffId}`, async () => {
      const { error: dbError } = await supabase
        .from('job_staff')
        .delete()
        .eq('job_id', jobId)
        .eq('staff_id', person.staffId)
      return { error: dbError }
    })
  }

  /**
   * Promote to leader. The demote comes first: the job has a UNIQUE index on
   * one leader, so promoting while somebody else holds it would just fail.
   */
  async function promote(person: RosterPerson) {
    const supabase = createClient()
    await mutate(`promote:${person.staffId}`, async () => {
      const current = roster.find((p) => p.role === 'leader')
      if (current && current.staffId !== person.staffId) {
        const { error: demoteError } = await supabase
          .from('job_staff')
          .update({ role: 'member' })
          .eq('job_id', jobId)
          .eq('staff_id', current.staffId)
        if (demoteError) return { error: demoteError }
      }
      const { error: dbError } = await supabase
        .from('job_staff')
        .update({ role: 'leader' })
        .eq('job_id', jobId)
        .eq('staff_id', person.staffId)
      return { error: dbError }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle className="text-base">On this job</CardTitle>
          <span className="text-xs text-muted-foreground">
            {roster.length === 0
              ? 'Nobody assigned'
              : `${roster.length} ${roster.length === 1 ? 'person' : 'people'} · ${rand(
                  rosterHourlyCostR(roster),
                )}/hr in wages`}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {canEdit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Crew on this job
              <Select
                value={crewId ?? ''}
                disabled={!!busy}
                onChange={(e) => post({ action: 'assign-crew', crewId: e.target.value || null }, 'crew')}
              >
                <option value="">No crew</option>
                {crews
                  // A retired crew stays selectable only while it is the one on
                  // this job — history keeps working, new work does not pick it.
                  .filter((c) => c.active || c.id === crewId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.active ? '' : ' (retired)'} — {c.people.length}{' '}
                      {c.people.length === 1 ? 'person' : 'people'}
                    </option>
                  ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Add one person
              <div className="flex gap-2">
                <Select
                  value={addStaffId}
                  disabled={!!busy || addable.length === 0}
                  onChange={(e) => setAddStaffId(e.target.value)}
                >
                  <option value="">
                    {addable.length === 0 ? 'Everyone is already on it' : 'Pick somebody…'}
                  </option>
                  {addable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.jobTitle ? ` — ${s.jobTitle}` : ''}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={!addStaffId || !!busy}
                  onClick={addStaff}
                >
                  {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add
                </Button>
              </div>
            </label>
          </div>
        )}

        {canEdit && hasQuotedPeople && (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => post({ action: 'add-quoted' }, 'quoted')}
            >
              {busy === 'quoted' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Bring across the people the quote priced
            </Button>
          </div>
        )}

        {busy === 'crew' && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
        {notice && <p className="text-xs text-success">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* ── The roster ─────────────────────────────────────────────────── */}
        {roster.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {roster.map((p) => (
              <li key={p.staffId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                {p.role === 'leader' && <Crown className="h-3.5 w-3.5 text-accent" aria-label="Leader on site" />}
                <span className="text-sm font-medium">{p.name}</span>
                {p.jobTitle && <span className="text-xs text-muted-foreground">{p.jobTitle}</span>}
                <Badge variant={p.source === 'quoted' ? 'accent' : 'outline'}>
                  {SOURCE_LABEL[p.source]}
                </Badge>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {p.payType === 'piece'
                    ? 'Piece work'
                    : p.costRateR > 0
                      ? `${rand(p.costRateR)}/hr`
                      : 'No rate set'}
                  {p.quotedHours != null && ` · ${hoursText(p.quotedHours)} quoted`}
                </span>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    {p.role !== 'leader' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!!busy}
                        aria-label={`Make ${p.name} the leader on site`}
                        onClick={() => promote(p)}
                      >
                        {busy === `promote:${p.staffId}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Crown className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      aria-label={`Take ${p.name} off this job`}
                      onClick={() => remove(p)}
                    >
                      {busy === `remove:${p.staffId}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserPlus className="h-4 w-4" />
            Nobody is on this job yet. Pick a crew, add one person, or bring across who the quote
            priced — hours are logged against this list.
          </p>
        )}

        {crews.length === 0 && canEdit && (
          <p className="text-xs text-muted-foreground">
            <HardHat className="mr-1 inline h-3 w-3" />
            No crews built yet —{' '}
            <Link href="/portal/employee/staff/crews" className="text-primary hover:underline">
              build one under Staff › Crews
            </Link>{' '}
            and you can assign it here in one pick.
          </p>
        )}
        {crew && crew.people.some((cp) => !roster.some((r) => r.staffId === cp.staffId)) && (
          <p className="text-xs text-muted-foreground">
            Somebody on {crew.name} has been taken off this job. The crew is unchanged — only this
            job&apos;s roster is.
          </p>
        )}

        {/* ── Quoted vs actual ────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Hours booked" value={hoursText(actual.hours)} />
            <Figure label="Wages so far" value={rand(actual.costR)} />
            {variance ? (
              <>
                <Figure
                  label="Quoted wages"
                  value={rand(variance.quotedCostR)}
                  sub={hoursText(variance.quotedHours)}
                />
                <Figure
                  label={variance.overrunR > 0 ? 'Over the quote' : 'Under the quote'}
                  value={rand(Math.abs(variance.overrunR))}
                  tone={variance.overrunR > 0 ? 'bad' : 'good'}
                  sub={`Labour billed ${rand(variance.quotedSellR)}`}
                />
              </>
            ) : quotedHours > 0 ? (
              <>
                <Figure label="Quoted hours" value={hoursText(quotedHours)} sub="From the roster" />
                <Figure
                  label={actual.hours > quotedHours ? 'Over the quote' : 'Left in the quote'}
                  value={hoursText(Math.abs(quotedHours - actual.hours))}
                  tone={actual.hours > quotedHours ? 'bad' : 'good'}
                />
              </>
            ) : (
              <div className="col-span-2 text-xs text-muted-foreground">
                {quoted
                  ? 'The quote priced labour as a lump sum, so there is no wage figure to compare against — only crew-priced quotes carry one.'
                  : 'No quoted labour on file for this job.'}
              </div>
            )}
          </div>
          {entries.length === 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              No hours logged yet. Confirm a booked day below and everyone on this list gets a
              timesheet entry at their own rate.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-success' : ''
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
