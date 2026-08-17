'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Crew pricing for a quote — the "put my staff on this job" mode.
//
// Pick people from the staff directory, say how long each is on site, and the
// panel prices them at their real cost rate × a markup you control. What the
// CUSTOMER sees is a single line reading "Labour" and one total; the names,
// hours and rates never leave this panel (scope-bom.ts collapses them, and
// lib/quotes/__tests__/scope-crew.test.ts holds that line).
//
// The margin readout is the point of the exercise — it's the only place in the
// quote builder where labour shows what it actually costs.
// ─────────────────────────────────────────────────────────────────────────────

import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  convertCrewUnit,
  crewCostR,
  crewLineSellR,
  crewSellR,
  crewUnitSellR,
  CREW_HOURS_PER_DAY,
  newCrewLine,
  type QuoteScope,
  type ScopeCrewLine,
} from '@/lib/quotes/scope'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
  /** Company markup — the starting point for a new crew line. */
  defaultMarkup: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [picking, setPicking] = useState('')

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

  const crew = scope.labour.crew
  const setCrew = (next: ScopeCrewLine[]) =>
    onChange((s) => ({ ...s, labour: { ...s.labour, crew: next } }))

  const patch = (id: string, p: Partial<ScopeCrewLine>) =>
    setCrew(crew.map((c) => (c.id === id ? { ...c, ...p } : c)))

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
        qty: CREW_HOURS_PER_DAY,
        unit: 'hr',
      }),
    ])
    setPicking('')
  }

  function addBlank() {
    setCrew([...crew, newCrewLine({ name: '', markup: defaultMarkup, qty: CREW_HOURS_PER_DAY, unit: 'hr' })])
  }

  const cost = crewCostR(scope.labour)
  const sell = crewSellR(scope.labour)
  const marginR = sell - cost
  const marginPct = sell > 0 ? (marginR / sell) * 100 : 0

  const num = (v: string) => Math.max(0, Number(v) || 0)
  const unpriced = crew.filter((c) => c.costR <= 0 && (c.sellR ?? 0) <= 0).length

  return (
    <div className="space-y-3">
      {crew.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Add the people on this job. They price at their cost rate × your markup, and the customer
          sees one &ldquo;Labour&rdquo; line with the total only.
        </p>
      ) : (
        <div className="space-y-2">
          {crew.map((c) => (
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

              <div className="grid grid-cols-2 gap-1.5">
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
                <label className="space-y-0.5 text-[10px] text-muted-foreground">
                  Unit
                  <Select
                    className="h-8 text-xs"
                    value={c.unit}
                    onChange={(e) => {
                      // Convert, don't just relabel: the rate came from the
                      // staff directory in R/hr.
                      const next = convertCrewUnit(c, e.target.value as ScopeCrewLine['unit'])
                      patch(c.id, { unit: next.unit, costR: next.costR, sellR: next.sellR })
                    }}
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
                <label className="col-span-2 space-y-0.5 text-[10px] text-muted-foreground">
                  Bill at {PER_UNIT[c.unit]} (leave blank to follow the markup)
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
                  {rand(crewUnitSellR(c))} × {c.qty || 0}
                </span>
                <span className="font-medium">{rand(crewLineSellR(c))}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
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
