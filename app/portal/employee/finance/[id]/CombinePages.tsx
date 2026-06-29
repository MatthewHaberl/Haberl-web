'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Layers, Search, X, Check } from 'lucide-react'

export interface CombineCandidate {
  id: string
  file_name: string | null
  supplier_name: string | null
  doc_date: string | null
  total_cents: number | null
}

/**
 * Fold one or more other scans into THIS document as extra pages of the same
 * invoice. Keeps this document's details/allocation; the absorbed scans become
 * pages and their rows are removed, so the invoice is only counted once.
 */
export function CombinePages({
  documentId, candidates,
}: {
  documentId: string
  candidates: CombineCandidate[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    const list = n
      ? candidates.filter((c) =>
          [c.file_name, c.supplier_name].some((v) => v?.toLowerCase().includes(n)))
      : candidates
    return list.slice(0, 50)
  }, [q, candidates])

  function toggle(id: string) {
    setPicked((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function combine() {
    if (picked.size === 0) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/finance/documents/${documentId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_ids: [...picked] }),
      })
      if (!res.ok) throw new Error(await res.text())
      setOpen(false); setPicked(new Set()); setQ('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not combine the pages')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Combine pages
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Got page 1 and page 2 of this invoice as separate uploads? Fold the other scan(s) in here —
          they become extra pages of <span className="font-medium">this</span> document, so the invoice
          is only allocated and counted once.
        </p>

        {!open ? (
          <button type="button" onClick={() => { setOpen(true); setError(null) }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <Layers className="h-4 w-4" /> Combine another page into this invoice
          </button>
        ) : (
          <div className="space-y-3 rounded-md border border-accent bg-accent/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Pick the other page(s)</span>
              <button type="button" onClick={() => { setOpen(false); setPicked(new Set()); setQ(''); setError(null) }}
                className="text-muted-foreground hover:text-foreground">
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
                <li className="px-3 py-2 text-sm text-muted-foreground">No other documents to combine.</li>
              )}
              {filtered.map((c) => {
                const sel = picked.has(c.id)
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => toggle(c.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${sel ? 'bg-accent/10' : ''}`}>
                      <Check className={`h-4 w-4 shrink-0 ${sel ? 'text-accent opacity-100' : 'opacity-0'}`} />
                      <span className="min-w-0 flex-1 truncate" title={c.file_name ?? undefined}>
                        {c.file_name ?? 'Document'}
                        {c.supplier_name ? <span className="text-muted-foreground"> · {c.supplier_name}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.doc_date ? formatDate(c.doc_date) : ''}
                      </span>
                      <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                        {c.total_cents != null ? formatCurrency(c.total_cents) : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-2">
              <button type="button" disabled={busy || picked.size === 0} onClick={combine}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {busy ? 'Combining…' : `Combine ${picked.size || ''} page${picked.size === 1 ? '' : 's'} in`}
              </button>
              <button type="button" onClick={() => { setOpen(false); setPicked(new Set()); setQ(''); setError(null) }}
                className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Cancel</button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
