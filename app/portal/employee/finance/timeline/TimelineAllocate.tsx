'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { User2, ChevronDown, Search, Check, X, Split, Loader2 } from 'lucide-react'
import { BankSplitEditor } from '../bank/BankSplitEditor'

export interface TimelineSplit { target: 'customer' | 'company'; name: string | null; amount_cents: number }
interface Customer { id: string; full_name: string }

// Inline allocation for a single bank transaction, lifted from the Bank
// Statements row picker so the Timeline can allocate / split / clear without
// leaving the page. Talks to the same /api/finance/bank endpoints, so a saved
// change shows identically on Bank Statements and customer statements.
export function TimelineAllocate({
  txnId, description, amountCents, allocatedCustomerId, allocatedName, splits, customers, categories,
}: {
  txnId: string
  description: string
  amountCents: number
  allocatedCustomerId: string | null
  allocatedName: string | null
  splits: TimelineSplit[]
  customers: Customer[]
  categories: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? customers.filter((c) => c.full_name.toLowerCase().includes(needle)) : customers
    return list.slice(0, 50)
  }, [q, customers])

  async function allocate(customer_id: string | null) {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/bank/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [txnId], customer_id }),
      })
      if (!res.ok) throw new Error(await res.text())
      setOpen(false); setQ('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const hasSplit = splits.length > 0

  // Stop clicks bubbling to the row's navigation <Link>.
  return (
    <div className="relative shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
      {hasSplit ? (
        <button
          type="button" onClick={() => setEditing(true)}
          className="inline-flex max-w-[220px] flex-wrap items-center justify-end gap-1"
          title="Edit split"
        >
          {splits.map((s, k) => (
            <span key={k}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                s.target === 'company' ? 'bg-muted text-muted-foreground' : 'bg-accent/10 text-accent'
              }`}>
              {s.name} {formatCurrency(s.amount_cents)}
            </span>
          ))}
        </button>
      ) : (
        <button
          type="button" disabled={saving}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 disabled:opacity-50"
          title={allocatedName ? `Allocated to ${allocatedName} — click to change` : 'Allocate this transaction'}
        >
          {allocatedName ? (
            <span className="inline-flex max-w-[140px] items-center truncate rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
              {allocatedName}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-accent hover:text-foreground">
              <User2 className="h-3 w-3" /> Allocate
            </span>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
      )}

      {open && !hasSplit && (
        <div className="absolute right-0 top-8 z-30 w-72 rounded-md border border-border bg-background shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…"
              className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-sm"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {allocatedCustomerId && (
              <li>
                <button
                  type="button" onClick={() => allocate(null)} disabled={saving}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Clear allocation
                </button>
              </li>
            )}
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>}
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button" onClick={() => allocate(c.id)} disabled={saving}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <Check className={`h-3.5 w-3.5 ${c.id === allocatedCustomerId ? 'opacity-100 text-accent' : 'opacity-0'}`} /> {c.full_name}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-1">
            <button
              type="button" onClick={() => { setOpen(false); setEditing(true) }}
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Split className="h-3.5 w-3.5" /> Split across customers / company…
            </button>
          </div>
          {(saving || error) && (
            <div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {error && <span className="text-red-600">{error}</span>}
            </div>
          )}
        </div>
      )}

      {editing && (
        <BankSplitEditor
          txn={{ id: txnId, description, amount_cents: amountCents }}
          customers={customers}
          categories={categories}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
