'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react'

interface LineIn { id: string; description: string; qty: number | null; line_total_cents: number | null }
interface Row { key: string; id: string | null; description: string; qty: string; rands: string }

let tmp = 0
const nextKey = () => `new-${tmp++}`

export function DocLinesEdit({
  documentId, lines, docTotalCents,
}: {
  documentId: string
  lines: LineIn[]
  docTotalCents: number | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [removed, setRemoved] = useState<string[]>([])

  function begin() {
    setRows(lines.map((l) => ({
      key: l.id, id: l.id, description: l.description ?? '',
      qty: l.qty != null ? String(l.qty) : '', rands: l.line_total_cents != null ? (l.line_total_cents / 100).toFixed(2) : '0.00',
    })))
    setRemoved([]); setError(null); setEditing(true)
  }
  function setRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, { key: nextKey(), id: null, description: '', qty: '1', rands: '0.00' }])
  }
  function delRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key))
    const row = rows.find((r) => r.key === key)
    if (row?.id) setRemoved((d) => [...d, row.id!])
  }

  const editTotalCents = rows.reduce((s, r) => s + Math.round(Number(r.rands || 0) * 100), 0)
  const viewSum = lines.reduce((s, l) => s + (l.line_total_cents ?? 0), 0)

  async function save() {
    setBusy(true); setError(null)
    try {
      const orig = new Map(lines.map((l) => [l.id, l]))
      // deletes
      for (const id of removed) {
        const res = await fetch(`/api/finance/documents/${documentId}/lines?line_id=${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(await res.text())
      }
      // adds + updates
      for (const r of rows) {
        const payload = { description: r.description, qty: Number(r.qty || 0), line_total_cents: Math.round(Number(r.rands || 0) * 100) }
        if (!r.id) {
          const res = await fetch(`/api/finance/documents/${documentId}/lines`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(await res.text())
        } else {
          const o = orig.get(r.id)
          const changed = !o || (o.description ?? '') !== r.description
            || String(o.qty ?? '') !== r.qty
            || (o.line_total_cents ?? 0) !== payload.line_total_cents
          if (changed) {
            const res = await fetch(`/api/finance/documents/${documentId}/lines`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, ...payload }),
            })
            if (!res.ok) throw new Error(await res.text())
          }
        }
      }
      setEditing(false); router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Transaction lines
        </CardTitle>
        {!editing && (
          <button type="button" onClick={begin}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <Pencil className="h-3.5 w-3.5" /> Edit lines
          </button>
        )}
      </CardHeader>
      <CardContent className={editing ? 'space-y-3' : 'p-0'}>
        {!editing ? (
          lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No itemised lines — click &ldquo;Edit lines&rdquo; to add them, or open the original.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium w-12 text-right">Qty</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium text-right w-32">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l) => (
                    <tr key={l.id} className="align-top">
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{l.qty != null ? Number(l.qty) : ''}</td>
                      <td className="px-4 py-2">{l.description}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(l.line_total_cents ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-medium">
                    <td />
                    <td className="px-4 py-2 text-right text-muted-foreground">Lines total</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(viewSum)}</td>
                  </tr>
                  {docTotalCents != null && (
                    <tr className="text-muted-foreground">
                      <td />
                      <td className="px-4 py-1 text-right">Document total</td>
                      <td className="px-4 py-1 text-right tabular-nums">{formatCurrency(docTotalCents)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )
        ) : (
          <>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="flex items-center gap-2">
                  <input value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })}
                    className="h-9 w-14 rounded-md border border-border bg-background px-2 text-right text-sm" placeholder="Qty" />
                  <input value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })}
                    className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm" placeholder="Description" />
                  <span className="text-sm text-muted-foreground">R</span>
                  <input type="number" step="0.01" value={r.rands} onChange={(e) => setRow(r.key, { rands: e.target.value })}
                    className="h-9 w-28 rounded-md border border-border bg-background px-2 text-right text-sm" />
                  <button type="button" onClick={() => delRow(r.key)} className="text-muted-foreground hover:text-red-600" aria-label="Remove line">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
              <Plus className="h-4 w-4" /> Add line
            </button>
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">Lines total</span>
              <span className="font-medium tabular-nums">{formatCurrency(editTotalCents)}</span>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} onClick={save}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save lines'}
              </button>
              <button type="button" onClick={() => setEditing(false)}
                className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Cancel</button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
