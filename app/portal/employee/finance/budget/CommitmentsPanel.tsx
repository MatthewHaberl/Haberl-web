'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import {
  CADENCES, CADENCE_LABEL, monthlyEquivalentCents, randToCents,
  type BudgetCommitment, type BudgetCategory, type Cadence, type BudgetScope,
} from '@/lib/finance/budget'
import { budgetMutate } from './actions'
import { Plus, Trash2, Pencil } from 'lucide-react'

export function CommitmentsPanel({
  commitments, categories,
}: {
  commitments: BudgetCommitment[]
  categories: BudgetCategory[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  const active = commitments.filter((c) => c.active)
  const monthlyBusiness = active.filter((c) => c.scope === 'business').reduce((s, c) => s + monthlyEquivalentCents(c.amount_cents, c.cadence), 0)
  const monthlyPersonal = active.filter((c) => c.scope === 'personal').reduce((s, c) => s + monthlyEquivalentCents(c.amount_cents, c.cadence), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Business — monthly equivalent</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(monthlyBusiness)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Personal — monthly equivalent</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(monthlyPersonal)}</div>
        </CardContent></Card>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Recurring commitments</h3>
            <Button size="sm" variant="outline" onClick={() => { setAdding((v) => !v); setEditId(null) }}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {adding && <CommitmentForm categories={categories} busy={busy}
            onCancel={() => setAdding(false)}
            onSave={(data) => run(() => budgetMutate({ resource: 'commitment', op: 'create', data })).then(() => setAdding(false))} />}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Scope</th>
                  <th className="px-4 py-2 font-medium">Cadence</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 text-right font-medium">/ month</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {commitments.map((c) => editId === c.id ? (
                  <tr key={c.id}><td colSpan={7} className="p-0">
                    <CommitmentForm categories={categories} busy={busy} initial={c}
                      onCancel={() => setEditId(null)}
                      onSave={(data) => run(() => budgetMutate({ resource: 'commitment', op: 'update', id: c.id, data })).then(() => setEditId(null))} />
                  </td></tr>
                ) : (
                  <tr key={c.id} className={`border-b border-border/60 ${c.active ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-2.5 font-medium">{c.name}{c.note && <div className="text-xs font-normal text-muted-foreground">{c.note}</div>}</td>
                    <td className="px-4 py-2.5 capitalize">{c.scope}</td>
                    <td className="px-4 py-2.5">{CADENCE_LABEL[c.cadence]}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.due_day ? `Day ${c.due_day}` : c.next_due ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(c.amount_cents)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(monthlyEquivalentCents(c.amount_cents, c.cadence))}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" disabled={busy} onClick={() => run(() => budgetMutate({ resource: 'commitment', op: 'update', id: c.id, data: { active: !c.active } }))}
                          className="text-xs text-muted-foreground hover:text-foreground">{c.active ? 'Pause' : 'Resume'}</button>
                        <button type="button" disabled={busy} onClick={() => { setEditId(c.id); setAdding(false) }} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={busy} onClick={() => run(() => budgetMutate({ resource: 'commitment', op: 'delete', id: c.id }))} className="text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {commitments.length === 0 && !adding && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No commitments yet — add your recurring costs so nothing surprises you.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CommitmentForm({
  categories, busy, initial, onSave, onCancel,
}: {
  categories: BudgetCategory[]
  busy: boolean
  initial?: BudgetCommitment
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial ? (initial.amount_cents / 100).toString() : '')
  const [scope, setScope] = useState<BudgetScope>(initial?.scope ?? 'business')
  const [cadence, setCadence] = useState<Cadence>(initial?.cadence ?? 'monthly')
  const [dueDay, setDueDay] = useState(initial?.due_day?.toString() ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const [note, setNote] = useState(initial?.note ?? '')

  function save() {
    const cents = randToCents(amount)
    if (!name.trim() || cents == null) return
    onSave({
      name: name.trim(), amount_cents: cents, scope, cadence,
      due_day: dueDay ? Number(dueDay) : null,
      category_id: categoryId || null, note: note || null,
    })
  }

  const scopedCats = categories.filter((c) => c.scope === scope)

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/30 px-4 py-3">
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Moove gym" className="w-44" /></Field>
      <Field label="Amount"><Input value={amount} onChange={(e) => setAmount(e.target.value)} leadingText="R" inputMode="decimal" placeholder="0.00" className="w-32" /></Field>
      <Field label="Scope">
        <Select value={scope} onChange={(e) => { setScope(e.target.value as BudgetScope); setCategoryId('') }} className="w-32">
          <option value="business">Business</option><option value="personal">Personal</option>
        </Select>
      </Field>
      <Field label="Cadence">
        <Select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className="w-32">
          {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      </Field>
      <Field label="Due day"><Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} inputMode="numeric" placeholder="1–31" className="w-20" /></Field>
      <Field label="Budget line">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-44">
          <option value="">(none)</option>
          {scopedCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" className="w-40" /></Field>
      <Button size="sm" disabled={busy} onClick={save}>Save</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
