'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeftRight, Search, X, Check } from 'lucide-react'
import type { CombineCandidate } from './CombinePages'

/**
 * Swap ONLY the attached file with another document. For when the right details
 * and allocations are on each row but the wrong scan is attached. Everything
 * except the file stays put.
 */
export function SwapFile({
  documentId, currentFileName, candidates,
}: {
  documentId: string
  currentFileName: string | null
  candidates: CombineCandidate[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<CombineCandidate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    const list = n
      ? candidates.filter((c) => [c.file_name, c.supplier_name].some((v) => v?.toLowerCase().includes(n)))
      : candidates
    return list.slice(0, 50)
  }, [q, candidates])

  function cancel() { setOpen(false); setPick(null); setQ(''); setError(null) }

  async function swap() {
    if (!pick) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/finance/documents/${documentId}/swap-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ other_id: pick.id }),
      })
      if (!res.ok) throw new Error(await res.text())
      cancel()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not swap the files')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4" /> Swap document file
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Wrong scan attached? Swap just the <span className="font-medium">file</span> with another document.
          All other details and allocations stay on each document — only the attached PDF/scan changes hands.
        </p>

        {!open ? (
          <button type="button" onClick={() => { setOpen(true); setError(null) }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <ArrowLeftRight className="h-4 w-4" /> Swap file with another document
          </button>
        ) : (
          <div className="space-y-3 rounded-md border border-accent bg-accent/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Pick the document to swap files with</span>
              <button type="button" onClick={cancel} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search file or supplier…"
                className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm" />
            </div>

            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">No other documents found.</li>
              )}
              {filtered.map((c) => {
                const sel = pick?.id === c.id
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setPick(sel ? null : c)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${sel ? 'bg-accent/10' : ''}`}>
                      <Check className={`h-4 w-4 shrink-0 ${sel ? 'text-accent opacity-100' : 'opacity-0'}`} />
                      <span className="min-w-0 flex-1 truncate" title={c.file_name ?? undefined}>
                        {c.file_name ?? 'Document'}
                        {c.supplier_name ? <span className="text-muted-foreground"> · {c.supplier_name}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.doc_date ? formatDate(c.doc_date) : ''}</span>
                      <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                        {c.total_cents != null ? formatCurrency(c.total_cents) : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {pick && (
              <p className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                <span className="font-medium">{currentFileName ?? 'this document'}</span>
                {' '}<ArrowLeftRight className="inline h-3.5 w-3.5 text-muted-foreground" />{' '}
                <span className="font-medium">{pick.file_name ?? 'the other document'}</span>
                {' '}— the two files trade places; everything else stays.
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-2">
              <button type="button" disabled={busy || !pick} onClick={swap}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {busy ? 'Swapping…' : 'Swap files'}
              </button>
              <button type="button" onClick={cancel}
                className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Cancel</button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
