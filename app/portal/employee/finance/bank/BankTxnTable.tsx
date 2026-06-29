'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ArrowDownLeft, ArrowUpRight, Search, X, Check, ChevronDown, User2 } from 'lucide-react'

export interface BankRow {
  id: string
  account_label: string | null
  txn_date: string
  description: string
  amount_cents: number
  txn_type: string
  allocated_customer_id: string | null
  allocated_name: string | null
}

interface Customer { id: string; full_name: string }

const TXN_TYPE_LABEL: Record<string, string> = {
  unallocated: 'Unallocated', customer_payment: 'Customer payment',
  supplier_payment: 'Supplier payment', company_expense: 'Company expense',
  transfer: 'Transfer', other: 'Other',
}

function shortAccount(label: string | null): string {
  if (!label) return '—'
  return label.replace(/^FNB\s+/, '').replace(/\s*\(.*\)$/, '')
}

export function BankTxnTable({
  rows, customers, showAccount, sort, sortHref,
}: {
  rows: BankRow[]
  customers: Customer[]
  showAccount: boolean
  sort: 'asc' | 'desc'
  sortHref: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id))
  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))
  }

  async function allocate(customer_id: string | null) {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/bank/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], customer_id }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSelected(new Set())
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      {/* Allocation action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent bg-accent/5 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <span className="text-sm text-muted-foreground">Allocate to:</span>
          <CustomerPicker customers={customers} disabled={saving} onPick={(id) => allocate(id)} />
          <button
            type="button" disabled={saving}
            onClick={() => allocate(null)}
            className="text-sm text-muted-foreground hover:text-foreground underline disabled:opacity-50"
          >
            Clear allocation
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          {error && <span className="w-full text-sm text-red-600">{error}</span>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3 w-8">
                <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on page" />
              </th>
              <th className="px-4 py-3 font-medium">
                <Link href={sortHref} className="hover:text-foreground">Date {sort === 'asc' ? '↑' : '↓'}</Link>
              </th>
              {showAccount && <th className="px-4 py-3 font-medium">Account</th>}
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((t) => {
              const sel = selected.has(t.id)
              return (
                <tr key={t.id} className={sel ? 'bg-accent/5' : 'hover:bg-muted/40'}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={sel} onChange={() => toggle(t.id)} aria-label="Select transaction" />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDate(t.txn_date)}</td>
                  {showAccount && (
                    <td className="px-4 py-2.5"><span className="text-xs text-muted-foreground">{shortAccount(t.account_label)}</span></td>
                  )}
                  <td className="px-4 py-2.5">
                    <span className="block max-w-[380px] truncate" title={t.description}>
                      {t.description || <span className="text-muted-foreground">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {t.allocated_name
                      ? <Badge variant="accent">{t.allocated_name}</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums ${
                    t.amount_cents < 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    <span className="inline-flex items-center justify-end gap-1">
                      {t.amount_cents < 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                      {formatCurrency(t.amount_cents)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CustomerPicker({
  customers, onPick, disabled,
}: {
  customers: Customer[]
  onPick: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? customers.filter((c) => c.full_name.toLowerCase().includes(needle)) : customers
    return list.slice(0, 50)
  }, [q, customers])

  return (
    <div className="relative">
      <button
        type="button" disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted disabled:opacity-50"
      >
        <User2 className="h-4 w-4" /> Choose customer <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-20 w-72 rounded-md border border-border bg-background shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…"
              className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-sm"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>}
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setQ(''); onPick(c.id) }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <Check className="h-3.5 w-3.5 opacity-0" /> {c.full_name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
