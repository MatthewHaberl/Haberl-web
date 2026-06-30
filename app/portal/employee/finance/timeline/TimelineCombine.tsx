'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Layers, X, Loader2, AlertTriangle } from 'lucide-react'

export interface CombineDoc {
  id: string
  label: string
  date: string | null
  total_cents: number | null
  /** Has its own fin_allocations — only the primary may carry one when merging. */
  hasAlloc: boolean
}

interface Ctx { selected: Set<string>; toggle: (id: string) => void }
const CombineCtx = createContext<Ctx | null>(null)

/**
 * Select-to-combine for the timeline. Tick two or more invoice rows (e.g. page
 * 1 and page 2 of the same bill, or duplicate scans) and fold them into ONE
 * document via the merge route — the primary keeps its details/allocation, the
 * rest become extra pages and their rows are removed.
 */
export function CombineProvider({ docs, children }: { docs: CombineDoc[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  return (
    <CombineCtx.Provider value={{ selected, toggle }}>
      {children}
      <CombineBar docs={docs} selected={selected} clear={() => setSelected(new Set())} />
    </CombineCtx.Provider>
  )
}

/** A row checkbox — only rendered on document rows. */
export function CombineCheckbox({ id }: { id: string }) {
  const ctx = useContext(CombineCtx)
  if (!ctx) return null
  return (
    <input
      type="checkbox"
      checked={ctx.selected.has(id)}
      onChange={() => ctx.toggle(id)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Select to combine"
      title="Select to combine with other documents"
      className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
    />
  )
}

function CombineBar({
  docs, selected, clear,
}: {
  docs: CombineDoc[]
  selected: Set<string>
  clear: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [primaryId, setPrimaryId] = useState<string>('')

  const selectedDocs = useMemo(() => docs.filter((d) => selected.has(d.id)), [docs, selected])

  // Default primary: a selected doc that already has an allocation (so nothing
  // is lost), else the earliest-dated.
  const defaultPrimary = useMemo(() => {
    if (selectedDocs.length === 0) return ''
    const withAlloc = selectedDocs.find((d) => d.hasAlloc)
    if (withAlloc) return withAlloc.id
    return [...selectedDocs].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0].id
  }, [selectedDocs])

  const primary = primaryId && selected.has(primaryId) ? primaryId : defaultPrimary
  // Merge refuses if a NON-primary carries an allocation — flag it up front.
  const allocConflict = selectedDocs.filter((d) => d.hasAlloc && d.id !== primary).length > 0

  if (selectedDocs.length < 2) return null

  async function combine() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/finance/documents/${primary}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_ids: selectedDocs.filter((d) => d.id !== primary).map((d) => d.id) }),
      })
      if (!res.ok) throw new Error(await res.text())
      clear()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not combine the documents')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="w-full max-w-3xl rounded-lg border border-accent bg-background p-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Layers className="h-4 w-4 text-accent" />
            {selectedDocs.length} documents selected
          </span>

          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Keep as main:
            <select
              value={primary}
              onChange={(e) => setPrimaryId(e.target.value)}
              disabled={busy}
              className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-sm"
            >
              {selectedDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}{d.date ? ` · ${formatDate(d.date)}` : ''}
                  {d.total_cents != null ? ` · ${formatCurrency(d.total_cents)}` : ''}
                  {d.hasAlloc ? ' (allocated)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button" disabled={busy || allocConflict}
              onClick={combine}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              Combine into one
            </button>
            <button
              type="button" onClick={clear} disabled={busy}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          The “main” document keeps its supplier, total and allocation; the others become its extra pages and are removed.
        </p>
        {allocConflict && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            More than one selected document is already allocated — keep the allocated one as main, or clear the others’ allocations first.
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}
