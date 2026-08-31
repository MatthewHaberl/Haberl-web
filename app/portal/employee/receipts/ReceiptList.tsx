'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/ui/form-field'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ExternalLink, Loader2, Pencil, Trash2, ReceiptText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FIN_PAID_BY, FIN_PAID_BY_LABEL, type FinPaidBy } from '@/lib/finance/types'
import type { JobOption } from './CaptureForm'

export interface ReceiptVM {
  id: string
  supplier_name: string | null
  doc_date: string | null
  total_cents: number | null
  notes: string | null
  job_id: string | null
  job_label: string | null
  paid_by: string
  thumb_url: string | null
  file_name: string | null
  created_at: string
  uploader_name: string | null
  mine: boolean
}

/** The day a receipt belongs to — the slip's own date, else the day it was filed. */
function dayOf(r: ReceiptVM): string {
  return r.doc_date ?? r.created_at.slice(0, 10)
}

export function ReceiptList({
  receipts,
  jobs,
  showUploader,
}: {
  receipts: ReceiptVM[]
  jobs: JobOption[]
  showUploader: boolean
}) {
  if (receipts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <ReceiptText className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-primary">No receipts yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Photograph a slip the moment you get it — it is one less thing to remember at the end of the day.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Group by day so a technician reads the page the way the day happened.
  const days: { day: string; items: ReceiptVM[] }[] = []
  for (const r of receipts) {
    const d = dayOf(r)
    const last = days[days.length - 1]
    if (last && last.day === d) last.items.push(r)
    else days.push({ day: d, items: [r] })
  }

  return (
    <div className="space-y-6">
      {days.map(({ day, items }) => {
        const dayTotal = items.reduce((t, r) => t + (r.total_cents ?? 0), 0)
        return (
          <div key={day} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-primary">{formatDate(day)}</h2>
              <span className="text-sm text-muted-foreground">{formatCurrency(dayTotal)}</span>
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <ReceiptCard key={r.id} receipt={r} jobs={jobs} showUploader={showUploader} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ReceiptCard({
  receipt,
  jobs,
  showUploader,
}: {
  receipt: ReceiptVM
  jobs: JobOption[]
  showUploader: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [supplier, setSupplier] = useState(receipt.supplier_name ?? '')
  const [total, setTotal] = useState(
    receipt.total_cents == null ? '' : (receipt.total_cents / 100).toFixed(2),
  )
  const [date, setDate] = useState(receipt.doc_date ?? dayOf(receipt))
  const [jobId, setJobId] = useState(receipt.job_id ?? '')
  const [paidBy, setPaidBy] = useState(receipt.paid_by)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: supplier,
          total: total.trim(),
          doc_date: date,
          job_id: jobId || null,
          paid_by: paidBy,
        }),
      })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError('Could not save — check your signal and try again')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this receipt?',
      body: 'The photo and its record are removed for good.',
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      router.refresh()
    } catch {
      setError('Could not delete — check your signal and try again')
    } finally {
      setBusy(false)
    }
  }

  const needsAmount = receipt.total_cents == null

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <a
            href={`/api/receipts/${receipt.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            aria-label="Open the full-size photo"
          >
            {receipt.thumb_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not an optimisable static asset
              <img
                src={receipt.thumb_url}
                alt={receipt.supplier_name ?? receipt.file_name ?? 'Receipt'}
                className="h-20 w-20 rounded-md border border-border object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-md border border-border bg-muted">
                <ReceiptText className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </a>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 truncate font-medium text-primary">
                {receipt.supplier_name || 'Shop not filled in'}
              </p>
              {needsAmount ? (
                <Badge variant="warning">Needs an amount</Badge>
              ) : (
                <span className="font-semibold text-primary">{formatCurrency(receipt.total_cents!)}</span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{FIN_PAID_BY_LABEL[receipt.paid_by as FinPaidBy] ?? 'Unknown'}</span>
              {receipt.job_label && <><span>·</span><span className="truncate">{receipt.job_label}</span></>}
              {showUploader && receipt.uploader_name && <><span>·</span><span>{receipt.uploader_name}</span></>}
            </div>

            {receipt.notes && <p className="mt-1 text-xs text-muted-foreground">{receipt.notes}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)} disabled={busy}>
                <Pencil className="h-3.5 w-3.5" /> {editing ? 'Cancel' : 'Edit'}
              </Button>
              <Button type="button" variant="ghost" size="sm" asChild>
                <a href={`/api/receipts/${receipt.id}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> View
                </a>
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        </div>

        {editing && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <FormField label="Shop" htmlFor={`s-${receipt.id}`}>
              <Input id={`s-${receipt.id}`} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </FormField>
            <FormField label="Amount" htmlFor={`t-${receipt.id}`}>
              <Input
                id={`t-${receipt.id}`}
                inputMode="decimal"
                leadingText="R"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </FormField>
            <FormField label="Date" htmlFor={`d-${receipt.id}`}>
              <Input id={`d-${receipt.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField label="Who paid" htmlFor={`p-${receipt.id}`}>
              <Select id={`p-${receipt.id}`} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                {FIN_PAID_BY.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Job" htmlFor={`j-${receipt.id}`} className="sm:col-span-2">
              <Select id={`j-${receipt.id}`} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">— not job related —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.label}</option>
                ))}
              </Select>
            </FormField>
            <div className="sm:col-span-2">
              <Button type="button" variant="accent" onClick={save} disabled={busy}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save changes'}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
