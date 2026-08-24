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
  Check, ChevronDown, ChevronRight, ExternalLink, ListPlus, Plus, RefreshCw, Tags, Trash2, Upload,
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
import { ApplySupplierPricesDialog } from './ApplySupplierPricesDialog'
import {
  SUPPLIER_PRICES_STATE, requestClearSupplierPrices, requestSupplierPriceState,
  type StateDetail,
} from './supplier-prices-bus'
import {
  requestAddSupplierLines, useSupplierLineTargets, type AddableSupplierLine,
} from './supplier-lines-bus'

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
  // Which supplier quote the "apply prices" review is open on.
  const [applyingId, setApplyingId] = useState<string | null>(null)
  // How many prices each document currently has on the quote — published by
  // whichever builder is on the page, since it owns the quote's live state.
  const [appliedBy, setAppliedBy] = useState<Record<string, number>>({})
  // Where a document line can be added, and which are on the quote already —
  // published by whichever builder is on the page (see supplier-lines-bus).
  const { targets, addedLineIds } = useSupplierLineTargets()
  const [targetId, setTargetId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const onQuote = useMemo(() => new Set(addedLineIds), [addedLineIds])
  // Follow the builder's first section until someone picks another, and don't
  // strand the picker on a section that has since been renamed away.
  const activeTarget = targets.find((t) => t.id === targetId) ?? targets[0] ?? null

  const toAddable = (l: SupplierQuoteLineRow, supplierLabel: string): AddableSupplierLine => ({
    lineId: l.id,
    supplierQuoteId: l.supplier_quote_id,
    supplierLabel,
    sku: l.sku,
    description: l.description,
    qty: l.qty,
    unit: l.unit,
    unitPriceExVatR: l.unit_price_r,
  })

  function addLinesToQuote(lines: SupplierQuoteLineRow[], supplierLabel: string) {
    if (!activeTarget) return
    const fresh = lines.filter((l) => !onQuote.has(l.id))
    if (!fresh.length) return
    requestAddSupplierLines({
      targetId: activeTarget.id,
      lines: fresh.map((l) => toAddable(l, supplierLabel)),
    })
  }

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

  useEffect(() => {
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<StateDetail>).detail
      setAppliedBy(detail?.countBySupplierQuote ?? {})
    }
    window.addEventListener(SUPPLIER_PRICES_STATE, onState)
    requestSupplierPriceState()
    return () => window.removeEventListener(SUPPLIER_PRICES_STATE, onState)
  }, [])

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
            Upload a supplier&rsquo;s quote PDF and its lines are read straight off the document.
            {' '}<strong className="font-medium text-foreground">Apply prices</strong>{' '}reprices every
            item on this quote that the document covers, in one go — and tells you which items it
            doesn&rsquo;t, so you can price those yourself.{' '}
            <strong className="font-medium text-foreground">Add all</strong>{' '}puts every line on
            the document onto the quote as its own item; <strong className="font-medium text-foreground">Add</strong>{' '}
            does one. Both skip anything already there. Prices are ex&nbsp;VAT; landed cost =
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

        {/* Where "Add" puts a line. One section on the quote (and the solar
            canvas, which has a single home for them) needs no choosing, so the
            row only appears when there is genuinely a decision to make. */}
        {targets.length > 1 && activeTarget && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Add lines to
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={activeTarget.id}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        )}

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
          const applied = appliedBy[sq.id] ?? 0
          const badge = STATUS_BADGE[sq.status]
          const title = [sq.supplier, sq.reference].filter(Boolean).join(' · ') || sq.source_filename || 'Supplier quote'
          const notOnQuote = lines.filter((l) => !onQuote.has(l.id))
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
                {applied > 0 && (
                  <Badge variant="success">{applied} price{applied === 1 ? '' : 's'} applied</Badge>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {lines.length > 0 && activeTarget && (
                    <Button
                      type="button" variant="outline" size="sm"
                      disabled={notOnQuote.length === 0}
                      onClick={() => addLinesToQuote(lines, title)}
                      title={notOnQuote.length === 0
                        ? 'Every line on this document is already on the quote'
                        : `Add all ${notOnQuote.length} to ${activeTarget.label} at the quoted price`}
                    >
                      <ListPlus className="h-3.5 w-3.5" />
                      {notOnQuote.length === 0
                        ? 'All on quote'
                        : `Add all ${notOnQuote.length} to quote`}
                    </Button>
                  )}
                  {lines.length > 0 && (
                    <Button
                      type="button" variant={applied > 0 ? 'outline' : 'default'} size="sm"
                      onClick={() => setApplyingId(sq.id)}
                      title="Reprice every item on this quote that this document covers"
                    >
                      <Tags className="h-3.5 w-3.5" />
                      {applied > 0 ? 'Update prices' : 'Apply prices'}
                    </Button>
                  )}
                  {applied > 0 && (
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={() => requestClearSupplierPrices({ supplierQuoteId: sq.id })}
                      title="Put every line this document repriced back on its catalog price"
                    >
                      Undo
                    </Button>
                  )}
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
                    <div className="hidden gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_4.5rem_4.5rem_7rem_7rem_5.5rem_1.75rem]">
                      <span>SKU</span><span>Description</span><span>Qty</span><span>Unit</span>
                      <span>Ex-VAT</span><span>Landed</span><span>On quote</span><span />
                    </div>
                  )}
                  <div className="space-y-1">
                    {lines.map((line) => (
                      <div
                        key={line.id}
                        className="grid grid-cols-2 items-center gap-2 rounded border border-border/60 p-1 sm:grid-cols-[7rem_minmax(0,1fr)_4.5rem_4.5rem_7rem_7rem_5.5rem_1.75rem] sm:border-0 sm:p-0"
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
                        {/* Straight from the document onto the quote, at the
                            quoted price — no hunting for the same part in the
                            section footer's picker. */}
                        {activeTarget ? (
                          onQuote.has(line.id) ? (
                            <span className="flex items-center gap-1 px-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5" /> Added
                            </span>
                          ) : (
                            <Button
                              type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]"
                              title={`Add to ${activeTarget.label} at the quoted price`}
                              onClick={() => addLinesToQuote([line], title)}
                            >
                              <Plus className="h-3 w-3" /> Add
                            </Button>
                          )
                        ) : <span />}
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
      {applyingId && (
        <ApplySupplierPricesDialog
          requestId={requestId}
          supplierQuoteId={applyingId}
          onClose={() => setApplyingId(null)}
        />
      )}
    </Card>
  )
}
