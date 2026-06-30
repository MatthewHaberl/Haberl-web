'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { randToCents, type BudgetGoal, type BudgetScope } from '@/lib/finance/budget'
import { budgetMutate } from './actions'
import { Plus, Trash2, Target, Check } from 'lucide-react'

export function GoalsPanel({ goals }: { goals: BudgetGoal[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Savings &amp; targets</h3>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> Add goal</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {adding && <GoalForm busy={busy} onCancel={() => setAdding(false)}
        onSave={(data) => run(() => budgetMutate({ resource: 'goal', op: 'create', data })).then(() => setAdding(false))} />}

      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((g) => <GoalCard key={g.id} goal={g} busy={busy} run={run} />)}
      </div>

      {goals.length === 0 && !adding && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No goals yet — set a target like a tax set-aside or an equipment purchase.
        </CardContent></Card>
      )}
    </div>
  )
}

function GoalCard({
  goal, busy, run,
}: {
  goal: BudgetGoal
  busy: boolean
  run: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const [saved, setSaved] = useState((goal.saved_cents / 100).toString())
  const pct = goal.target_cents > 0 ? Math.min(100, Math.round((goal.saved_cents / goal.target_cents) * 100)) : 0
  const done = goal.saved_cents >= goal.target_cents
  const remaining = Math.max(0, goal.target_cents - goal.saved_cents)

  async function updateSaved() {
    const cents = randToCents(saved)
    if (cents == null || cents === goal.saved_cents) return
    await run(() => budgetMutate({ resource: 'goal', op: 'update', id: goal.id, data: { saved_cents: cents, achieved: cents >= goal.target_cents } }))
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 font-medium">
              <Target className="h-4 w-4 text-accent" />{goal.name}
              {done && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600"><Check className="h-3 w-3" /> reached</span>}
            </div>
            <div className="mt-0.5 text-xs capitalize text-muted-foreground">
              {goal.scope}{goal.target_date ? ` · by ${goal.target_date}` : ''}{goal.note ? ` · ${goal.note}` : ''}
            </div>
          </div>
          <button type="button" disabled={busy} onClick={() => run(() => budgetMutate({ resource: 'goal', op: 'delete', id: goal.id }))}
            className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{formatCurrency(goal.saved_cents)} of {formatCurrency(goal.target_cents)}</span>
          <span>{done ? '100%' : `${pct}% · ${formatCurrency(remaining)} to go`}</span>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Saved so far</label>
            <Input value={saved} onChange={(e) => setSaved(e.target.value)} leadingText="R" inputMode="decimal" className="h-9 w-36" />
          </div>
          <Button size="sm" disabled={busy} onClick={updateSaved}>Update</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function GoalForm({
  busy, onSave, onCancel,
}: {
  busy: boolean
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [scope, setScope] = useState<BudgetScope>('business')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')

  function save() {
    const cents = randToCents(target)
    if (!name.trim() || cents == null) return
    onSave({ name: name.trim(), target_cents: cents, scope, target_date: date || null, note: note || null })
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Goal"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tax set-aside" className="w-48" /></Field>
        <Field label="Target"><Input value={target} onChange={(e) => setTarget(e.target.value)} leadingText="R" inputMode="decimal" placeholder="0.00" className="w-36" /></Field>
        <Field label="Scope">
          <Select value={scope} onChange={(e) => setScope(e.target.value as BudgetScope)} className="w-32">
            <option value="business">Business</option><option value="personal">Personal</option>
          </Select>
        </Field>
        <Field label="Target date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" className="w-40" /></Field>
        <Button size="sm" disabled={busy} onClick={save}>Add goal</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
}
