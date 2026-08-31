'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { Camera, Images, Loader2, X, Check } from 'lucide-react'
import { FIN_PAID_BY } from '@/lib/finance/types'

export interface JobOption { id: string; label: string; scheduled_date: string | null }

const MAX_FILES = 10

/**
 * Capture a slip on site. The whole point is that it takes seconds on a phone
 * with one hand, so the camera is the primary action and everything below it
 * is optional — a photo with nothing filled in is still worth far more to the
 * office than a slip that stays in someone's pocket.
 *
 * The job, the date and who paid stay put after a save: a technician files
 * several slips from the same job in a row, and re-picking them each time is
 * what stops people using it.
 */
export function CaptureForm({ jobs, defaultDate }: { jobs: JobOption[]; defaultDate: string }) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [supplier, setSupplier] = useState('')
  const [total, setTotal] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [jobId, setJobId] = useState('')
  const [paidBy, setPaidBy] = useState('company_card')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  // Object URLs are a manual resource — without the revoke the page leaks a
  // blob per photo for as long as the technician keeps the tab open.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- previews mirror an external resource (object URLs) that must be revoked
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setError(null)
    setSaved(null)
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_FILES))
  }

  function removeAt(i: number) {
    setFiles((prev) => prev.filter((_, n) => n !== i))
  }

  async function submit() {
    if (files.length === 0) {
      setError('Take a photo of the slip first')
      return
    }
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)
      if (supplier.trim()) fd.set('supplier_name', supplier.trim())
      if (total.trim() && files.length === 1) fd.set('total', total.trim())
      if (date) fd.set('doc_date', date)
      if (jobId) fd.set('job_id', jobId)
      fd.set('paid_by', paidBy)
      if (notes.trim()) fd.set('notes', notes.trim())

      const res = await fetch('/api/receipts', { method: 'POST', body: fd })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      const body = (await res.json()) as { ids: string[]; failed?: string[] }
      // Only the per-slip fields reset — job, date and payment method are the
      // ones that repeat, so they stay set for the next receipt.
      setFiles([])
      setSupplier('')
      setTotal('')
      setNotes('')
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
      setSaved(
        body.failed?.length
          ? `Saved ${body.ids.length}. ${body.failed.length} photo${body.failed.length === 1 ? '' : 's'} did not go through — try those again.`
          : `Saved ${body.ids.length} receipt${body.ids.length === 1 ? '' : 's'}.`,
      )
      router.refresh()
    } catch {
      setError('Upload failed — check your signal and try again')
    } finally {
      setBusy(false)
    }
  }

  const many = files.length > 1

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,.heic"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="accent"
            className="h-14 text-base"
            onClick={() => cameraRef.current?.click()}
            disabled={busy || files.length >= MAX_FILES}
          >
            <Camera className="h-5 w-5" /> Take a photo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 text-base"
            onClick={() => galleryRef.current?.click()}
            disabled={busy || files.length >= MAX_FILES}
          >
            <Images className="h-5 w-5" /> From my photos
          </Button>
        </div>

        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, never a remote asset */}
                <img src={src} alt={`Receipt ${i + 1}`} className="h-24 w-24 rounded-md border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1 shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Shop" htmlFor="r-supplier" hint="Where you bought it — Builders, ARB, the garage…">
            <Input
              id="r-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Shop or supplier"
              autoComplete="off"
            />
          </FormField>

          <FormField
            label="Amount"
            htmlFor="r-total"
            hint={many ? 'Several photos at once — add each amount after saving' : 'What the slip says, including VAT'}
          >
            <Input
              id="r-total"
              inputMode="decimal"
              leadingText="R"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              disabled={many}
            />
          </FormField>

          <FormField label="Date" htmlFor="r-date">
            <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>

          <FormField label="Who paid" htmlFor="r-paid">
            <Select id="r-paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {FIN_PAID_BY.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Job"
            htmlFor="r-job"
            className="sm:col-span-2"
            hint="Optional — helps the office bill it to the right customer"
          >
            <Select id="r-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">— not job related —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.label}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Note" htmlFor="r-notes" className="sm:col-span-2">
            <Textarea
              id="r-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What it was for, if the slip does not make it obvious"
            />
          </FormField>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" /> {saved}
          </p>
        )}

        <Button type="button" variant="accent" className="h-12 w-full text-base" onClick={submit} disabled={busy}>
          {busy ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Saving…</>
          ) : (
            <>Save {files.length > 1 ? `${files.length} receipts` : 'receipt'}</>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
