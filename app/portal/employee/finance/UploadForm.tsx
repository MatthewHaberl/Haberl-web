'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, Loader2 } from 'lucide-react'
import { FIN_DOC_TYPES } from '@/lib/finance/types'

const selectCls =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function UploadForm({ customers }: { customers: { id: string; full_name: string }[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const fd = new FormData(form)
    const file = fd.get('file')
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a file to upload')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/finance/documents', { method: 'POST', body: fd })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      form.reset()
      setFileName(null)
      router.refresh()
    } catch {
      setError('Upload failed — check your connection and try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" /> Upload a document
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">File *</label>
            <Input
              type="file"
              name="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,.csv,.xls,.xlsx,image/*,application/pdf"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
            {fileName && <p className="text-xs text-muted-foreground mt-1 truncate">{fileName}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
            <select name="doc_type" defaultValue="supplier_invoice" className={selectCls}>
              {FIN_DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Supplier</label>
            <Input type="text" name="supplier_name" placeholder="e.g. ARB, Communica…" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Doc number</label>
            <Input type="text" name="doc_number" placeholder="Invoice / receipt no." />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
            <Input type="date" name="doc_date" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Total (R)</label>
            <Input type="text" inputMode="decimal" name="total" placeholder="0.00" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Customer (optional)</label>
            <select name="customer_id" defaultValue="" className={selectCls}>
              <option value="">— none —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <Input type="text" name="notes" placeholder="Anything worth remembering about this document" />
          </div>

          {error && (
            <p className="text-sm text-destructive sm:col-span-2 lg:col-span-3">{error}</p>
          )}

          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" variant="accent" disabled={busy}>
              {busy
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                : <><Upload className="h-4 w-4" /> Upload document</>}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
