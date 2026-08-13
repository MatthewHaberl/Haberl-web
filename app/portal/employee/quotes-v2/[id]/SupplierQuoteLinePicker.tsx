'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Supplier-quote line picker (W98) — the "pull a quoted line into a section"
// control shared by both engines: the scope editor's per-section footer and the
// solar canvas's Quoted-line-items block.
//
// useSupplierQuoteLines loads every line on every supplier quote attached to
// this quote_request (staff-read RLS) and reloads when the Quoted Line Items
// panel broadcasts a change.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SupplierQuoteLineRow, SupplierQuoteRow } from '@/lib/quotes/supplier-quotes'

/** Broadcast by the panel after any upload/parse/edit so pickers stay fresh. */
export const SUPPLIER_QUOTES_CHANGED = 'supplier-quotes-changed'

export interface PickableSupplierLine {
  id: string
  supplierQuoteId: string
  supplierLabel: string
  sku: string
  description: string
  qty: number
  unit: string
  /** Supplier EX-VAT unit price (rands). */
  unitPriceExVatR: number
}

export function useSupplierQuoteLines(requestId: string): PickableSupplierLine[] {
  const supabase = useMemo(() => createClient(), [])
  const [lines, setLines] = useState<PickableSupplierLine[]>([])

  const load = useCallback(async () => {
    const { data: quotes } = await supabase
      .from('supplier_quotes')
      .select('id, supplier, reference')
      .eq('quote_request_id', requestId)
      .order('created_at')
    if (!quotes?.length) { setLines([]); return }
    const label = new Map(
      (quotes as Pick<SupplierQuoteRow, 'id' | 'supplier' | 'reference'>[]).map((q) => [
        q.id,
        [q.supplier, q.reference].filter(Boolean).join(' ') || 'Supplier quote',
      ]),
    )
    const { data } = await supabase
      .from('supplier_quote_lines')
      .select('*')
      .in('supplier_quote_id', quotes.map((q) => q.id))
      .order('line_no')
    setLines(((data ?? []) as SupplierQuoteLineRow[]).map((l) => ({
      id: l.id,
      supplierQuoteId: l.supplier_quote_id,
      supplierLabel: label.get(l.supplier_quote_id) ?? 'Supplier quote',
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      unitPriceExVatR: l.unit_price_r,
    })))
  }, [requestId, supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is async; its setState runs after the fetch resolves, not synchronously in the effect body.
    load()
    const onChanged = () => { load() }
    window.addEventListener(SUPPLIER_QUOTES_CHANGED, onChanged)
    return () => window.removeEventListener(SUPPLIER_QUOTES_CHANGED, onChanged)
  }, [load])

  return lines
}

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Dropdown of quoted lines. Renders nothing when the quote has no supplier
 * quotes yet — sections keep their current footer until there's something to pick.
 */
export function SupplierQuoteLinePicker({ lines, onPick, label = 'From supplier quote' }: {
  lines: PickableSupplierLine[]
  onPick: (line: PickableSupplierLine) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (lines.length === 0) return null

  const q = filter.trim().toLowerCase()
  const shown = q
    ? lines.filter((l) =>
        l.description.toLowerCase().includes(q) ||
        l.sku.toLowerCase().includes(q) ||
        l.supplierLabel.toLowerCase().includes(q))
    : lines

  return (
    <div ref={boxRef} className="relative">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <FileText className="h-3.5 w-3.5" /> {label}
      </Button>
      {open && (
        <div className="absolute z-30 mt-1 w-[26rem] max-w-[80vw] rounded-md border border-border bg-background shadow-lg">
          <div className="border-b border-border p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter quoted lines…"
              className="h-8"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {shown.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No quoted lines match.</div>
            )}
            {shown.map((l) => (
              <button
                key={l.id}
                type="button"
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                onClick={() => { onPick(l); setOpen(false); setFilter('') }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{l.description}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[l.supplierLabel, l.sku, `${l.qty} ${l.unit}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium">
                  {l.unitPriceExVatR > 0 ? `${rand(l.unitPriceExVatR)} ex VAT` : 'No price'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
