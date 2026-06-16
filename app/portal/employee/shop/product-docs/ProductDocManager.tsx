'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FileText, BookOpen, Wrench, Ruler, Box, Cpu, Shield, Award, File,
  CheckCircle, XCircle, Trash2, Plus, ExternalLink, Search, X,
  Eye, Loader2, AlertTriangle,
} from 'lucide-react'
import type { ProductDocument, ProductDocType, ProductDocStatus } from '@/types/database'

const DOC_TYPE_LABELS: Record<ProductDocType, string> = {
  datasheet:          'Datasheet',
  manual:             'Manual',
  installation_guide: 'Install Guide',
  drawing:            'Drawing',
  '3d_model':         '3D Model',
  wiring_diagram:     'Wiring Diagram',
  warranty:           'Warranty',
  certification:      'Certification',
  other:              'Other',
}

const DOC_TYPE_ICONS: Record<ProductDocType, React.ComponentType<{ className?: string }>> = {
  datasheet:          FileText,
  manual:             BookOpen,
  installation_guide: Wrench,
  drawing:            Ruler,
  '3d_model':         Box,
  wiring_diagram:     Cpu,
  warranty:           Shield,
  certification:      Award,
  other:              File,
}

const DOC_TYPE_COLORS: Record<ProductDocType, string> = {
  datasheet:          'bg-red-50 dark:bg-red-950/30 text-red-500',
  manual:             'bg-blue-50 dark:bg-blue-950/30 text-blue-500',
  installation_guide: 'bg-green-50 dark:bg-green-950/30 text-green-600',
  drawing:            'bg-purple-50 dark:bg-purple-950/30 text-purple-500',
  '3d_model':         'bg-gray-100 dark:bg-gray-800/50 text-gray-500',
  wiring_diagram:     'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600',
  warranty:           'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500',
  certification:      'bg-amber-50 dark:bg-amber-950/30 text-amber-600',
  other:              'bg-muted text-muted-foreground',
}

const STATUS_TABS: { value: ProductDocStatus | 'all'; label: string }[] = [
  { value: 'all',            label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'published',      label: 'Published' },
  { value: 'rejected',       label: 'Rejected' },
]

const emptyForm = {
  brand: '', product_family: '', doc_type: 'datasheet' as ProductDocType,
  title: '', url: '', notes: '', product_id: '',
}

interface Props {
  initialDocs: ProductDocument[]
  products: { id: string; name: string; brand: string | null; slug: string }[]
  counts: { total: number; pending: number; published: number; rejected: number }
}

export function ProductDocManager({ initialDocs, products }: Props) {
  const supabase = createClient()

  // List state
  const [docs, setDocs] = useState(initialDocs)
  const [statusFilter, setStatusFilter] = useState<ProductDocStatus | 'all'>('pending_review')
  const [brandFilter, setBrandFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [updating, setUpdating] = useState<Set<string>>(new Set())

  // Preview panel state
  const [previewDoc, setPreviewDoc] = useState<ProductDocument | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(false)

  const counts = useMemo(() => ({
    total:     docs.length,
    pending:   docs.filter(d => d.status === 'pending_review').length,
    published: docs.filter(d => d.status === 'published').length,
    rejected:  docs.filter(d => d.status === 'rejected').length,
  }), [docs])

  const brands = useMemo(() => [...new Set(docs.map(d => d.brand))].sort(), [docs])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return docs.filter(d => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (brandFilter !== 'all' && d.brand !== brandFilter) return false
      if (typeFilter !== 'all' && d.doc_type !== typeFilter) return false
      if (q && !d.title.toLowerCase().includes(q) &&
              !d.brand.toLowerCase().includes(q) &&
              !d.product_family.toLowerCase().includes(q)) return false
      return true
    })
  }, [docs, statusFilter, brandFilter, typeFilter, search])

  const grouped = useMemo(() => {
    const g: Record<string, ProductDocument[]> = {}
    for (const d of filtered) {
      if (!g[d.brand]) g[d.brand] = []
      g[d.brand].push(d)
    }
    return g
  }, [filtered])

  function openPreview(doc: ProductDocument) {
    setPreviewDoc(doc)
    setPreviewLoading(true)
    setPreviewError(false)
  }

  function closePreview() {
    setPreviewDoc(null)
    setPreviewLoading(false)
    setPreviewError(false)
  }

  async function updateStatus(id: string, status: ProductDocStatus) {
    setUpdating(prev => new Set(prev).add(id))
    const { error } = await supabase.from('product_documents').update({ status }).eq('id', id)
    if (!error) {
      setDocs(prev => prev.map(d => d.id === id ? { ...d, status } : d))
      // Keep preview panel in sync
      setPreviewDoc(prev => prev?.id === id ? { ...prev, status } : prev)
    }
    setUpdating(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document entry? This cannot be undone.')) return
    await supabase.from('product_documents').delete().eq('id', id)
    setDocs(prev => prev.filter(d => d.id !== id))
    if (previewDoc?.id === id) closePreview()
  }

  async function handleAdd() {
    if (!form.brand.trim() || !form.product_family.trim() || !form.title.trim()) {
      setFormError('Brand, product family and title are required')
      return
    }
    setSaving(true); setFormError('')
    const payload = {
      brand: form.brand.trim(),
      product_family: form.product_family.trim(),
      doc_type: form.doc_type,
      title: form.title.trim(),
      url: form.url.trim() || null,
      notes: form.notes.trim() || null,
      product_id: form.product_id || null,
      status: 'pending_review' as ProductDocStatus,
    }
    const { data, error } = await supabase.from('product_documents').insert(payload).select().single()
    if (error) { setFormError(error.message); setSaving(false); return }
    setDocs(prev => [data as ProductDocument, ...prev])
    setForm(emptyForm); setShowAdd(false); setSaving(false)
  }

  const f = (k: keyof typeof emptyForm, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',          value: counts.total,     color: 'text-foreground' },
            { label: 'Pending Review', value: counts.pending,   color: 'text-amber-500' },
            { label: 'Published',      value: counts.published, color: 'text-green-500' },
            { label: 'Rejected',       value: counts.rejected,  color: 'text-red-500' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {STATUS_TABS.map(t => (
              <button
                key={t.value}
                onClick={() => setStatusFilter(t.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === t.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {t.label}
                {t.value === 'pending_review' && counts.pending > 0 && (
                  <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {counts.pending}
                  </span>
                )}
              </button>
            ))}
          </div>

          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="text-xs border border-border rounded-lg px-3 py-1.5 bg-background text-foreground h-8"
          >
            <option value="all">All brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-xs border border-border rounded-lg px-3 py-1.5 bg-background text-foreground h-8"
          >
            <option value="all">All types</option>
            {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground h-8"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4" /> Add Document
          </Button>
        </div>

        {/* Add form */}
        {showAdd && (
          <Card className="border-accent/40">
            <CardContent className="pt-4 pb-5">
              <p className="text-sm font-semibold mb-3">Add Document</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Brand *</label>
                  <Input value={form.brand} onChange={e => f('brand', e.target.value)} placeholder="e.g. Victron" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Product Family *</label>
                  <Input value={form.product_family} onChange={e => f('product_family', e.target.value)} placeholder="e.g. MultiPlus-II" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Document Type *</label>
                  <select
                    value={form.doc_type}
                    onChange={e => f('doc_type', e.target.value)}
                    className="w-full text-sm border border-border rounded-md px-2 h-8 bg-background text-foreground"
                  >
                    {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground block mb-1">Title *</label>
                  <Input value={form.title} onChange={e => f('title', e.target.value)} placeholder="e.g. MultiPlus-II Installation Manual" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Link to Product (optional)</label>
                  <select
                    value={form.product_id}
                    onChange={e => f('product_id', e.target.value)}
                    className="w-full text-sm border border-border rounded-md px-2 h-8 bg-background text-foreground"
                  >
                    <option value="">— Not linked to specific product —</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="text-xs text-muted-foreground block mb-1">URL</label>
                  <Input value={form.url} onChange={e => f('url', e.target.value)} placeholder="https://manufacturer.com/doc.pdf" className="h-8 text-sm" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="text-xs text-muted-foreground block mb-1">Notes (internal)</label>
                  <Input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="e.g. Covers 5–10kW SP range" className="h-8 text-sm" />
                </div>
              </div>
              {formError && <p className="text-xs text-destructive mt-2">{formError}</p>}
              <div className="flex items-center gap-2 mt-4">
                <Button size="sm" onClick={handleAdd} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setForm(emptyForm); setFormError('') }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Document list */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No documents match your filters.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([brand, brandDocs]) => (
              <Card key={brand}>
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                  <p className="font-semibold text-sm">{brand}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{brandDocs.length} doc{brandDocs.length !== 1 ? 's' : ''}</Badge>
                    {brandDocs.some(d => d.status === 'pending_review') && (
                      <Badge variant="warning" className="text-[10px]">
                        {brandDocs.filter(d => d.status === 'pending_review').length} pending
                      </Badge>
                    )}
                  </div>
                </div>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {brandDocs.map(doc => {
                      const Icon = DOC_TYPE_ICONS[doc.doc_type] ?? File
                      const busy = updating.has(doc.id)
                      const isSelected = previewDoc?.id === doc.id
                      return (
                        <div
                          key={doc.id}
                          className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                            isSelected ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-muted/20'
                          }`}
                        >
                          {/* Type icon — click to preview */}
                          <button
                            onClick={() => doc.url ? openPreview(doc) : undefined}
                            disabled={!doc.url}
                            title={doc.url ? 'Preview document' : 'No URL — cannot preview'}
                            className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                              DOC_TYPE_COLORS[doc.doc_type]
                            } ${doc.url ? 'hover:ring-2 hover:ring-accent/50 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                          >
                            <Icon className="h-4 w-4" />
                          </button>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                              <button
                                onClick={() => doc.url ? openPreview(doc) : undefined}
                                disabled={!doc.url}
                                className={`text-sm font-medium leading-snug text-left ${doc.url ? 'hover:text-accent cursor-pointer' : ''}`}
                              >
                                {doc.title}
                              </button>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {DOC_TYPE_LABELS[doc.doc_type]}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{doc.product_family}</p>
                            {doc.notes && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">{doc.notes}</p>
                            )}
                          </div>

                          {/* Status + actions */}
                          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                            <Badge
                              variant={
                                doc.status === 'published'      ? 'success' :
                                doc.status === 'rejected'       ? 'destructive' :
                                'warning'
                              }
                              className="text-[10px] hidden sm:inline-flex"
                            >
                              {doc.status === 'pending_review' ? 'Pending' : doc.status === 'published' ? 'Live' : 'Rejected'}
                            </Badge>

                            {/* Preview button */}
                            {doc.url && (
                              <button
                                title="Preview"
                                onClick={() => openPreview(doc)}
                                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Pending: Publish + Reject */}
                            {doc.status === 'pending_review' && (<>
                              <button title="Publish — make visible to customers" disabled={busy}
                                onClick={() => updateStatus(doc.id, 'published')}
                                className="h-7 w-7 rounded-md flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-40 transition-colors">
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button title="Reject" disabled={busy}
                                onClick={() => updateStatus(doc.id, 'rejected')}
                                className="h-7 w-7 rounded-md flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors">
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>)}
                            {/* Published: Unpublish */}
                            {doc.status === 'published' && (
                              <button title="Unpublish" disabled={busy}
                                onClick={() => updateStatus(doc.id, 'pending_review')}
                                className="h-7 w-7 rounded-md flex items-center justify-center text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-40 transition-colors">
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                            {/* Rejected: Re-review */}
                            {doc.status === 'rejected' && (
                              <button title="Move back to pending review" disabled={busy}
                                onClick={() => updateStatus(doc.id, 'pending_review')}
                                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
                                <CheckCircle className="h-4 w-4" />
                              </button>
                            )}
                            <button title="Delete" onClick={() => handleDelete(doc.id)}
                              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Preview panel ─────────────────────────────────────── */}
      {/* Backdrop (mobile) */}
      {previewDoc && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={closePreview}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-screen z-50 flex flex-col bg-card border-l border-border shadow-2xl
          w-full md:w-[520px] lg:w-[600px]
          transition-transform duration-300 ease-in-out
          ${previewDoc ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {previewDoc && (
          <>
            {/* Panel header */}
            <div className="flex items-start justify-between gap-3 p-4 border-b border-border shrink-0">
              <div className="flex items-start gap-3 min-w-0">
                {(() => {
                  const Icon = DOC_TYPE_ICONS[previewDoc.doc_type] ?? File
                  return (
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${DOC_TYPE_COLORS[previewDoc.doc_type]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  )
                })()}
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-snug">{previewDoc.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {previewDoc.brand} · {previewDoc.product_family}
                  </p>
                  {previewDoc.notes && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">{previewDoc.notes}</p>
                  )}
                </div>
              </div>
              <button
                onClick={closePreview}
                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Open in new tab strip */}
            {previewDoc.url && (
              <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border shrink-0">
                <p className="text-xs text-muted-foreground truncate flex-1 mr-2 font-mono">
                  {previewDoc.url}
                </p>
                <a
                  href={previewDoc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-accent hover:underline shrink-0"
                >
                  Open in new tab <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* iframe viewer */}
            <div className="flex-1 overflow-hidden relative bg-muted/20">
              {previewDoc.url ? (
                <>
                  {/* Loading overlay */}
                  {previewLoading && !previewError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/80 z-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Loading document…</p>
                    </div>
                  )}

                  {/* Error state */}
                  {previewError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 z-10 bg-card">
                      <AlertTriangle className="h-8 w-8 text-amber-500" />
                      <p className="text-sm font-medium text-center">
                        This document can&apos;t be previewed here
                      </p>
                      <p className="text-xs text-muted-foreground text-center">
                        The document host doesn&apos;t allow embedding. Open it in a new tab to view it, then come back to approve or reject.
                      </p>
                      <a
                        href={previewDoc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open document
                      </a>
                    </div>
                  )}

                  <iframe
                    key={previewDoc.id}
                    src={previewDoc.url}
                    title={previewDoc.title}
                    className="w-full h-full border-0"
                    onLoad={() => setPreviewLoading(false)}
                    onError={() => { setPreviewLoading(false); setPreviewError(true) }}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <FileText className="h-12 w-12 opacity-20" />
                  <p className="text-sm">No URL attached</p>
                  <p className="text-xs">Add a URL to enable previewing.</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="p-4 border-t border-border shrink-0 flex items-center gap-3">
              {previewDoc.status === 'pending_review' && (<>
                <Button
                  className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white"
                  disabled={updating.has(previewDoc.id)}
                  onClick={() => updateStatus(previewDoc.id, 'published')}
                >
                  <CheckCircle className="h-4 w-4" />
                  Publish
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                  disabled={updating.has(previewDoc.id)}
                  onClick={() => updateStatus(previewDoc.id, 'rejected')}
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </>)}

              {previewDoc.status === 'published' && (
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  disabled={updating.has(previewDoc.id)}
                  onClick={() => updateStatus(previewDoc.id, 'pending_review')}
                >
                  <XCircle className="h-4 w-4" />
                  Unpublish
                </Button>
              )}

              {previewDoc.status === 'rejected' && (
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  disabled={updating.has(previewDoc.id)}
                  onClick={() => updateStatus(previewDoc.id, 'pending_review')}
                >
                  Move to Pending Review
                </Button>
              )}

              <Badge
                variant={
                  previewDoc.status === 'published' ? 'success' :
                  previewDoc.status === 'rejected'  ? 'destructive' :
                  'warning'
                }
              >
                {previewDoc.status === 'pending_review' ? 'Pending' :
                 previewDoc.status === 'published'      ? 'Live' : 'Rejected'}
              </Badge>
            </div>
          </>
        )}
      </div>
    </>
  )
}
