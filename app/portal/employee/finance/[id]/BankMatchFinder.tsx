'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Landmark, Search, Link2, Link2Off, Check } from 'lucide-react'

interface Txn {
  id: string
  txn_date: string
  description: string
  amount_cents: number
  account_label: string | null
}

export function BankMatchFinder({
  documentId, hasAllocations, initialLinked = [],
}: {
  documentId: string
  hasAllocations: boolean
  initialLinked?: Txn[]
}) {
  const router = useRouter()
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Txn[]>([])
  const [linked, setLinked] = useState<Txn[]>(initialLinked)
  const [total, setTotal] = useState<number | null>(null)
  const [reason, setReason] = useState<string | null>(null)

  async function find(d = days) {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/finance/documents/${documentId}/match?days=${d}`)
      if (!res.ok) throw new Error(await res.text())
      const j = await res.json()
      setCandidates(j.candidates ?? [])
      setLinked(j.linked ?? [])
      setTotal(j.total ?? null)
      setReason(j.reason ?? null)
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally { setLoading(false) }
  }

  async function link(txnId: string) {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/finance/documents/${documentId}/match`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txn_id: txnId }),
      })
      if (!res.ok) throw new Error(await res.text())
      await find()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link')
    } finally { setLoading(false) }
  }

  async function unlink() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/finance/documents/${documentId}/match`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      await find()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlink')
    } finally { setLoading(false) }
  }

  const linkedIds = new Set(linked.map((l) => l.id))

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="h-4 w-4 text-muted-foreground" /> Match to bank statement
          </span>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">within ±</span>
            <input type="number" min="0" max="60" value={days}
              onChange={(e) => setDays(Math.max(0, Math.min(60, parseInt(e.target.value || '0', 10))))}
              className="h-8 w-16 rounded-md border border-border bg-background px-2 text-right" />
            <span className="text-muted-foreground">days</span>
            <button type="button" disabled={loading} onClick={() => find()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              <Search className="h-4 w-4" /> {loading ? 'Searching…' : 'Find in bank statement'}
            </button>
          </div>
        </div>

        {linked.length > 0 && (
          <div className="rounded-md border border-green-300 bg-green-50/60 p-2 dark:bg-green-950/20">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-300">
              <Link2 className="h-4 w-4" /> Linked to this bank transaction
            </div>
            {linked.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">{formatDate(t.txn_date)}</span>
                <span className="truncate">{t.description}</span>
                <Badge variant="outline">{(t.account_label ?? '').replace(/^FNB\s+/, '')}</Badge>
                <span className="ml-auto font-medium tabular-nums">{formatCurrency(t.amount_cents)}</span>
                <button type="button" onClick={unlink} disabled={loading}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-red-600">
                  <Link2Off className="h-3.5 w-3.5" /> Unlink
                </button>
              </div>
            ))}
            <p className="mt-1.5 text-xs text-green-800/80 dark:text-green-300/80">
              {hasAllocations
                ? 'On customer statements this expense is counted from the invoice’s allocations above — not the bank transaction — so it isn’t double-counted.'
                : 'Allocate the invoice above to put this on a customer’s statement. While linked, the bank transaction itself won’t be counted separately.'}
            </p>
          </div>
        )}

        {searched && (
          reason === 'no_total' ? (
            <p className="text-sm text-muted-foreground">
              Set the invoice <strong>Total</strong> first (Edit details) so we know what amount to search for.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                {candidates.length === 0
                  ? `No bank transactions of ${total != null ? formatCurrency(total) : ''} found in that window — widen the day range and try again.`
                  : `${candidates.length} transaction${candidates.length === 1 ? '' : 's'} of ${total != null ? formatCurrency(total) : ''} near this date:`}
              </p>
              {candidates.length > 0 && (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {candidates.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="whitespace-nowrap text-muted-foreground">{formatDate(t.txn_date)}</span>
                      <span className="min-w-0 flex-1 truncate" title={t.description}>{t.description}</span>
                      <Badge variant="outline">{(t.account_label ?? '').replace(/^FNB\s+/, '')}</Badge>
                      <span className="whitespace-nowrap font-medium tabular-nums">{formatCurrency(t.amount_cents)}</span>
                      {linkedIds.has(t.id) ? (
                        <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-4 w-4" /> Linked</span>
                      ) : (
                        <button type="button" onClick={() => link(t.id)} disabled={loading}
                          className="rounded-md border border-border px-2.5 py-1 hover:bg-muted">This one</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
