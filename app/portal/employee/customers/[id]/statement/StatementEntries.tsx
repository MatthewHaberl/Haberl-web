'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Loader2, Trash2, X, PencilLine } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'

export interface ManualEntry {
  id: string
  entry_date: string
  direction: 'charge' | 'credit'
  amount_cents: number
  memo: string | null
  reference: string | null
}

/**
 * Hand-entered statement lines (migration 082) — e.g. an invoice for extra
 * labour, an agreed adjustment, or a cash payment that never hit the bank.
 * A 'charge' adds to what they owe us; a 'credit' is in their favour. Lines
 * flow into the statement ledger + totals; this card is where they're managed.
 * Manager/admin only (the statement page is already gated).
 */
export function StatementEntries({
  customerId, entries,
}: {
  customerId: string
  entries: ManualEntry[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [direction, setDirection] = useState<'charge' | 'credit'>('charge')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [memo, setMemo] = useState('')
  const [rand, setRand] = useState('')

  function reset() {
    setDirection('charge'); setReference(''); setMemo(''); setRand(''); setError(null)
    setDate(new Date().toISOString().slice(0, 10))
  }

  async function add() {
    setError(null)
    const cents = Math.round((parseFloat(rand.replace(/[,\s]/g, '')) || 0) * 100)
    if (cents <= 0) { setError('Enter an amount.'); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('fin_manual_entries').insert({
      customer_id: customerId,
      entry_date: date || new Date().toISOString().slice(0, 10),
      direction,
      amount_cents: cents,
      memo: memo.trim() || null,
      reference: reference.trim() || null,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    reset(); setOpen(false); router.refresh()
  }

  async function remove(e: ManualEntry) {
    if (!(await confirm({
      title: `Remove this ${e.direction === 'charge' ? 'charge' : 'credit'} of ${formatCurrency(e.amount_cents)}?`,
      confirmText: 'Remove', destructive: true,
    }))) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('fin_manual_entries').delete().eq('id', e.id)
    setBusy(false)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PencilLine className="h-4 w-4 text-muted-foreground" /> Manual entries
            {entries.length > 0 && <span className="font-normal text-muted-foreground">({entries.length})</span>}
          </div>
          {!open && (
            <button
              type="button" onClick={() => { reset(); setOpen(true) }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add invoice / entry
            </button>
          )}
        </div>

        {open && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-accent bg-accent/5 p-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={direction} onChange={(e) => setDirection(e.target.value as 'charge' | 'credit')}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="charge">Invoice / charge (they owe us)</option>
                <option value="credit">Payment / credit (in their favour)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Reference</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice no. (optional)"
                className="h-9 w-36 rounded-md border border-border bg-background px-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Extra labour — Boulder 4"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Amount (R)</label>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={rand} onChange={(e) => setRand(e.target.value)} placeholder="0.00"
                className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm" />
            </div>
            <button
              type="button" disabled={busy} onClick={add}
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </button>
            <button
              type="button" disabled={busy} onClick={() => { reset(); setOpen(false) }}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            {error && <p className="w-full text-xs text-red-600">{error}</p>}
          </div>
        )}

        {entries.length > 0 && (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-20 shrink-0 text-muted-foreground">{formatDate(e.entry_date)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {e.memo || (e.direction === 'charge' ? 'Manual charge' : 'Manual credit')}
                  {e.reference ? <span className="text-muted-foreground"> · {e.reference}</span> : null}
                </span>
                <span className={`shrink-0 tabular-nums font-medium ${e.direction === 'charge' ? 'text-red-600' : 'text-green-600'}`}>
                  {e.direction === 'charge' ? '' : '−'}{formatCurrency(e.amount_cents)}
                </span>
                <button
                  type="button" disabled={busy} onClick={() => remove(e)}
                  className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title="Remove this entry"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
