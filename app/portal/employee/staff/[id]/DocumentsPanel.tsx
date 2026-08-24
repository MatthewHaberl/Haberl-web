'use client'

// The person's file: ID, licences, contract, certificates, banking letter.
// Files sit in the private staff-docs bucket — nothing here is a public URL,
// every "Open" is a fresh 60-second signed link from the API route.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Download, ExternalLink, FileText, Pencil, Trash2, Upload, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  STAFF_DOC_TYPES,
  expiryState,
  expiryWording,
  fileSizeLabel,
} from '@/lib/staff/documents'
import type { StaffDocument, StaffDocumentType } from '@/types/database'

export interface DocRow extends Pick<
  StaffDocument,
  'id' | 'doc_type' | 'title' | 'doc_number' | 'issued_on' | 'expires_on' | 'notes' | 'file_name' | 'file_size' | 'created_at'
> {
  uploadedByName: string | null
}

const META = new Map(STAFF_DOC_TYPES.map((t) => [t.value, t]))

const blankForm = {
  doc_type: 'id_document' as StaffDocumentType,
  title: '',
  doc_number: '',
  issued_on: '',
  expires_on: '',
  notes: '',
}

export function DocumentsPanel({
  staffId,
  staffName,
  documents,
  today,
}: {
  staffId: string
  staffName: string
  documents: DocRow[]
  /** 'YYYY-MM-DD' fixed on the server, so expiry reads the same for everyone. */
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState(blankForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [edit, setEdit] = useState(blankForm)

  const meta = META.get(form.doc_type)

  async function upload() {
    if (!file) {
      setError('Choose a file to upload')
      return
    }
    setBusy(true)
    setError(null)

    const fd = new FormData()
    fd.set('staff_id', staffId)
    fd.set('file', file)
    fd.set('doc_type', form.doc_type)
    if (form.title.trim()) fd.set('title', form.title.trim())
    if (form.doc_number.trim()) fd.set('doc_number', form.doc_number.trim())
    if (form.issued_on) fd.set('issued_on', form.issued_on)
    if (form.expires_on) fd.set('expires_on', form.expires_on)
    if (form.notes.trim()) fd.set('notes', form.notes.trim())

    try {
      const res = await fetch('/api/staff/documents', { method: 'POST', body: fd })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      setForm(blankForm)
      setFile(null)
      setOpen(false)
      router.refresh()
    } catch {
      setError('Upload failed — check your connection and try again')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(row: DocRow) {
    setEditing(row.id)
    setError(null)
    setEdit({
      doc_type: row.doc_type,
      title: row.title,
      doc_number: row.doc_number ?? '',
      issued_on: row.issued_on ?? '',
      expires_on: row.expires_on ?? '',
      notes: row.notes ?? '',
    })
  }

  async function saveEdit(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: edit.doc_type,
          title: edit.title,
          doc_number: edit.doc_number,
          issued_on: edit.issued_on,
          expires_on: edit.expires_on,
          notes: edit.notes,
        }),
      })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      setEditing(null)
      router.refresh()
    } catch {
      setError('Could not save the change')
    } finally {
      setBusy(false)
    }
  }

  async function remove(row: DocRow) {
    if (!confirm(`Delete “${row.title}”? The file is removed for good.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/documents/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      router.refresh()
    } catch {
      setError('Could not delete the document')
    } finally {
      setBusy(false)
    }
  }

  // Grouped in the order STAFF_DOC_TYPES declares — identity, then trade, then
  // employment — so the tab always reads the same way person to person.
  const groups = STAFF_DOC_TYPES.map((t) => ({
    meta: t,
    rows: documents.filter((d) => d.doc_type === t.value),
  })).filter((g) => g.rows.length > 0)

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Documents</h2>
            <p className="text-xs text-muted-foreground">
              {staffName}&apos;s ID, licences, contract and certificates. Files are private — links
              expire a minute after you open them.
            </p>
          </div>
          <Button type="button" size="sm" variant={open ? 'outline' : 'default'} onClick={() => setOpen(!open)}>
            <Upload className="mr-2 h-4 w-4" />
            {open ? 'Close' : 'Upload'}
          </Button>
        </div>

        {open && (
          <div className="mb-6 grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <FormField label="Type" htmlFor="doc-type" hint={meta?.hint} className="lg:col-span-2">
              <Select
                id="doc-type"
                value={form.doc_type}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value as StaffDocumentType })}
              >
                {STAFF_DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="File"
              htmlFor="doc-file"
              hint="Photo, PDF or Word — up to 25 MB."
              className="lg:col-span-4"
            >
              <Input
                id="doc-file"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.doc,.docx,image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              />
            </FormField>

            <FormField
              label="Name"
              htmlFor="doc-title"
              hint="Left blank, the file's own name is used."
              className="lg:col-span-3"
            >
              <Input
                id="doc-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={file?.name ?? 'e.g. ID card (front)'}
              />
            </FormField>

            <FormField
              label={meta?.wantsNumber ? 'Number' : 'Number (optional)'}
              htmlFor="doc-number"
              hint={meta?.wantsNumber ? 'The number on the document itself.' : undefined}
              className="lg:col-span-3"
            >
              <Input
                id="doc-number"
                value={form.doc_number}
                onChange={(e) => setForm({ ...form, doc_number: e.target.value })}
              />
            </FormField>

            <FormField label="Issued" htmlFor="doc-issued" className="lg:col-span-2">
              <Input
                id="doc-issued"
                type="date"
                value={form.issued_on}
                onChange={(e) => setForm({ ...form, issued_on: e.target.value })}
              />
            </FormField>

            <FormField
              label="Expires"
              htmlFor="doc-expires"
              hint={meta?.wantsExpiry ? 'This one lapses — fill it in and the page will warn you.' : undefined}
              className="lg:col-span-2"
            >
              <Input
                id="doc-expires"
                type="date"
                value={form.expires_on}
                onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
              />
            </FormField>

            <div className="flex items-end lg:col-span-2">
              <Button type="button" onClick={upload} disabled={busy} className="w-full">
                {busy ? 'Uploading…' : 'Upload'}
              </Button>
            </div>

            <FormField label="Notes" htmlFor="doc-notes" className="lg:col-span-6">
              <Textarea
                id="doc-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Anything worth remembering about this document"
              />
            </FormField>
          </div>
        )}

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        {documents.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing on file for {staffName} yet. Start with the ID copy and the signed contract.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((g) => (
              <div key={g.meta.value}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.meta.label}
                </p>
                <div className="flex flex-col gap-2">
                  {g.rows.map((row) => {
                    const state = expiryState(row.expires_on, today)
                    const isEditing = editing === row.id
                    return (
                      <div
                        key={row.id}
                        className="rounded-lg border border-border p-3 transition-colors hover:border-accent/50"
                      >
                        <div className="flex flex-wrap items-start gap-3">
                          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{row.title}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {row.doc_number && (
                                <span className="font-mono text-foreground">{row.doc_number}</span>
                              )}
                              {row.issued_on && <span>issued {row.issued_on}</span>}
                              <span className="truncate">{row.file_name}</span>
                              {fileSizeLabel(row.file_size) && <span>{fileSizeLabel(row.file_size)}</span>}
                              {row.uploadedByName && <span>added by {row.uploadedByName}</span>}
                            </p>
                            {row.notes && <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p>}
                          </div>

                          {state.status !== 'none' && (
                            <Badge
                              variant={
                                state.status === 'expired'
                                  ? 'destructive'
                                  : state.status === 'soon'
                                    ? 'warning'
                                    : 'success'
                              }
                            >
                              {state.status === 'valid'
                                ? `Valid to ${row.expires_on}`
                                : expiryWording(state)}
                            </Badge>
                          )}

                          <div className="flex shrink-0 items-center gap-1">
                            <Button asChild variant="ghost" size="sm" title="Open">
                              <a
                                href={`/api/staff/documents/${row.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button asChild variant="ghost" size="sm" title="Download">
                              <a href={`/api/staff/documents/${row.id}?download=1`}>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              title={isEditing ? 'Cancel' : 'Edit details'}
                              onClick={() => (isEditing ? setEditing(null) : startEdit(row))}
                            >
                              {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              title="Delete"
                              disabled={busy}
                              onClick={() => remove(row)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>

                        {isEditing && (
                          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-6">
                            <FormField label="Type" htmlFor={`edit-type-${row.id}`} className="lg:col-span-2">
                              <Select
                                id={`edit-type-${row.id}`}
                                value={edit.doc_type}
                                onChange={(e) =>
                                  setEdit({ ...edit, doc_type: e.target.value as StaffDocumentType })
                                }
                              >
                                {STAFF_DOC_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </Select>
                            </FormField>
                            <FormField label="Name" htmlFor={`edit-title-${row.id}`} className="lg:col-span-4">
                              <Input
                                id={`edit-title-${row.id}`}
                                value={edit.title}
                                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                              />
                            </FormField>
                            <FormField label="Number" htmlFor={`edit-num-${row.id}`} className="lg:col-span-2">
                              <Input
                                id={`edit-num-${row.id}`}
                                value={edit.doc_number}
                                onChange={(e) => setEdit({ ...edit, doc_number: e.target.value })}
                              />
                            </FormField>
                            <FormField label="Issued" htmlFor={`edit-issued-${row.id}`} className="lg:col-span-2">
                              <Input
                                id={`edit-issued-${row.id}`}
                                type="date"
                                value={edit.issued_on}
                                onChange={(e) => setEdit({ ...edit, issued_on: e.target.value })}
                              />
                            </FormField>
                            <FormField label="Expires" htmlFor={`edit-exp-${row.id}`} className="lg:col-span-2">
                              <Input
                                id={`edit-exp-${row.id}`}
                                type="date"
                                value={edit.expires_on}
                                onChange={(e) => setEdit({ ...edit, expires_on: e.target.value })}
                              />
                            </FormField>
                            <FormField label="Notes" htmlFor={`edit-notes-${row.id}`} className="lg:col-span-5">
                              <Input
                                id={`edit-notes-${row.id}`}
                                value={edit.notes}
                                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                              />
                            </FormField>
                            <div className="flex items-end lg:col-span-1">
                              <Button
                                type="button"
                                className="w-full"
                                disabled={busy}
                                onClick={() => saveEdit(row.id)}
                              >
                                {busy ? 'Saving…' : 'Save'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
