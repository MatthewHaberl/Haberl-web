'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Quoted Line Items (W98) — the supplier-quote section on a quote.
//
// Upload a supplier's quote (the "key quote" PDF), have its table read into
// supplier_quote_lines, review/correct the lines here, then pull them into the
// builder sections via SupplierQuoteLinePicker. Prices are the supplier's
// EX-VAT rates; the landed column shows × 1.15 (unrecoverable VAT) — the cost
// the line carries into the BOM.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, ExternalLink, Plus, RefreshCw, Trash2, Upload,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  landedCostR, type SupplierQuoteLineRow, type SupplierQuoteRow,
} from '@/lib/quotes/supplier-quotes'
import type { SupplierRfqRow } from '@/lib/quotes/supplier-rfq'
import { SUPPLIER_QUOTES_CHANGED } from './SupplierQuoteLinePicker'
import { RFQS_CHANGED } from './RfqPanel'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS_BADGE: Record<SupplierQuoteRow['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  uploaded: { label: 'Uploaded', variant: 'outline' },
  parsing: { label: 'Parsing…', variant: 'outline' },
  parsed: { label: 'Parsed', variant: 'success' },
  failed: { label: 'Parse failed', variant: 'destructive' },
  manual: { label: 'Manual', variant: 'default' },
}

function broadcast() {
  window.dispatchEvent(new CustomEvent(SUPPLIER_QUOTES_CHANGED))
}

export function SupplierQuotesPanel({ requestId }: { requestId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [quotes, setQuotes] = useState<SupplierQuoteRow[]>([])
  const [rfqs, setRfqs] = useState<SupplierRfqRow[]>([])
  const [linesBy, setLinesBy] = useState<Record<string, SupplierQuoteLineRow[]>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [supplier, setSupplier] = useState('')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data: qs } = await supabase
      .from('supplier_quotes')
      .select('*')
      .eq('quote_request_id', requestId)
      .order('created_at')
    const rows = (qs ?? []) as SupplierQuoteRow[]
    setQuotes(rows)
    if (!rows.length) { setLinesBy({}); return }
    const { data: ls } = await supabase
      .from('supplier_quote_lines')
      .select('*')
      .in('supplier_quote_id', rows.map((q) => q.id))
      .order('line_no')
    const by: Record<string, SupplierQuoteLineRow[]> = {}
    for (const l of (ls ?? []) as SupplierQuoteLineRow[]) {
      ;(by[l.supplier_quote_id] ??= []).push(l)
    }
    setLinesBy(by)
  }, [requestId, supabase])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is async; its setStates run after the fetch resolves, not synchronously in the effect body.
  useEffect(() => { load() }, [load])

  // The RFQs raised on this quote — a returned document gets pointed at the one
  // it answers, which is what flips that RFQ to "Quote received".
  const loadRfqs = useCallback(async () => {
    const res = await fetch(`/api/quotes/${requestId}/rfqs`)
    if (!res.ok) return
    const body = await res.json() as { rfqs: SupplierRfqRow[] }
    setRfqs(body.rfqs.filter((r) => r.status !== 'cancelled'))
  }, [requestId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadRfqs is async; its setState runs after the fetch resolves, not synchronously in the effect body.
    loadRfqs()
    const onChange = () => { loadRfqs() }
    window.addEventListener(RFQS_CHANGED, onChange)
    return () => window.removeEventListener(RFQS_CHANGED, onChange)
  }, [loadRfqs])

  /**
   * Point a returned quote at the RFQ it answers. Marking the RFQ 'quoted' is
   * the loop closing: the list went out, the prices came back.
   */
  async function linkToRfq(sq: SupplierQuoteRow, rfqId: string | null) {
    setQuotes((rows) => rows.map((r) => (r.id === sq.id ? { ...r, rfq_id: rfqId } : r)))
    await supabase.from('supplier_quotes').update({ rfq_id: rfqId }).eq('id', sq.id)
    if (rfqId) {
      await supabase.from('supplier_rfqs').update({ status: 'quoted' }).eq('id', rfqId).eq('status', 'sent')
      await loadRfqs()
      window.dispatchEvent(new CustomEvent(RFQS_CHANGED))
    }
  }

  async function upload() {
    const file = fileRef.current?.files?.[0] ?? null
    if (!file && !supplier.trim()) {
      setError('Choose the supplier quote file, or type a supplier name for a manual entry.')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      if (file) fd.set('file', file)
      if (supplier.trim()) fd.set('supplier', supplier.trim())
      const res = await fetch(`/api/quotes/${requestId}/supplier-quotes`, { method: 'POST', body: fd })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      setSupplier('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
      broadcast()
    } finally {
      setUploading(false)
    }
  }

  async function reparse(sq: SupplierQuoteRow) {
    setBusy(sq.id)
    setError(null)
    try {
      const res = await fetch(`/api/quotes/${requestId}/supplier-quotes/${sq.id}/parse`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? 'Re-parse failed')
      }
      await load()
      broadcast()
    } finally {
      setBusy(null)
    }
  }

  async function removeQuote(sq: SupplierQuoteRow) {
    const label = [sq.supplier, sq.reference].filter(Boolean).join(' ') || 'this supplier quote'
    if (!confirm(`Remove ${label} and its ${linesBy[sq.id]?.length ?? 0} lines? Lines already pulled into sections stay on the quote.`)) return
    setBusy(sq.id)
    try {
      await fetch(`/api/quotes/${requestId}/supplier-quotes/${sq.id}`, { method: 'DELETE' })
      await load()
      broadcast()
    } finally {
      setBusy(null)
    }
  }

  // Line edits go straight to the table (manager/admin RLS) — local state first
  // so typing is instant, persisted on blur.
  const patchLocal = (line: SupplierQuoteLineRow, patch: Partial<SupplierQuoteLineRow>) =>
    setLinesBy((by) => ({
      ...by,
      [line.supplier_quote_id]: (by[line.supplier_quote_id] ?? []).map((l) =>
        l.id === line.id ? { ...l, ...patch } : l),
    }))

  async function persistLine(line: SupplierQuoteLineRow) {
    await supabase
      .from('supplier_quote_lines')
      .update({
        sku: line.sku,
        description: line.description,
        qty: line.qty,
        unit: line.unit,
        unit_price_r: line.unit_price_r,
      })
      .eq('id', line.id)
    broadcast()
  }

  async function addLine(sq: SupplierQuoteRow) {
    const existing = linesBy[sq.id] ?? []
    const { data } = await supabase
      .from('supplier_quote_lines')
      .insert({
        supplier_quote_id: sq.id,
        line_no: (existing[existing.length - 1]?.line_no ?? 0) + 1,
      })
      .select('*')
      .single()
    if (data) {
      setLinesBy((by) => ({ ...by, [sq.id]: [...(by[sq.id] ?? []), data as SupplierQuoteLineRow] }))
      broadcast()
    }
  }

  async function removeLine(line: SupplierQuoteLineRow) {
    await supabase.from('supplier_quote_lines').delete().eq('id', line.id)
    setLinesBy((by) => ({
      ...by,
      [line.supplier_quote_id]: (by[line.supplier_quote_id] ?? []).filter((l) => l.id !== line.id),
    }))
    broadcast()
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <div className="text-sm font-semibold">Quoted line items</div>
          <p className="text-xs text-muted-foreground">
            Upload a supplier&rsquo;s quote PDF and its lines are read straight off the document —
            then pull them into sections as you build. Prices are ex&nbsp;VAT; landed cost =
            ×&nbsp;1.15. A photo or a scanned quote has to be typed in below.
          </p>
        </div>

        {/* Upload / manual-add row */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
          />
          <Input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Supplier (optional — parsed from the document)"
            className="h-9 max-w-xs"
          />
          <Button type="button" size="sm" onClick={upload} disabled={uploading}>
            <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload & parse'}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {quotes.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
            No supplier quotes yet. Upload one, or type a supplier name and upload nothing to add lines by hand.
          </p>
        )}

        {quotes.map((sq) => {
          const lines = linesBy[sq.id] ?? []
          const exVatTotal = lines.reduce((sum, l) => sum + l.qty * l.unit_price_r, 0)
          const landedTotal = lines.reduce((sum, l) => sum + l.qty * landedCostR(l.unit_price_r), 0)
          const isCollapsed = collapsed[sq.id] ?? false
          const badge = STATUS_BADGE[sq.status]
          const title = [sq.supplier, sq.reference].filter(Boolean).join(' · ') || sq.source_filename || 'Supplier quote'
          return (
            <div key={sq.id} className="rounded-md border border-border">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm font-medium"
                  onClick={() => setCollapsed((c) => ({ ...c, [sq.id]: !isCollapsed }))}
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {title}
                </button>
                <Badge variant={badge.variant}>{badge.label}</Badge>
                {sq.quote_date && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(sq.quote_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
                {rfqs.length > 0 && (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Answers
                    <select
                      className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
                      value={sq.rfq_id ?? ''}
                      onChange={(e) => linkToRfq(sq, e.target.value || null)}
                    >
                      <option value="">— no RFQ —</option>
                      {rfqs.map((r) => (
                        <option key={r.id} value={r.id}>{r.rfq_number}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {sq.storage_path && (
                    <Button asChild type="button" variant="ghost" size="icon" className="h-7 w-7" title="Open the original document">
                      <a href={`/api/quotes/${requestId}/supplier-quotes/${sq.id}/file`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  {sq.storage_path && (
                    <Button
                      type="button" variant="ghost" size="icon" className="h-7 w-7"
                      title="Re-read the document (replaces the lines below)"
                      disabled={busy === sq.id}
                      onClick={() => reparse(sq)}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === sq.id ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7"
                    title="Remove this supplier quote"
                    disabled={busy === sq.id}
                    onClick={() => removeQuote(sq)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {sq.status === 'failed' && sq.parse_error && (
                <p className="border-t border-border px-3 py-2 text-xs text-destructive">
                  {sq.parse_error} — you can still add lines manually below.
                </p>
              )}
              {/* Parsed, but the lines didn't add up to the document's own subtotal. */}
              {sq.status === 'parsed' && sq.parse_error && (
                <p className="border-t border-border px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  {sq.parse_error}
                </p>
              )}

              {!isCollapsed && (
                <div className="border-t border-border px-3 py-2">
                  {lines.length > 0 && (
                    <div className="hidden gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_4.5rem_4.5rem_7rem_7rem_1.75rem]">
                      <span>SKU</span><span>Description</span><span>Qty</span><span>Unit</span>
                      <span>Ex-VAT</span><span>Landed</span><span />
                    </div>
                  )}
                  <div className="space-y-1">
                    {lines.map((line) => (
                      <div
                        key={line.id}
                        className="grid grid-cols-2 items-center gap-2 rounded border border-border/60 p-1 sm:grid-cols-[7rem_minmax(0,1fr)_4.5rem_4.5rem_7rem_7rem_1.75rem] sm:border-0 sm:p-0"
                      >
                        <Input
                          value={line.sku}
                          onChange={(e) => patchLocal(line, { sku: e.target.value })}
                          onBlur={() => persistLine({ ...line })}
                          placeholder="SKU" className="h-8 text-xs"
                        />
                        <div className="min-w-0">
                          <Input
                            value={line.description}
                            onChange={(e) => patchLocal(line, { description: e.target.value })}
                            onBlur={() => persistLine({ ...line })}
                            placeholder="Description" className="h-8 text-xs"
                          />
                          {line.catalog_id && (
                            <span className="text-[10px] text-muted-foreground">matched to catalog</span>
                          )}
                        </div>
                        <Input
                          type="number" min={0} step="any"
                          value={line.qty === 0 ? '' : String(line.qty)}
                          onChange={(e) => patchLocal(line, { qty: Math.max(0, Number(e.target.value) || 0) })}
                          onBlur={() => persistLine({ ...line })}
                          placeholder="Qty" className="h-8 text-xs"
                        />
                        <Input
                          value={line.unit}
                          onChange={(e) => patchLocal(line, { unit: e.target.value })}
                          onBlur={() => persistLine({ ...line })}
                          placeholder="ea" className="h-8 text-xs"
                        />
                        <Input
                          type="number" min={0} step="any"
                          leadingText="R"
                          value={line.unit_price_r === 0 ? '' : String(line.unit_price_r)}
                          onChange={(e) => patchLocal(line, { unit_price_r: Math.max(0, Number(e.target.value) || 0) })}
                          onBlur={() => persistLine({ ...line })}
                          placeholder="0.00" className="h-8 text-xs"
                        />
                        <span className="px-1 text-xs font-medium">
                          {line.unit_price_r > 0 ? rand(landedCostR(line.unit_price_r)) : '—'}
                        </span>
                        <Button
                          type="button" variant="ghost" size="icon" className="h-7 w-7 justify-self-end"
                          title="Remove line" onClick={() => removeLine(line)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => addLine(sq)}>
                      <Plus className="h-3.5 w-3.5" /> Add line
                    </Button>
                    {/* Totals to eyeball against the document before pulling lines in. */}
                    {lines.length > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Ex VAT <span className="font-medium text-foreground">{rand(exVatTotal)}</span>
                        {' · '}landed {rand(landedTotal)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
