'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Crew pricing for a quote — the "put my staff on this job" mode.
//
// Pick people from the staff directory, set the shift (how many days, how many
// hours in a day), and the panel prices each person at their real cost rate ×
// a markup you control. What the CUSTOMER sees is a single line reading
// "Labour" and one total; the names, hours and rates never leave this panel
// (scope-bom.ts collapses them, and lib/quotes/__tests__/scope-crew.test.ts
// holds that line).
//
// The shift block is the crew's, not the person's: a 3-day install is entered
// once. Someone who is only there for the first day carries their own `days`;
// everyone else follows the job. `qty` (hours) is still what prices the line —
// the shift block derives it, so the number on screen and the number billed
// cannot drift.
//
// The margin readout is the point of the exercise — it's the only place in the
// quote builder where labour shows what it actually costs.
// ─────────────────────────────────────────────────────────────────────────────

import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { crewToScopeLines, type CrewWithPeople } from '@/lib/crews/crews'
import { loadCrews } from '@/lib/crews/query'
import {
  applyCrewShift,
  convertCrewUnit,
  crewCostR,
  crewLineDays,
  crewLineSellR,
  crewSellR,
  crewUnitSellR,
  newCrewLine,
  type QuoteScope,
  type ScopeCrewLine,
} from '@/lib/quotes/scope'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Trims trailing zeros so 1.5 reads "1,5" and 3 reads "3", not "3,0". */
const qtyText = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 2 })

interface StaffOption {
  id: string
  full_name: string
  job_title: string | null
  cost_rate_r: number
}

const UNITS: { value: ScopeCrewLine['unit']; label: string }[] = [
  { value: 'hr', label: 'hours' },
  { value: 'day', label: 'days' },
  { value: 'job', label: 'job' },
]

/** Rates are meaningless without their unit — every money label carries this. */
const PER_UNIT: Record<ScopeCrewLine['unit'], string> = {
  hr: '/hr',
  day: '/day',
  job: ' per job',
}

export function CrewPanel({
  scope,
  onChange,
  defaultMarkup,
}: {
  scope: QuoteScope
  onChange: Dispatch<SetStateAction<QuoteScope>>
  /** Labour markup (CREW_DEFAULT_MARKUP) — the starting point for a new crew line. */
  defaultMarkup: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [crews, setCrews] = useState<CrewWithPeople[]>([])
  const [picking, setPicking] = useState('')
  const [pickingCrew, setPickingCrew] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('staff')
      .select('id, full_name, job_title, cost_rate_r')
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => {
        if (!cancelled && data) setStaff(data as unknown as StaffOption[])
      })
    return () => {
      cancelled = true
    }
  }, [supabase])

  // The saved crews (migration 117) — picking one drops the whole team onto
  // the quote at their own rates.
  useEffect(() => {
    let cancelled = false
    loadCrews(supabase).then((rows) => {
      if (!cancelled) setCrews(rows)
    })
    return () => {
      cancelled = true
    }
  }, [supabase])

  const labour = scope.labour
  const crew = labour.crew
  const setLabour = (next: QuoteScope['labour']) => onChange((s) => ({ ...s, labour: next }))
  const setCrew = (next: ScopeCrewLine[]) => setLabour({ ...labour, crew: next })

  const patch = (id: string, p: Partial<ScopeCrewLine>) =>
    setCrew(crew.map((c) => (c.id === id ? { ...c, ...p } : c)))

  /** Days changed on one person — their hours follow, nobody else moves. */
  const patchDays = (line: ScopeCrewLine, days: number) =>
    patch(line.id, { days, qty: Math.round(days * labour.crewHoursPerDay * 100) / 100 })

  const setShift = (p: { crewDays?: number; crewHoursPerDay?: number }) =>
    setLabour(applyCrewShift(labour, p))

  function addPerson(staffId: string) {
    const person = staff.find((s) => s.id === staffId)
    if (!person) return
    setCrew([
      ...crew,
      newCrewLine({
        staffId: person.id,
        // Snapshot the name: if this person leaves, the quote still reads right.
        name: person.full_name,
        costR: person.cost_rate_r,
        markup: defaultMarkup,
        // Follows the job's shift until someone says otherwise.
        days: null,
        qty: Math.round(labour.crewDays * labour.crewHoursPerDay * 100) / 100,
        unit: 'hr',
      }),
    ])
    setPicking('')
  }

  function addBlank() {
    setCrew([
      ...crew,
      newCrewLine({
        name: '',
        markup: defaultMarkup,
        days: null,
        qty: Math.round(labour.crewDays * labour.crewHoursPerDay * 100) / 100,
        unit: 'hr',
      }),
    ])
  }

  /**
   * Drop a whole saved crew onto the quote.
   *
   * A COPY, not a link: names and rates land in the quote as they are today,
   * so tomorrow's raise or leaver cannot reprice a quote already sent. Anyone
   * already on the list is skipped rather than doubled.
   */
  function addCrew(crewId: string) {
    const picked = crews.find((c) => c.id === crewId)
    setPickingCrew('')
    if (!picked) return
    const lines = crewToScopeLines(picked.people, {
      days: labour.crewDays,
      hoursPerDay: labour.crewHoursPerDay,
      markup: defaultMarkup,
      existing: crew,
    })
    if (lines.length === 0) return
    setCrew([...crew, ...lines])
  }

  /**
   * Unit change re-expresses the rate (convertCrewUnit) AND the quantity —
   * 27 hours becoming "27 days" would bill nine times the job.
   */
  function changeUnit(line: ScopeCrewLine, unit: ScopeCrewLine['unit']) {
    const converted = convertCrewUnit(line, unit)
    const days = crewLineDays(line, labour)
    const qty =
      unit === 'hr' ? Math.round(days * labour.crewHoursPerDay * 100) / 100
      : unit === 'day' ? days
      : 1
    patch(line.id, { unit: converted.unit, costR: converted.costR, sellR: converted.sellR, qty })
  }

  const cost = crewCostR(labour)
  const sell = crewSellR(labour)
  const marginR = sell - cost
  const marginPct = sell > 0 ? (marginR / sell) * 100 : 0

  const num = (v: string) => Math.max(0, Number(v) || 0)
  const unpriced = crew.filter((c) => c.costR <= 0 && (c.sellR ?? 0) <= 0).length
  const shiftHours = Math.round(labour.crewDays * labour.crewHoursPerDay * 100) / 100

  return (
    <div className="space-y-3">
      {/* ── The shift: entered once for the whole crew ───────────────────── */}
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-2 sm:grid-cols-[10rem_10rem_minmax(0,1fr)] sm:items-end">
        <label className="space-y-0.5 text-[10px] text-muted-foreground">
          Days on site
          <Input
            type="number"
            min={0}
            step="0.5"
            className="h-8 text-xs"
            value={labour.crewDays === 0 ? '' : String(labour.crewDays)}
            onChange={(e) => setShift({ crewDays: num(e.target.value) })}
          />
        </label>
        <label className="space-y-0.5 text-[10px] text-muted-foreground">
          Hours per day
          <Input
            type="number"
            min={0}
            step="0.5"
            className="h-8 text-xs"
            value={labour.crewHoursPerDay === 0 ? '' : String(labour.crewHoursPerDay)}
            onChange={(e) => setShift({ crewHoursPerDay: num(e.target.value) })}
          />
        </label>
        <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-1">
          {qtyText(shiftHours)} hours each. Everyone below follows this unless you
          give them their own days. Payroll pays overtime past 9 hours in a day.
        </p>
      </div>

      {crew.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Add the people on this job — a whole crew at once, or one at a time. They price at
          their cost rate × your markup, and the customer sees one &ldquo;Labour&rdquo; line
          with the total only.
        </p>
      ) : (
        <div className="space-y-2">
          {crew.map((c) => {
            const days = crewLineDays(c, labour)
            return (
              <div key={c.id} className="rounded-md border border-border p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <Input
                    value={c.name}
                    onChange={(e) => patch(c.id, { name: e.target.value })}
                    placeholder="Name or role"
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCrew(crew.filter((x) => x.id !== c.id))}
                    aria-label={`Remove ${c.name || 'crew line'}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                  {c.unit === 'hr' ? (
                    <label className="space-y-0.5 text-[10px] text-muted-foreground">
                      Days on site
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        className="h-8 text-xs"
                        placeholder={qtyText(labour.crewDays)}
                        value={c.days === null ? '' : String(c.days)}
                        onChange={(e) =>
                          e.target.value.trim() === ''
                            ? patch(c.id, {
                                days: null,
                                qty: Math.round(labour.crewDays * labour.crewHoursPerDay * 100) / 100,
                              })
                            : patchDays(c, num(e.target.value))
                        }
                      />
                    </label>
                  ) : (
                    <label className="space-y-0.5 text-[10px] text-muted-foreground">
                      Qty
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="h-8 text-xs"
                        value={c.qty === 0 ? '' : String(c.qty)}
                        onChange={(e) => patch(c.id, { qty: num(e.target.value) })}
                      />
                    </label>
                  )}
                  <label className="space-y-0.5 text-[10px] text-muted-foreground">
                    Charged in
                    <Select
                      className="h-8 text-xs"
                      value={c.unit}
                      onChange={(e) => changeUnit(c, e.target.value as ScopeCrewLine['unit'])}
                    >
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-0.5 text-[10px] text-muted-foreground">
                    Costs me {PER_UNIT[c.unit]}
                    <Input
                      leadingText="R"
                      type="number"
                      min={0}
                      step="any"
                      className="h-8 text-xs"
                      value={c.costR === 0 ? '' : String(c.costR)}
                      onChange={(e) => patch(c.id, { costR: num(e.target.value) })}
                    />
                  </label>
                  <label className="space-y-0.5 text-[10px] text-muted-foreground">
                    Markup
                    <Input
                      trailingText="×"
                      type="number"
                      min={1}
                      step="any"
                      className="h-8 text-xs"
                      value={String(c.markup)}
                      onChange={(e) => patch(c.id, { markup: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="space-y-0.5 text-[10px] text-muted-foreground">
                    Bill at {PER_UNIT[c.unit]}
                    <Input
                      leadingText="R"
                      type="number"
                      min={0}
                      step="any"
                      className="h-8 text-xs"
                      placeholder={String(crewUnitSellR({ ...c, sellR: null }))}
                      value={c.sellR === null ? '' : String(c.sellR)}
                      onChange={(e) =>
                        patch(c.id, {
                          sellR: e.target.value.trim() === '' ? null : num(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {c.unit === 'hr'
                      ? `${qtyText(days)} ${days === 1 ? 'day' : 'days'} × ${qtyText(labour.crewHoursPerDay)} h = ${qtyText(c.qty)} h @ ${rand(crewUnitSellR(c))}/hr`
                      : `${rand(crewUnitSellR(c))} × ${qtyText(c.qty || 0)}`}
                  </span>
                  <span className="font-medium">{rand(crewLineSellR(c))}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {crews.length > 0 && (
          <Select
            className="h-8 w-auto text-xs"
            value={pickingCrew}
            onChange={(e) => addCrew(e.target.value)}
            aria-label="Add a whole crew to this quote"
          >
            <option value="">Add a crew…</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.people.length} {c.people.length === 1 ? 'person' : 'people'}
              </option>
            ))}
          </Select>
        )}
        <Select
          className="h-8 text-xs"
          value={picking}
          onChange={(e) => addPerson(e.target.value)}
          aria-label="Add a staff member to this quote"
        >
          <option value="">Add from staff…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
              {s.cost_rate_r > 0 ? ` — ${rand(s.cost_rate_r)}/hr` : ' — no rate set'}
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={addBlank} title="Add a blank line">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {staff.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          <UserPlus className="mr-1 inline h-3 w-3" />
          Nobody on the staff list yet — add your team under Staff and they&rsquo;ll appear here.
        </p>
      )}
      {staff.length > 0 && crews.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          <Users className="mr-1 inline h-3 w-3" />
          Build a crew under Staff &rsaquo; Crews and you can add the whole team in one pick.
        </p>
      )}
      {unpriced > 0 && (
        <p className="text-[11px] text-warning">
          {unpriced} crew {unpriced === 1 ? 'line has' : 'lines have'} no rate — they bill R0.
        </p>
      )}

      {/* Internal margin. Never rendered on the customer's quote. */}
      {crew.length > 0 && (
        <div className="rounded-md bg-muted/50 p-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Wages (cost to me)</span>
            <span className="tabular-nums">{rand(cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Billed to customer</span>
            <span className="font-medium tabular-nums">{rand(sell)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1">
            <span className="text-muted-foreground">Margin</span>
            <span
              className={`font-semibold tabular-nums ${marginR < 0 ? 'text-destructive' : 'text-success'}`}
            >
              {rand(marginR)} {sell > 0 && `(${marginPct.toFixed(0)}%)`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
