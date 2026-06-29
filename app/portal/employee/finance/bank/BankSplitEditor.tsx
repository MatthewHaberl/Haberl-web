'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'

interface Customer { id: string; full_name: string }

export interface SplitTxn {
  id: string
  description: string
  amount_cents: number // signed; magnitude is what we split
}

type PartDraft = {
  target: 'customer' | 'company'
  customer_id: string
  category: string
  amountRand: string
}

function centsToRand(c: number): string {
  return (c / 100).toFixed(2)
}
function randToCents(v: string): number {
  const n = parseFloat(v.replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function BankSplitEditor({
  txn, customers, categories, onClose,
}: {
  txn: SplitTxn
  customers: Customer[]
  categories: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const total = Math.abs(txn.amount_cents)
  const inflow = txn.amount_cents > 0
  const [parts, setParts] = useState<PartDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/finance/bank/${txn.id}/split`)
        const json = await res.json()
        if (!active) return
        const existing = (json.allocations ?? []) as {
          target: 'customer' | 'company'; customer_id: string | null; category: string | null; amount_cents: number
        }[]
        if (existing.length > 0) {
          setParts(existing.map((a) => ({
            target: a.target,
            customer_id: a.customer_id ?? '',
            category: a.category ?? categories[0],
            amountRand: centsToRand(a.amount_cents),
          })))
        } else {
          // Seed with a single customer part for the whole amount.
          setParts([{ target: 'customer', customer_id: '', category: categories[0], amountRand: centsToRand(total) }])
        }
      } catch {
        if (active) setError('Could not load existing split')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [txn.id, total, categories])

  const allocated = parts.reduce((s, p) => s + randToCents(p.amountRand), 0)
  const remaining = total - allocated

  function update(i: number, patch: Partial<PartDraft>) {
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }
  function addPart() {
    setParts((prev) => [
      ...prev,
      { target: 'customer', customer_id: '', category: categories[0], amountRand: centsToRand(Math.max(0, remaining)) },
    ])
  }
  function removePart(i: number) {
    setParts((prev) => prev.filter((_, j) => j !== i))
  }

  async function save() {
    setError(null)
    const payload = parts.map((p) => ({
      target: p.target,
      customer_id: p.target === 'customer' ? p.customer_id : null,
      category: p.target === 'company' ? p.category : null,
      amount_cents: randToCents(p.amountRand),
    }))
    if (payload.some((p) => p.amount_cents <= 0)) { setError('Every part needs an amount above zero.'); return }
    if (payload.some((p) => p.target === 'customer' && !p.customer_id)) { setError('Pick a customer for each customer part.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/finance/bank/${txn.id}/split`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts: payload }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally { setSaving(false) }
  }

  async function clearAll() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/finance/bank/${txn.id}/split`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Split transaction</h2>
            <p className="mt-0.5 max-w-md truncate text-sm text-muted-foreground" title={txn.description}>{txn.description}</p>
            <p className="mt-1 text-sm">
              Total <span className={`font-semibold tabular-nums ${inflow ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(txn.amount_cents)}</span>
              <span className="ml-2 text-muted-foreground">{inflow ? 'money in (their payments)' : 'money out (charges / overhead)'}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {parts.map((p, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">For</label>
                    <select value={p.target} onChange={(e) => update(i, { target: e.target.value as 'customer' | 'company' })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                      <option value="customer">Customer</option>
                      <option value="company">Company</option>
                    </select>
                  </div>
                  {p.target === 'customer' ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Customer</label>
                      <select value={p.customer_id} onChange={(e) => update(i, { customer_id: e.target.value })}
                        className="h-9 w-52 rounded-md border border-border bg-background px-2 text-sm">
                        <option value="">Choose…</option>
                        {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Category</label>
                      <select value={p.category} onChange={(e) => update(i, { category: e.target.value })}
                        className="h-9 w-52 rounded-md border border-border bg-background px-2 text-sm">
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Amount R</label>
                    <input type="number" inputMode="decimal" step="0.01" min="0" value={p.amountRand}
                      onChange={(e) => update(i, { amountRand: e.target.value })}
                      className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm" />
                  </div>
                  <button type="button" onClick={() => removePart(i)} title="Remove part"
                    className="ml-auto inline-flex h-9 items-center rounded-md px-2 text-muted-foreground hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addPart}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-accent hover:text-foreground">
                <Plus className="h-4 w-4" /> Add part
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Allocated </span>
            <span className="font-medium tabular-nums">{formatCurrency(allocated)}</span>
            <span className={`ml-2 ${remaining === 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {remaining === 0 ? 'fully allocated' : `${formatCurrency(Math.abs(remaining))} ${remaining > 0 ? 'left' : 'over'}`}
            </span>
          </div>
          {error && <span className="w-full text-sm text-red-600">{error}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={clearAll} disabled={saving}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-red-600 disabled:opacity-50">
              Clear split
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">Cancel</button>
            <button type="button" onClick={save} disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save split
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
