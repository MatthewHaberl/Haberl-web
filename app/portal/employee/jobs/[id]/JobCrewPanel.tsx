'use client'

// ─────────────────────────────────────────────────────────────────────────────
// The crew on this job, and what its labour is costing (migration 117).
//
// Picking a crew here is the "choose once": every booked day inherits it, so
// nobody re-picks four people every morning. The readout underneath is the
// reason the loop is worth closing — quoted labour against the hours actually
// confirmed, which is the only place the business finds out whether its
// labour rates are right.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Crown, HardHat, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import {
  actualLabour,
  crewHourlyCostR,
  labourVariance,
  type CrewWithPeople,
  type JobTimeEntry,
  type QuotedLabour,
} from '@/lib/crews/crews'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hoursText = (n: number) => `${n.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} h`

export function JobCrewPanel({
  jobId,
  crewId,
  crews,
  entries,
  quoted,
  canEdit,
}: {
  jobId: string
  crewId: string | null
  crews: CrewWithPeople[]
  entries: JobTimeEntry[]
  quoted: QuotedLabour | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const crew = crews.find((c) => c.id === crewId) ?? null
  const actual = actualLabour(entries)
  // Only crew-priced quotes know a real wage cost — see loadQuotedLabour.
  const variance = quoted?.fromCrew ? labourVariance(quoted, actual) : null

  async function assign(next: string) {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('jobs')
      .update({ crew_id: next || null })
      .eq('id', jobId)
    setBusy(false)
    if (dbError) setError(dbError.message)
    else router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle className="text-base">Crew</CardTitle>
          <span className="text-xs text-muted-foreground">
            {crew
              ? `${crew.people.length} ${crew.people.length === 1 ? 'person' : 'people'} · ${rand(crewHourlyCostR(crew.people))}/hr in wages`
              : 'Nobody assigned'}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {canEdit ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:max-w-sm">
            Crew on this job
            <Select value={crewId ?? ''} disabled={busy} onChange={(e) => assign(e.target.value)}>
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
        ) : (
          <p className="text-sm">{crew ? crew.name : 'No crew assigned to this job.'}</p>
        )}

        {busy && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {crew && crew.people.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {crew.people.map((p) => (
              <li
                key={p.staffId}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
              >
                {p.role === 'leader' && <Crown className="h-3 w-3 text-accent" aria-label="Crew leader" />}
                {p.name}
              </li>
            ))}
          </ul>
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

        {/* ── Quoted vs actual ────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Hours booked" value={hoursText(actual.hours)} />
            <Figure label="Wages so far" value={rand(actual.costR)} />
            {variance ? (
              <>
                <Figure label="Quoted wages" value={rand(variance.quotedCostR)} sub={hoursText(variance.quotedHours)} />
                <Figure
                  label={variance.overrunR > 0 ? 'Over the quote' : 'Under the quote'}
                  value={rand(Math.abs(variance.overrunR))}
                  tone={variance.overrunR > 0 ? 'bad' : 'good'}
                  sub={`Labour billed ${rand(variance.quotedSellR)}`}
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
              No hours logged yet. Confirm a booked day below and every person on the crew gets
              a timesheet entry at their own rate.
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
