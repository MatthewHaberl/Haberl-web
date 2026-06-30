'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Users, ChevronDown, X, Loader2 } from 'lucide-react'
import { DocAllocations, type DocAllocation } from '../[id]/DocAllocations'

export interface DocAllocSummary { target: 'customer' | 'company'; label: string; amount_cents: number }
interface Customer { id: string; full_name: string }
interface Line { id: string; description: string; line_total_cents: number }

// Inline invoice allocation for the Timeline. The trigger shows the document's
// current allocations (or an "Allocate" prompt); opening it lazy-loads the lines
// and existing allocations and embeds the same DocAllocations editor used on the
// document detail page, so behaviour and data are identical.
export function TimelineDocAllocate({
  documentId, label, allocs, customers,
}: {
  documentId: string
  label: string
  allocs: DocAllocSummary[]
  customers: Customer[]
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [allocations, setAllocations] = useState<DocAllocation[]>([])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/finance/documents/${documentId}/allocate`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { lines: Line[]; allocations: DocAllocation[] }
      setLines(json.lines ?? [])
      setAllocations(json.allocations ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load allocations')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
      <button
        type="button"
        onClick={() => { setOpen(true); load() }}
        className="inline-flex items-center gap-1"
        title={allocs.length > 0 ? 'Edit invoice allocation' : 'Allocate this invoice'}
      >
        {allocs.length > 0 ? (
          <span className="inline-flex max-w-[220px] flex-wrap items-center justify-end gap-1">
            {allocs.map((a, k) => (
              <span key={k}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  a.target === 'company' ? 'bg-muted text-muted-foreground' : 'bg-accent/10 text-accent'
                }`}>
                {a.label} {formatCurrency(a.amount_cents)}
              </span>
            ))}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-accent hover:text-foreground">
            <Users className="h-3 w-3" /> Allocate
          </span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Allocate invoice</h2>
                <p className="mt-0.5 max-w-md truncate text-sm text-muted-foreground" title={label}>{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tag this invoice (whole, a %, or specific lines) to a customer or to the business. It flows to the customer statement.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : error ? (
                <p className="py-6 text-center text-sm text-red-600">{error}</p>
              ) : (
                <DocAllocations
                  documentId={documentId}
                  lines={lines}
                  customers={customers}
                  allocations={allocations}
                  onChanged={load}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
