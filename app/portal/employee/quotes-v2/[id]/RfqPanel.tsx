'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Request pricing (W99) — the outbound half of the supplier-quote loop.
//
// Builds a list of everything on the quote that a supplier would price, off the
// quote's own BOM, and sends it out. Two cases it exists for: an item with no
// part number (the M8-nuts-and-bolts case, which prints under its own "please
// advise the code" heading), and catalog costs old enough to have moved since
// the price-list import.
//
// The list opens as a draft with every material line on it — untick, edit, or
// add rows, type a note, then Send / Copy / WhatsApp. Whatever comes back gets
// uploaded in the panel below, against this RFQ.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check, ChevronDown, ChevronRight, Copy, Mail, MessageCircle, Plus, Send,
  Trash2, TriangleAlert, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  groupRfqLines, type RfqStatus, type SupplierRfqLineRow, type SupplierRfqRow,
} from '@/lib/quotes/supplier-rfq'

/** Fires when an RFQ is created/sent so the supplier-quote panel can re-read its options. */
export const RFQS_CHANGED = 'haberl:rfqs-changed'

const STATUS_BADGE: Record<RfqStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  sent: { label: 'Sent', variant: 'default' },
  quoted: { label: 'Quote received', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

interface SupplierOption { id: string; name: string; email: string | null; phone: string | null }

interface Preview {
  subject: string
  to: string | null
  supplierPhone: string | null
  text: string
  whatsappUrl: string
  lineCount: number
}

export function RfqPanel({ requestId }: { requestId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [rfqs, setRfqs] = useState<SupplierRfqRow[]>([])
  const [linesBy, setLinesBy] = useState<Record<string, SupplierRfqLineRow[]>>({})
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/quotes/${requestId}/rfqs`)
    if (!res.ok) return
    const body = await res.json() as { rfqs: SupplierRfqRow[]; lines: SupplierRfqLineRow[] }
    setRfqs(body.rfqs)
    const by: Record<string, SupplierRfqLineRow[]> = {}
    for (const line of body.lines) (by[line.rfq_id] ??= []).push(line)
    setLinesBy(by)
  }, [requestId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- both loads are async; their setStates run after the fetch resolves, not synchronously in the effect body.
    load()
    supabase.from('suppliers').select('id, name, email, phone').eq('active', true).order('name')
      .then(({ data }) => setSuppliers((data ?? []) as SupplierOption[]))
  }, [load, supabase])

  // Re-render the preview whenever the open RFQ's lines or note change, so what
  // the dialog shows is always what the send route would actually put in the mail.
  const refreshPreview = useCallback(async (rfqId: string) => {
    const res = await fetch(`/api/quotes/${requestId}/rfqs/${rfqId}/send`)
    if (res.ok) setPreview(await res.json() as Preview)
  }, [requestId])

  async function createDraft() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/quotes/${requestId}/rfqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: suppliers[0]?.id ?? null }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Could not build the list')
        return
      }
      await load()
      setOpenId(body.rfq.id)
      await refreshPreview(body.rfq.id)
      window.dispatchEvent(new CustomEvent(RFQS_CHANGED))
    } finally {
      setCreating(false)
    }
  }

  // ── Line editing (straight to the table under manager/admin RLS) ────────────

  const patchLocal = (line: SupplierRfqLineRow, patch: Partial<SupplierRfqLineRow>) =>
    setLinesBy((by) => ({
      ...by,
      [line.rfq_id]: (by[line.rfq_id] ?? []).map((l) => (l.id === line.id ? { ...l, ...patch } : l)),
    }))

  async function persistLine(line: SupplierRfqLineRow) {
    // A code typed in is a code we have — the line moves out of the "advise the
    // part number" group without anyone having to think about it. Mirrored into
    // local state as well, or the grouping and the count would keep showing it
    // there until the next full load while the sent text already reads right.
    const needsCode = !line.sku.trim()
    if (needsCode !== line.needs_code) patchLocal(line, { needs_code: needsCode })
    await supabase
      .from('supplier_rfq_lines')
      .update({
        sku: line.sku,
        description: line.description,
        qty: line.qty,
        unit: line.unit,
        note: line.note,
        needs_code: needsCode,
      })
      .eq('id', line.id)
    await refreshPreview(line.rfq_id)
  }

  async function addLine(rfqId: string) {
    const existing = linesBy[rfqId] ?? []
    const { data } = await supabase
      .from('supplier_rfq_lines')
      .insert({
        rfq_id: rfqId,
        line_no: (existing[existing.length - 1]?.line_no ?? 0) + 1,
        description: '',
        qty: 1,
        needs_code: true,
      })
      .select('*')
      .single()
    if (data) {
      setLinesBy((by) => ({ ...by, [rfqId]: [...(by[rfqId] ?? []), data as SupplierRfqLineRow] }))
      await refreshPreview(rfqId)
    }
  }

  async function removeLine(line: SupplierRfqLineRow) {
    await supabase.from('supplier_rfq_lines').delete().eq('id', line.id)
    setLinesBy((by) => ({ ...by, [line.rfq_id]: (by[line.rfq_id] ?? []).filter((l) => l.id !== line.id) }))
    await refreshPreview(line.rfq_id)
  }

  // ── Header editing ─────────────────────────────────────────────────────────

  async function patchRfq(rfq: SupplierRfqRow, patch: Partial<SupplierRfqRow>) {
    setRfqs((rows) => rows.map((r) => (r.id === rfq.id ? { ...r, ...patch } : r)))
    await fetch(`/api/quotes/${requestId}/rfqs/${rfq.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await refreshPreview(rfq.id)
  }

  async function removeRfq(rfq: SupplierRfqRow) {
    const gone = rfq.status !== 'draft'
    const question = gone
      ? `Cancel ${rfq.rfq_number}? It stays on the quote as a record of what was asked.`
      : `Delete ${rfq.rfq_number} and its ${linesBy[rfq.id]?.length ?? 0} lines?`
    if (!confirm(question)) return
    setBusy(rfq.id)
    try {
      const res = gone
        ? await fetch(`/api/quotes/${requestId}/rfqs/${rfq.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        })
        : await fetch(`/api/quotes/${requestId}/rfqs/${rfq.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? 'Could not remove the RFQ')
        return
      }
      if (openId === rfq.id) setOpenId(null)
      await load()
    } finally {
      setBusy(null)
    }
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  async function send(rfq: SupplierRfqRow, channel: 'email' | 'copy' | 'whatsapp') {
    setBusy(rfq.id)
    setError(null)
    try {
      const res = await fetch(`/api/quotes/${requestId}/rfqs/${rfq.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Could not send the RFQ')
        return false
      }
      await load()
      window.dispatchEvent(new CustomEvent(RFQS_CHANGED))
      return true
    } finally {
      setBusy(null)
    }
  }

  async function copyText(rfq: SupplierRfqRow) {
    if (!preview) return
    try {
      await navigator.clipboard.writeText(preview.text)
    } catch {
      setError('Could not reach the clipboard — select the text below and copy it by hand.')
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    // Copying IS the send on this path: mark it, unless it already went out.
    if (rfq.status === 'draft') await send(rfq, 'copy')
  }

  async function shareWhatsApp(rfq: SupplierRfqRow) {
    if (!preview) return
    // Open the tab from the click itself — a popup opened after an await is blocked.
    window.open(preview.whatsappUrl, '_blank', 'noopener,noreferrer')
    if (rfq.status === 'draft') await send(rfq, 'whatsapp')
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Request pricing from a supplier</div>
            <p className="text-xs text-muted-foreground">
              Builds the list off this quote&rsquo;s bill of materials — every item a supplier
              would price, including the ones with no part number yet. Send it, then load their
              reply in <span className="font-medium">Quoted line items</span> below.
            </p>
          </div>
          <Button size="sm" onClick={createDraft} disabled={creating}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {creating ? 'Building…' : 'Build RFQ'}
          </Button>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}

        {rfqs.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No pricing requests yet.
          </p>
        )}

        {/* One row per RFQ; the open one expands into the editor + preview. */}
        <div className="space-y-2">
          {rfqs.map((rfq) => {
            const lines = linesBy[rfq.id] ?? []
            const noCode = lines.filter((l) => l.needs_code || !l.sku.trim()).length
            const isOpen = openId === rfq.id
            const badge = STATUS_BADGE[rfq.status]
            return (
              <div key={rfq.id} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 text-left"
                    onClick={async () => {
                      const next = isOpen ? null : rfq.id
                      setOpenId(next)
                      setPreview(null)
                      if (next) await refreshPreview(next)
                    }}
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="font-mono text-xs font-semibold">{rfq.rfq_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {rfq.supplier_name || 'No supplier'} · {lines.length} item{lines.length === 1 ? '' : 's'}
                    </span>
                    {noCode > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                        <TriangleAlert className="h-3 w-3" /> {noCode} without a code
                      </span>
                    )}
                  </button>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {rfq.sent_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {rfq.sent_via === 'email' ? 'emailed' : rfq.sent_via === 'whatsapp' ? 'WhatsApp' : 'copied'}{' '}
                      {new Date(rfq.sent_at).toLocaleDateString('en-ZA')}
                    </span>
                  )}
                  {rfq.status !== 'cancelled' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === rfq.id}
                      onClick={() => removeRfq(rfq)}
                      aria-label={rfq.status === 'draft' ? 'Delete RFQ' : 'Cancel RFQ'}
                    >
                      {rfq.status === 'draft' ? <Trash2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-4 border-t border-border px-3 py-3">
                    {/* Who it goes to + the note above the table */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-muted-foreground">Supplier</span>
                        <select
                          className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
                          value={rfq.supplier_id ?? ''}
                          onChange={(e) => {
                            const picked = suppliers.find((s) => s.id === e.target.value) ?? null
                            patchRfq(rfq, { supplier_id: picked?.id ?? null, supplier_name: picked?.name ?? '' })
                          }}
                        >
                          <option value="">— choose —</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <span className="block text-[11px] text-muted-foreground">
                          {preview?.to
                            ? `Emails ${preview.to}`
                            : 'No email on file — Settings → Suppliers, or send by WhatsApp'}
                        </span>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Anything you&rsquo;d like to add
                        </span>
                        <Textarea
                          rows={3}
                          placeholder="e.g. Needed for a Kyalami install on the 28th — please confirm stock."
                          defaultValue={rfq.message ?? ''}
                          onBlur={(e) => {
                            if (e.target.value !== (rfq.message ?? '')) patchRfq(rfq, { message: e.target.value })
                          }}
                        />
                      </label>
                    </div>

                    {/* The list itself, grouped the way it prints */}
                    <div className="space-y-3">
                      {groupRfqLines(lines).map((group) => (
                        <div key={group.heading}>
                          <div className={`mb-1 text-[11px] font-semibold ${group.needsCode ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                            {group.heading}
                          </div>
                          <div className="space-y-1">
                            {group.lines.map((line) => (
                              <div key={line.id} className="flex flex-wrap items-center gap-1.5">
                                <Input
                                  className="w-32 font-mono text-xs"
                                  placeholder="code?"
                                  value={line.sku}
                                  onChange={(e) => patchLocal(line, { sku: e.target.value })}
                                  onBlur={() => persistLine(line)}
                                />
                                <Input
                                  className="min-w-[12rem] flex-1 text-xs"
                                  placeholder="What to quote"
                                  value={line.description}
                                  onChange={(e) => patchLocal(line, { description: e.target.value })}
                                  onBlur={() => persistLine(line)}
                                />
                                <Input
                                  className="w-20 text-xs"
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={line.qty}
                                  onChange={(e) => patchLocal(line, { qty: Number(e.target.value) })}
                                  onBlur={() => persistLine(line)}
                                />
                                <Input
                                  className="w-16 text-xs"
                                  value={line.unit}
                                  onChange={(e) => patchLocal(line, { unit: e.target.value })}
                                  onBlur={() => persistLine(line)}
                                />
                                <Input
                                  className="w-44 text-xs"
                                  placeholder="note to supplier"
                                  value={line.note ?? ''}
                                  onChange={(e) => patchLocal(line, { note: e.target.value })}
                                  onBlur={() => persistLine(line)}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeLine(line)}
                                  aria-label={`Remove ${line.description || 'line'}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => addLine(rfq.id)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add an item
                      </Button>
                    </div>

                    {/* Exactly what goes out */}
                    <div>
                      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                        What the supplier will get
                      </div>
                      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                        {preview?.text ?? 'Loading…'}
                      </pre>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={busy === rfq.id || !preview?.to || !lines.length}
                        onClick={() => send(rfq, 'email')}
                      >
                        {rfq.status === 'sent' || rfq.status === 'quoted'
                          ? <Send className="mr-1.5 h-3.5 w-3.5" />
                          : <Mail className="mr-1.5 h-3.5 w-3.5" />}
                        {busy === rfq.id ? 'Sending…' : rfq.sent_via === 'email' ? 'Send again' : 'Send email'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={!preview} onClick={() => copyText(rfq)}>
                        {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy text'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={!preview} onClick={() => shareWhatsApp(rfq)}>
                        <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                      </Button>
                      {!preview?.to && (
                        <span className="text-[11px] text-muted-foreground">
                          Email needs an address on the supplier — copy or WhatsApp work either way.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
