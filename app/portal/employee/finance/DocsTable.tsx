'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Download, FileText, Layers, X } from 'lucide-react'
import { DeleteDocButton } from './DeleteDocButton'

export interface DocRowVM {
  id: string
  file_name: string | null
  doc_number: string | null
  doc_type_label: string
  status: string
  supplier_name: string | null
  doc_date: string | null
  alloc_names: string[]
  customer_name: string | null
  total_cents: number | null
}

interface SortHeader { href: string; arrow: string }

/**
 * Documents table with multi-select → "Combine into one invoice". Picking two
 * or more scans and combining folds them into one document (a multi-page PDF)
 * so an invoice split across pages is only allocated and counted once. One
 * selected row is the primary whose details are kept; the rest become pages.
 */
export function DocsTable({
  rows, dateSort, totalSort,
}: {
  rows: DocRowVM[]
  dateSort: SortHeader
  totalSort: SortHeader
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [primaryId, setPrimaryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])
  // The primary defaults to the first selected row, but the user can change it.
  const primary = selectedRows.find((r) => r.id === primaryId) ?? selectedRows[0] ?? null

  function toggle(id: string) {
    setSelected((prev) => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
    setError(null)
  }

  function clear() { setSelected(new Set()); setPrimaryId(null); setError(null) }

  async function combine() {
    if (!primary || selected.size < 2) return
    setBusy(true); setError(null)
    try {
      const merge_ids = [...selected].filter((mid) => mid !== primary.id)
      const res = await fetch(`/api/finance/documents/${primary.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_ids }),
      })
      if (!res.ok) throw new Error(await res.text())
      clear()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not combine the pages')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-accent bg-accent/5 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          {selected.size >= 2 ? (
            <>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Keep details of
                <select
                  value={primary?.id ?? ''}
                  onChange={(e) => setPrimaryId(e.target.value)}
                  className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  {selectedRows.map((r) => (
                    <option key={r.id} value={r.id}>{r.file_name ?? r.doc_number ?? 'Document'}</option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={busy} onClick={combine}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <Layers className="h-4 w-4" /> {busy ? 'Combining…' : 'Combine into one invoice'}
              </button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Select one more to combine into a single invoice.</span>
          )}
          <button type="button" onClick={clear}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" /> Clear
          </button>
          {error && <span className="w-full text-sm text-red-600">{error}</span>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3 w-8"><span className="sr-only">Select</span></th>
              <th className="px-4 py-3 font-medium">Document</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">
                <Link href={dateSort.href} className="hover:text-foreground">Date {dateSort.arrow}</Link>
              </th>
              <th className="px-4 py-3 font-medium">Allocated to</th>
              <th className="px-4 py-3 font-medium text-right">
                <Link href={totalSort.href} className="hover:text-foreground">Total {totalSort.arrow}</Link>
              </th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((d) => {
              const allocNames = [...d.alloc_names]
              const sel = selected.has(d.id)
              return (
                <tr key={d.id} className={`hover:bg-muted/40 ${d.status === 'discarded' ? 'opacity-50' : ''} ${sel ? 'bg-accent/5' : ''}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={sel} onChange={() => toggle(d.id)} aria-label="Select document" />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/portal/employee/finance/${d.id}`}
                      className="flex items-center gap-2 min-w-0 text-accent hover:underline" title="Open line-item view">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate max-w-[260px]">{d.file_name ?? d.doc_number ?? 'Document'}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline">{d.doc_type_label}</Badge>
                      {d.status === 'unsure' && <Badge variant="warning">Unsure</Badge>}
                      {d.status === 'discarded' && <Badge variant="destructive">Discarded</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">{d.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3">{d.doc_date ? formatDate(d.doc_date) : '—'}</td>
                  <td className="px-4 py-3">
                    {allocNames.length
                      ? <Badge variant="accent">{allocNames.join(', ')}</Badge>
                      : d.customer_name
                        ? d.customer_name
                        : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {d.total_cents != null ? formatCurrency(d.total_cents) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <a href={`/api/finance/documents/${d.id}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline">
                        <Download className="h-4 w-4" /> Open
                      </a>
                      <DeleteDocButton id={d.id} name={d.file_name ?? 'this document'} />
                    </div>
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
