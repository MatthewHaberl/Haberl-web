'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Pencil, Loader2, Check, X } from 'lucide-react'

/**
 * Set/clear a customer's brought-forward opening balance (migration 081). The
 * stored value is signed cents — positive means they owe us, negative means
 * they're in credit. Manager/admin only (the statement page is already gated);
 * writes go straight through RLS like the other inline finance editors.
 */
export function OpeningBalanceEditor({
  customerId, cents, date,
}: {
  customerId: string
  cents: number
  date: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rand, setRand] = useState(cents ? (Math.abs(cents) / 100).toFixed(2) : '')
  const [dir, setDir] = useState<'owe' | 'credit'>(cents < 0 ? 'credit' : 'owe')
  const [asAt, setAsAt] = useState(date ?? '')

  async function save() {
    setBusy(true); setError(null)
    const magnitude = Math.round((parseFloat(rand.replace(/[,\s]/g, '')) || 0) * 100)
    const signed = dir === 'credit' ? -magnitude : magnitude
    const supabase = createClient()
    const { error } = await supabase
      .from('customers')
      .update({ opening_balance_cents: signed, opening_balance_date: asAt || null })
      .eq('id', customerId)
    if (error) { setError(error.message); setBusy(false); return }
    setOpen(false); setBusy(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Set a brought-forward opening balance"
      >
        <Pencil className="h-3.5 w-3.5" />
        {cents !== 0
          ? <>Opening: <span className="font-medium text-foreground">{formatCurrency(cents)}</span>{date ? ` as at ${formatDate(date)}` : ''}</>
          : 'Set opening balance'}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-accent bg-accent/5 p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Opening amount (R)</label>
        <input
          type="number" inputMode="decimal" step="0.01" min="0" value={rand} autoFocus
          onChange={(e) => setRand(e.target.value)} placeholder="0.00"
          className="h-9 w-32 rounded-md border border-border bg-background px-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Direction</label>
        <select
          value={dir} onChange={(e) => setDir(e.target.value as 'owe' | 'credit')}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="owe">They owe us</option>
          <option value="credit">They&apos;re in credit</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">As at (optional)</label>
        <input
          type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        />
      </div>
      <button
        type="button" disabled={busy} onClick={save}
        className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
      </button>
      <button
        type="button" disabled={busy} onClick={() => { setOpen(false); setError(null) }}
        className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <X className="h-4 w-4" /> Cancel
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  )
}
