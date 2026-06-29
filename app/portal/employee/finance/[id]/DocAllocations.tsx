'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Search, ChevronDown, Trash2, Plus, X } from 'lucide-react'

interface Line { id: string; description: string; line_total_cents: number }
interface Customer { id: string; full_name: string }
export interface DocAllocation {
  id: string
  target: 'customer' | 'company'
  customer_id: string | null
  customer_name: string | null
  direction: 'charge' | 'reimburse' | null
  basis: 'whole' | 'percent' | 'items' | 'custom'
  percent: number | null
  category: string | null
  amount_cents: number
  note: string | null
}

const DIR_LABEL = { charge: 'They owe us', reimburse: 'We owe them' } as const

export const COMPANY_CATEGORIES = [
  'Tools', 'Consumables', 'Materials & components', 'Vehicle & fuel',
  'Office & admin', 'Refreshments', 'Subcontractor', 'Other',
]

export function DocAllocations({
  documentId, lines, customers, allocations,
}: {
  documentId: string
  lines: Line[]
  customers: Customer[]
  allocations: DocAllocation[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [target, setTarget] = useState<'customer' | 'company'>('customer')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [direction, setDirection] = useState<'charge' | 'reimburse'>('reimburse')
  const [category, setCategory] = useState(COMPANY_CATEGORIES[0])
  const [basis, setBasis] = useState<'whole' | 'percent' | 'items' | 'custom'>('whole')
  const [percent, setPercent] = useState('100')
  const [customRands, setCustomRands] = useState('')
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  function reset() {
    setTarget('customer'); setCustomerId(''); setCustomerName(''); setDirection('reimburse')
    setCategory(COMPANY_CATEGORIES[0]); setBasis('whole'); setPercent('100'); setCustomRands('')
    setSelectedLines(new Set()); setNote(''); setError(null)
  }

  const itemsTotal = useMemo(
    () => lines.filter((l) => selectedLines.has(l.id)).reduce((s, l) => s + (l.line_total_cents ?? 0), 0),
    [lines, selectedLines],
  )

  async function save() {
    if (target === 'customer' && !customerId) { setError('Pick a customer'); return }
    setBusy(true); setError(null)
    const payload: Record<string, unknown> = { target, basis, note }
    if (target === 'customer') { payload.customer_id = customerId; payload.direction = direction }
    else { payload.category = category }
    if (basis === 'percent') payload.percent = Number(percent)
    if (basis === 'items') payload.line_item_ids = [...selectedLines]
    if (basis === 'custom') payload.custom_cents = Math.round(Number(customRands) * 100)
    try {
      const res = await fetch(`/api/finance/documents/${documentId}/allocate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setAdding(false); reset(); router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/finance/documents/${documentId}/allocate?allocation_id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      {allocations.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {allocations.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              {a.target === 'company' ? (
                <>
                  <Badge variant="default">Haberl</Badge>
                  <span className="font-medium">{a.category ?? 'Business'}</span>
                </>
              ) : (
                <>
                  <Badge variant={a.direction === 'reimburse' ? 'success' : 'accent'}>
                    {a.direction ? DIR_LABEL[a.direction] : ''}
                  </Badge>
                  <span className="font-medium">{a.customer_name ?? 'Customer'}</span>
                </>
              )}
              <span className="text-muted-foreground">
                {a.basis === 'whole' ? 'whole invoice'
                  : a.basis === 'percent' ? `${a.percent}%`
                  : a.basis === 'items' ? 'selected items'
                  : 'custom'}
                {a.note ? ` · ${a.note}` : ''}
              </span>
              <span className="ml-auto font-medium tabular-nums">{formatCurrency(a.amount_cents)}</span>
              <button type="button" disabled={busy} onClick={() => remove(a.id)}
                className="text-muted-foreground hover:text-red-600 disabled:opacity-50" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
          <Plus className="h-4 w-4" /> Allocate this invoice
        </button>
      ) : (
        <div className="space-y-3 rounded-md border border-accent bg-accent/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">New allocation</span>
            <button type="button" onClick={() => { setAdding(false); reset() }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* target */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm text-muted-foreground">Allocate to</span>
            <Seg value={target} onChange={setTarget}
              options={[{ v: 'customer', l: 'A customer' }, { v: 'company', l: 'Haberl (business)' }]} />
          </div>

          {target === 'customer' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-sm text-muted-foreground">Customer</span>
                <CustomerPicker customers={customers} selectedName={customerName}
                  onPick={(c) => { setCustomerId(c.id); setCustomerName(c.full_name) }} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-sm text-muted-foreground">Direction</span>
                <Seg value={direction} onChange={setDirection}
                  options={[{ v: 'reimburse', l: 'They covered it (we owe them)' }, { v: 'charge', l: 'Bill them (they owe us)' }]} />
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-sm text-muted-foreground">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm">
                {COMPANY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* basis */}
          <div className="flex flex-wrap items-start gap-2">
            <span className="w-20 pt-1.5 text-sm text-muted-foreground">How much</span>
            <div className="flex-1 space-y-2">
              <Seg value={basis} onChange={setBasis}
                options={[{ v: 'whole', l: 'Whole invoice' }, { v: 'percent', l: 'Percentage' }, { v: 'items', l: 'Specific items' }, { v: 'custom', l: 'Custom amount' }]} />

              {basis === 'percent' && (
                <div className="flex items-center gap-2">
                  <input type="number" value={percent} onChange={(e) => setPercent(e.target.value)} min="0" max="100"
                    className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm" />
                  <span className="text-sm text-muted-foreground">% of the invoice total</span>
                </div>
              )}
              {basis === 'custom' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">R</span>
                  <input type="number" value={customRands} onChange={(e) => setCustomRands(e.target.value)} placeholder="0.00" step="0.01"
                    className="h-9 w-32 rounded-md border border-border bg-background px-2 text-sm" />
                </div>
              )}
              {basis === 'items' && (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {lines.length === 0 && <p className="text-sm text-muted-foreground">This invoice has no itemised lines.</p>}
                  {lines.map((l) => (
                    <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={selectedLines.has(l.id)}
                        onChange={() => setSelectedLines((p) => { const n = new Set(p); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })} />
                      <span className="flex-1 truncate" title={l.description}>{l.description || '—'}</span>
                      <span className="tabular-nums text-muted-foreground">{formatCurrency(l.line_total_cents ?? 0)}</span>
                    </label>
                  ))}
                  {selectedLines.size > 0 && (
                    <div className="flex justify-between border-t border-border px-1 pt-1 text-sm font-medium">
                      <span>{selectedLines.size} selected</span><span className="tabular-nums">{formatCurrency(itemsTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm text-muted-foreground">Note</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
              className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={save}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save allocation'}
            </button>
            <button type="button" onClick={() => { setAdding(false); reset() }}
              className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Seg<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { v: T; l: string }[]
}) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
            value === o.v ? 'border-accent bg-accent text-accent-foreground' : 'border-border hover:bg-muted'
          }`}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

function CustomerPicker({ customers, selectedName, onPick }: {
  customers: Customer[]; selectedName: string; onPick: (c: Customer) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (n ? customers.filter((c) => c.full_name.toLowerCase().includes(n)) : customers).slice(0, 50)
  }, [q, customers])
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 min-w-48 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted">
        {selectedName || 'Choose customer'} <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-20 w-72 rounded-md border border-border bg-background shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…"
              className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-sm" />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>}
            {filtered.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { onPick(c); setOpen(false); setQ('') }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted">{c.full_name}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
