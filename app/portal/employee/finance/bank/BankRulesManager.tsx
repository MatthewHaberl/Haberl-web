'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, X, Trash2, Loader2, Plus } from 'lucide-react'

interface Customer { id: string; full_name: string }
interface Rule {
  id: string; pattern: string; target: 'customer' | 'company'
  customer_id: string | null; category: string | null
  customer?: { full_name: string } | { full_name: string }[] | null
}

export function BankRulesManager({ customers, categories }: { customers: Customer[]; categories: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // New-rule draft
  const [pattern, setPattern] = useState('')
  const [target, setTarget] = useState<'customer' | 'company'>('customer')
  const [customerId, setCustomerId] = useState('')
  const [category, setCategory] = useState(categories[0])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/bank/rules')
      const json = await res.json()
      setRules((json.rules ?? []) as Rule[])
    } catch { setError('Could not load rules') } finally { setLoading(false) }
  }

  useEffect(() => { if (open) load() }, [open])

  async function addRule() {
    setError(null); setMsg(null)
    if (!pattern.trim()) { setError('Enter text to match in the description.'); return }
    if (target === 'customer' && !customerId) { setError('Pick a customer.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/finance/bank/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: pattern.trim(), target, customer_id: customerId || null, category }),
      })
      if (!res.ok) throw new Error(await res.text())
      setPattern(''); setCustomerId('')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save rule') } finally { setBusy(false) }
  }

  async function deleteRule(id: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/finance/bank/rules?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete') } finally { setBusy(false) }
  }

  async function applyAll() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const res = await fetch('/api/finance/bank/rules/apply', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const r = await res.json()
      setMsg(`Applied: ${r.customer_applied ?? 0} to customers, ${r.company_applied ?? 0} to company.`)
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not apply rules') } finally { setBusy(false) }
  }

  function custName(r: Rule): string {
    const c = Array.isArray(r.customer) ? r.customer[0] : r.customer
    return c?.full_name ?? 'Customer'
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">
        <Wand2 className="h-4 w-4" /> Auto-rules
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="inline-flex items-center gap-2 text-base font-semibold"><Wand2 className="h-4 w-4 text-accent" /> Auto-allocation rules</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Match text in a transaction description and assign it automatically. Rules only touch transactions that aren&rsquo;t allocated yet.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* New rule */}
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">If description contains</label>
                  <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. Damien, Sasol, Vodacom"
                    className="h-9 w-44 rounded-md border border-border bg-background px-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Allocate to</label>
                  <select value={target} onChange={(e) => setTarget(e.target.value as 'customer' | 'company')}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                    <option value="customer">Customer</option>
                    <option value="company">Company</option>
                  </select>
                </div>
                {target === 'customer' ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Customer</label>
                    <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                      className="h-9 w-44 rounded-md border border-border bg-background px-2 text-sm">
                      <option value="">Choose…</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}
                      className="h-9 w-44 rounded-md border border-border bg-background px-2 text-sm">
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <button type="button" onClick={addRule} disabled={busy}
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Add rule
                </button>
              </div>

              {/* Existing rules */}
              <div className="mt-4">
                {loading ? (
                  <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : rules.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No rules yet. Add one above.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {rules.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{r.pattern}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{r.target === 'customer' ? custName(r) : `Company · ${r.category ?? 'Business'}`}</span>
                        <button type="button" onClick={() => deleteRule(r.id)} disabled={busy}
                          className="ml-auto text-muted-foreground hover:text-red-600 disabled:opacity-50" title="Delete rule">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
              {msg && <span className="text-sm text-green-600">{msg}</span>}
              {error && <span className="text-sm text-red-600">{error}</span>}
              <button type="button" onClick={applyAll} disabled={busy || rules.length === 0}
                className="ml-auto inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} <Wand2 className="h-4 w-4" /> Apply all rules now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
