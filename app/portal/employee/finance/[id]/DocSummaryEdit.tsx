'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ExternalLink, Pencil } from 'lucide-react'
import { FIN_DOC_TYPES, FIN_DOC_TYPE_LABEL, type FinDocType } from '@/lib/finance/types'

export interface DocHeader {
  id: string
  supplier_name: string | null
  doc_number: string | null
  doc_date: string | null
  doc_type: FinDocType
  total_cents: number | null
  file_name: string | null
}

export function DocSummaryEdit({ doc, customerName }: { doc: DocHeader; customerName: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [supplier, setSupplier] = useState(doc.supplier_name ?? '')
  const [docNo, setDocNo] = useState(doc.doc_number ?? '')
  const [date, setDate] = useState(doc.doc_date ?? '')
  const [type, setType] = useState<FinDocType>(doc.doc_type)
  const [total, setTotal] = useState(doc.total_cents != null ? (doc.total_cents / 100).toFixed(2) : '')

  function reset() {
    setSupplier(doc.supplier_name ?? ''); setDocNo(doc.doc_number ?? ''); setDate(doc.doc_date ?? '')
    setType(doc.doc_type); setTotal(doc.total_cents != null ? (doc.total_cents / 100).toFixed(2) : '')
    setError(null)
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/finance/documents/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: supplier, doc_number: docNo, doc_date: date || null,
          doc_type: type, total_cents: total === '' ? null : Math.round(Number(total) * 100),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditing(false); router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally { setBusy(false) }
  }

  if (!editing) {
    return (
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-6">
          <Field label="Supplier" value={doc.supplier_name ?? '—'} />
          <Field label="Document no." value={doc.doc_number ?? '—'} />
          <Field label="Date" value={doc.doc_date ? formatDate(doc.doc_date) : '—'} />
          <Field label="Total (incl VAT)" value={doc.total_cents != null ? formatCurrency(doc.total_cents) : '—'} />
          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-3 pt-1">
            <Badge variant="outline">{FIN_DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}</Badge>
            {customerName && <Badge variant="accent">{customerName}</Badge>}
            <button
              type="button" onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit details
            </button>
            <a
              href={`/api/finance/documents/${doc.id}`} target="_blank" rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" /> Open original ({doc.file_name?.split('.').pop()?.toUpperCase() || 'file'})
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-accent">
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-6">
        <EditField label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} /></EditField>
        <EditField label="Document no."><input value={docNo} onChange={(e) => setDocNo(e.target.value)} className={inputCls} /></EditField>
        <EditField label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></EditField>
        <EditField label="Total (incl VAT)">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">R</span>
            <input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className={inputCls} />
          </div>
        </EditField>
        <EditField label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as FinDocType)} className={inputCls}>
            {FIN_DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </EditField>
        <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 pt-1">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button type="button" disabled={busy} onClick={save}
            className="ml-auto h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => { reset(); setEditing(false) }}
            className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Cancel</button>
        </div>
      </CardContent>
    </Card>
  )
}

const inputCls = 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  )
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  )
}
