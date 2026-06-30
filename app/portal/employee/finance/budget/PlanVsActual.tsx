'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { randToCents, type BudgetScope, type BudgetKind } from '@/lib/finance/budget'
import { budgetMutate } from './actions'
import { ChevronLeft, ChevronRight, Plus, Trash2, CopyPlus, AlertTriangle, Check, X } from 'lucide-react'

export interface PlanRow {
  category_id: string
  name: string
  scope: BudgetScope
  kind: BudgetKind
  match_keys: string[]
  planned_cents: number
  prev_planned_cents: number
  bank_cents: number
  manual_cents: number
  manual_entries: { id: string; amount_cents: number; note: string | null }[]
}

export function PlanVsActual({
  month, prevMonth, nextMonth, monthLabel, rows, unbudgeted, companyTags,
}: {
  month: string
  prevMonth: string
  nextMonth: string
  monthLabel: string
  rows: PlanRow[]
  unbudgeted: { category: string; spent_cents: number }[]
  companyTags: string[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  const business = rows.filter((r) => r.scope === 'business')
  const personal = rows.filter((r) => r.scope === 'personal')

  // Categories that have no plan this month but had one last month — fuel for
  // the one-click "copy last month" so a new month starts pre-filled.
  const copyable = rows.filter((r) => r.planned_cents === 0 && r.prev_planned_cents > 0)

  async function copyLastMonth() {
    await run(async () => {
      for (const r of copyable) {
        await budgetMutate({ resource: 'plan', op: 'upsert', data: { category_id: r.category_id, month, planned_cents: r.prev_planned_cents } })
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* month nav */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/portal/employee/finance/budget?view=plan&month=${prevMonth}`}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted">
          <ChevronLeft className="h-4 w-4" /> Prev
        </Link>
        <span className="min-w-44 text-center text-base font-semibold">{monthLabel}</span>
        <Link href={`/portal/employee/finance/budget?view=plan&month=${nextMonth}`}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted">
          Next <ChevronRight className="h-4 w-4" />
        </Link>
        {copyable.length > 0 && (
          <Button variant="outline" size="sm" disabled={busy} onClick={copyLastMonth} className="ml-auto">
            <CopyPlus className="h-4 w-4" /> Copy last month ({copyable.length})
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Group title="Business" rows={business} month={month} busy={busy} run={run} />
      <Group title="Personal" rows={personal} month={month} busy={busy} run={run}
        hint="Personal spend isn't on the business bank feed — log actuals manually with “+ actual”." />

      {/* unbudgeted bank spend */}
      {unbudgeted.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Tagged spend not in any budget line
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              These company tags have spend this month but aren&apos;t mapped to a budget line. Add a line below
              with the matching tag, or these stay invisible to the budget.
            </p>
            <ul className="flex flex-wrap gap-2">
              {unbudgeted.map((u) => (
                <li key={u.category} className="rounded-md border border-border px-2.5 py-1 text-sm">
                  <span className="text-muted-foreground">{u.category}:</span>{' '}
                  <span className="font-medium">{formatCurrency(u.spent_cents)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AddCategory companyTags={companyTags} busy={busy} run={run} />
    </div>
  )
}

function Group({
  title, rows, month, busy, run, hint,
}: {
  title: string
  rows: PlanRow[]
  month: string
  busy: boolean
  run: (fn: () => Promise<unknown>) => Promise<void>
  hint?: string
}) {
  const totalPlanned = rows.reduce((s, r) => s + r.planned_cents, 0)
  const totalActual = rows.reduce((s, r) => s + r.bank_cents + r.manual_cents, 0)
  const totalVar = totalPlanned - totalActual

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">{rows.length} line{rows.length === 1 ? '' : 's'}</span>
        </div>
        {hint && <p className="px-4 pt-2 text-xs text-muted-foreground">{hint}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Planned</th>
                <th className="px-4 py-2 text-right font-medium">Actual</th>
                <th className="px-4 py-2 text-right font-medium">Remaining</th>
                <th className="px-4 py-2 font-medium">Used</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <PlanLine key={r.category_id} row={r} month={month} busy={busy} run={run} />)}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No lines yet.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right">{formatCurrency(totalPlanned)}</td>
                  <td className="px-4 py-2.5 text-right">{formatCurrency(totalActual)}</td>
                  <td className={`px-4 py-2.5 text-right ${totalVar < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {formatCurrency(totalVar)}
                  </td>
                  <td className="px-4 py-2.5" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function PlanLine({
  row, month, busy, run,
}: {
  row: PlanRow
  month: string
  busy: boolean
  run: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(((row.planned_cents) / 100).toString())
  const [addingActual, setAddingActual] = useState(false)
  const [actualVal, setActualVal] = useState('')
  const [actualNote, setActualNote] = useState('')

  const actual = row.bank_cents + row.manual_cents
  const remaining = row.planned_cents - actual
  const pct = row.planned_cents > 0 ? Math.round((actual / row.planned_cents) * 100) : (actual > 0 ? 999 : 0)
  const over = remaining < 0

  async function savePlan() {
    const cents = randToCents(val) ?? 0
    setEditing(false)
    if (cents === row.planned_cents) return
    await run(() => budgetMutate({ resource: 'plan', op: 'upsert', data: { category_id: row.category_id, month, planned_cents: cents } }))
  }

  async function addActual() {
    const cents = randToCents(actualVal)
    if (!cents) return
    setAddingActual(false); setActualVal(''); setActualNote('')
    await run(() => budgetMutate({ resource: 'manual', op: 'create', data: { category_id: row.category_id, month, amount_cents: cents, note: actualNote || null } }))
  }

  return (
    <>
      <tr className="border-b border-border/60 hover:bg-muted/40">
        <td className="px-4 py-2.5">
          <div className="font-medium">{row.name}</div>
          {(row.bank_cents > 0 && row.manual_cents > 0) && (
            <div className="text-xs text-muted-foreground">{formatCurrency(row.bank_cents)} bank + {formatCurrency(row.manual_cents)} manual</div>
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          {editing ? (
            <div className="flex items-center justify-end gap-1">
              <Input autoFocus value={val} onChange={(e) => setVal(e.target.value)} leadingText="R"
                inputMode="decimal" className="h-8 w-28 text-right"
                onKeyDown={(e) => { if (e.key === 'Enter') savePlan(); if (e.key === 'Escape') setEditing(false) }} />
              <button type="button" onClick={savePlan} className="text-emerald-600 hover:opacity-70"><Check className="h-4 w-4" /></button>
              <button type="button" onClick={() => setEditing(false)} className="text-muted-foreground hover:opacity-70"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button type="button" onClick={() => { setVal((row.planned_cents / 100).toString()); setEditing(true) }}
              className="rounded px-2 py-1 tabular-nums hover:bg-muted" title="Click to set the planned amount">
              {row.planned_cents > 0 ? formatCurrency(row.planned_cents) : <span className="text-muted-foreground">— set —</span>}
            </button>
          )}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(actual)}</td>
        <td className={`px-4 py-2.5 text-right tabular-nums ${over ? 'text-destructive' : remaining > 0 ? 'text-emerald-600' : ''}`}>
          {formatCurrency(remaining)}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${over ? 'bg-destructive' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className={`text-xs tabular-nums ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
              {row.planned_cents > 0 ? `${pct}%` : '—'}
            </span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-right">
          <button type="button" disabled={busy} onClick={() => setAddingActual((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground">+ actual</button>
        </td>
      </tr>

      {addingActual && (
        <tr className="bg-muted/30">
          <td colSpan={6} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <Input value={actualVal} onChange={(e) => setActualVal(e.target.value)} leadingText="R" inputMode="decimal"
                placeholder="0.00" className="h-9 w-32" />
              <Input value={actualNote} onChange={(e) => setActualNote(e.target.value)} placeholder="note (optional)" className="h-9 w-56" />
              <Button size="sm" disabled={busy} onClick={addActual}>Add actual spend</Button>
              <span className="text-xs text-muted-foreground">Logs a manual actual for this category this month.</span>
            </div>
            {row.manual_entries.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1">
                {row.manual_entries.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums font-medium">{formatCurrency(m.amount_cents)}</span>
                    {m.note && <span className="text-muted-foreground">— {m.note}</span>}
                    <button type="button" disabled={busy}
                      onClick={() => run(() => budgetMutate({ resource: 'manual', op: 'delete', id: m.id }))}
                      className="text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function AddCategory({
  companyTags, busy, run,
}: {
  companyTags: string[]
  busy: boolean
  run: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<BudgetScope>('business')
  const [tag, setTag] = useState('')

  async function add() {
    if (!name.trim()) return
    const match_keys = scope === 'business' ? (tag ? [tag] : [name.trim()]) : []
    setOpen(false); setName(''); setTag('')
    await run(() => budgetMutate({ resource: 'category', op: 'create', data: { name: name.trim(), scope, match_keys } }))
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add a budget line
      </Button>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing" className="w-48" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Scope</label>
          <Select value={scope} onChange={(e) => setScope(e.target.value as BudgetScope)} className="w-36">
            <option value="business">Business</option>
            <option value="personal">Personal</option>
          </Select>
        </div>
        {scope === 'business' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Rolls up bank tag</label>
            <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-52">
              <option value="">(same as name)</option>
              {companyTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
        )}
        <Button size="sm" disabled={busy} onClick={add}>Add</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </CardContent>
    </Card>
  )
}
