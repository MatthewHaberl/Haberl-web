'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buildPoWorkbook } from '@/lib/procurement/po-workbook'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, Supplier } from '@/types/database'
import {
  AlertTriangle, Briefcase, Check, ChevronLeft, Download, Loader2, Mail, PackageCheck, Send, XCircle,
} from 'lucide-react'

const STATUS_VARIANT: Record<PurchaseOrderStatus, 'default' | 'warning' | 'success' | 'destructive'> = {
  draft: 'default',
  sent: 'warning',
  partial: 'warning',
  received: 'success',
  cancelled: 'destructive',
}

function formatCents(cents: number) {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  po: PurchaseOrder
  supplier: Supplier | null
  job: { id: string; title: string } | null
  initialLines: PurchaseOrderLine[]
}

export function PoDetail({ po, supplier, job, initialLines }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const [status, setStatus] = useState<PurchaseOrderStatus>(po.status)
  const [lines, setLines] = useState<PurchaseOrderLine[]>(initialLines)
  const [received, setReceived] = useState<Record<string, string>>(
    () => Object.fromEntries(initialLines.map((line) => [line.id, String(line.qty_received ?? 0)])),
  )
  const [busy, setBusy] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const totals = useMemo(() => {
    const costCents = lines.reduce((sum, line) => sum + line.qty_ordered * line.unit_cost_cents, 0)
    const shortages = lines.filter(
      (line) => Number(received[line.id] ?? line.qty_received) < line.qty_ordered,
    ).length
    return { costCents, shortages }
  }, [lines, received])

  async function setPoStatus(next: PurchaseOrderStatus, extra: Record<string, unknown> = {}) {
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('purchase_orders')
      .update({ status: next, ...extra })
      .eq('id', po.id)
    if (dbError) setError(dbError.message)
    else setStatus(next)
    setBusy(false)
  }

  // Receiving check-in: save quantities, derive partial/received automatically
  async function saveReceiving() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const supabase = createClient()
      const updates = lines.map((line) => ({
        id: line.id,
        qty: Math.max(0, Number(received[line.id]) || 0),
      }))
      for (const update of updates) {
        const line = lines.find((l) => l.id === update.id)
        if (!line || Number(line.qty_received) === update.qty) continue
        const { error: dbError } = await supabase
          .from('purchase_order_lines')
          .update({ qty_received: update.qty })
          .eq('id', update.id)
        if (dbError) throw new Error(dbError.message)
      }
      const nextLines = lines.map((line) => ({
        ...line,
        qty_received: Math.max(0, Number(received[line.id]) || 0),
      }))
      setLines(nextLines)

      const allReceived = nextLines.every((line) => line.qty_received >= line.qty_ordered)
      const anyReceived = nextLines.some((line) => line.qty_received > 0)
      const nextStatus: PurchaseOrderStatus = allReceived ? 'received' : anyReceived ? 'partial' : status
      if (nextStatus !== status) {
        await setPoStatus(nextStatus)
      }
      setMessage(allReceived ? 'All stock received ✓' : 'Receiving saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save receiving')
    } finally {
      setBusy(false)
    }
  }

  function downloadXlsx() {
    const workbook = buildPoWorkbook({ ...po, status }, lines, supplier)
    const blob = new Blob([workbook.bytes.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = workbook.filename
    link.click()
    URL.revokeObjectURL(url)
  }

  async function emailToSupplier() {
    setEmailing(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/procurement/${po.id}/email`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Email failed')
        return
      }
      setStatus('sent')
      setMessage(`Emailed to ${supplier?.email} ✓`)
      router.refresh()
    } finally {
      setEmailing(false)
    }
  }

  const receivingMode = ['sent', 'partial', 'received'].includes(status)

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/portal/employee/procurement">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-primary font-mono">{po.po_number}</h1>
            <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
            {totals.shortages > 0 && ['sent', 'partial'].includes(status) && (
              <Badge variant="warning">
                <AlertTriangle className="h-3 w-3 mr-1" /> {totals.shortages} line{totals.shortages === 1 ? '' : 's'} short
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {supplier?.name ?? 'No supplier'}
            {po.expected_date && ` · required by ${new Date(po.expected_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}`}
          </p>
        </div>
        {job && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/portal/employee/jobs/${job.id}`}>
              <Briefcase className="h-3.5 w-3.5" /> Job
            </Link>
          </Button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {status === 'draft' && (
          <>
            <Button variant="accent" size="sm" onClick={emailToSupplier} disabled={emailing || !supplier?.email}
              title={supplier?.email ? `Email PO to ${supplier.email}` : 'Supplier has no email — add one in Settings → Suppliers'}>
              {emailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Email to supplier
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPoStatus('sent', { sent_at: new Date().toISOString() })} disabled={busy}>
              <Send className="h-3.5 w-3.5" /> Mark sent (shared manually)
            </Button>
          </>
        )}
        {status === 'sent' && supplier?.email && (
          <Button variant="outline" size="sm" onClick={emailToSupplier} disabled={emailing}>
            {emailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Resend email
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={downloadXlsx}>
          <Download className="h-3.5 w-3.5" /> Download .xlsx
        </Button>
        {!['received', 'cancelled'].includes(status) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={busy}
            onClick={async () => {
              if (await confirm({
                title: 'Cancel this purchase order?',
                confirmText: 'Cancel PO',
                cancelText: 'Keep PO',
                destructive: true,
              })) void setPoStatus('cancelled')
            }}
          >
            <XCircle className="h-3.5 w-3.5" /> Cancel PO
          </Button>
        )}
        {message && <span className="text-xs text-success">{message}</span>}
      </div>

      {/* Lines + receiving */}
      <Card>
        <CardContent className="pt-4 pb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="text-left py-2 pr-3">SKU</th>
                <th className="text-left py-2 pr-3">Description</th>
                <th className="text-center py-2 px-3">Ordered</th>
                <th className="text-right py-2 px-3">Unit Cost</th>
                <th className="text-right py-2 px-3">Line Total</th>
                {receivingMode && <th className="text-center py-2 pl-3">Received</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const receivedQty = Number(received[line.id] ?? line.qty_received) || 0
                const short = receivingMode && receivedQty < line.qty_ordered
                return (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{line.sku || '—'}</td>
                    <td className="py-1.5 pr-3">{line.description}</td>
                    <td className="py-1.5 px-3 text-center font-medium">{line.qty_ordered}</td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">{formatCents(line.unit_cost_cents)}</td>
                    <td className="py-1.5 px-3 text-right">{formatCents(line.qty_ordered * line.unit_cost_cents)}</td>
                    {receivingMode && (
                      <td className="py-1.5 pl-3 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={received[line.id] ?? String(line.qty_received)}
                            onChange={(e) => setReceived((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            disabled={status === 'cancelled'}
                            className={`h-8 w-16 rounded border px-1.5 text-xs text-center bg-background ${
                              short ? 'border-amber-400' : 'border-border'
                            }`}
                          />
                          {short
                            ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                            : <Check className="h-3.5 w-3.5 text-success" />}
                        </span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td colSpan={4} className="py-2 pr-3 text-right">Order total (cost)</td>
                <td className="py-2 px-3 text-right">{formatCents(totals.costCents)}</td>
                {receivingMode && <td />}
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {receivingMode && status !== 'received' && (
        <div className="flex items-center gap-3">
          <Button variant="accent" size="sm" onClick={saveReceiving} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
            Save receiving check-in
          </Button>
          <p className="text-xs text-muted-foreground">
            Enter what arrived — the order flips to Partial/Received automatically and shortages stay flagged.
          </p>
        </div>
      )}

      {po.notes && (
        <p className="text-sm text-muted-foreground"><strong className="text-foreground">Notes:</strong> {po.notes}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
