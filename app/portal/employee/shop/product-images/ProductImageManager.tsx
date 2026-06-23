'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CheckCircle, XCircle, Trash2, Plus, Search, X,
  Image as ImageIcon, Loader2, AlertTriangle, ExternalLink,
} from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { ProductImage, ProductImageStatus } from '@/types/database'

const STATUS_TABS: { value: ProductImageStatus | 'all'; label: string }[] = [
  { value: 'all',            label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'published',      label: 'Published' },
  { value: 'rejected',       label: 'Rejected' },
]

const emptyForm = {
  brand: '', product_family: '', url: '', alt_text: '', notes: '', product_id: '',
}

interface Props {
  initialImages: ProductImage[]
  products: { id: string; name: string; brand: string | null; slug: string }[]
  counts: { total: number; pending: number; published: number; rejected: number }
}

export function ProductImageManager({ initialImages, products }: Props) {
  const supabase = createClient()
  const confirm = useConfirm()

  const [images, setImages]               = useState(initialImages)
  const [statusFilter, setStatusFilter]   = useState<ProductImageStatus | 'all'>('pending_review')
  const [brandFilter, setBrandFilter]     = useState('all')
  const [search, setSearch]               = useState('')
  const [showAdd, setShowAdd]             = useState(false)
  const [form, setForm]                   = useState(emptyForm)
  const [saving, setSaving]               = useState(false)
  const [formError, setFormError]         = useState('')
  const [updating, setUpdating]           = useState<Set<string>>(new Set())
  const [selected, setSelected]           = useState<ProductImage | null>(null)
  const [imgError, setImgError]           = useState<Set<string>>(new Set())
  const [matchCounts, setMatchCounts]     = useState<Record<string, number>>({})

  const counts = useMemo(() => ({
    total:     images.length,
    pending:   images.filter(i => i.status === 'pending_review').length,
    published: images.filter(i => i.status === 'published').length,
    rejected:  images.filter(i => i.status === 'rejected').length,
  }), [images])

  const brands = useMemo(() => [...new Set(images.map(i => i.brand))].sort(), [images])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return images.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (brandFilter !== 'all' && i.brand !== brandFilter) return false
      if (q && !i.brand.toLowerCase().includes(q) &&
              !i.product_family.toLowerCase().includes(q) &&
              !(i.alt_text ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [images, statusFilter, brandFilter, search])

  const grouped = useMemo(() => {
    const g: Record<string, ProductImage[]> = {}
    for (const img of filtered) {
      if (!g[img.brand]) g[img.brand] = []
      g[img.brand].push(img)
    }
    return g
  }, [filtered])

  // Fetch match count for a brand/family image when selected
  async function loadMatchCount(img: ProductImage) {
    setSelected(img)
    if (img.product_id || matchCounts[img.id] !== undefined) return
    const { data } = await supabase.rpc('count_matching_products', {
      p_brand: img.brand,
      p_family: img.product_family,
    })
    setMatchCounts(prev => ({ ...prev, [img.id]: data ?? 0 }))
  }

  async function publishImage(img: ProductImage) {
    setUpdating(prev => new Set(prev).add(img.id))
    const { error } = await supabase
      .from('product_images')
      .update({ status: 'published' })
      .eq('id', img.id)
    if (!error) {
      // Write URL into matching products.images[]
      if (img.product_id) {
        await supabase.rpc('append_product_image', {
          p_product_id: img.product_id,
          p_url: img.url,
        })
      } else {
        await supabase.rpc('append_brand_image', {
          p_brand:  img.brand,
          p_family: img.product_family,
          p_url:    img.url,
        })
      }
      const updated = { ...img, status: 'published' as ProductImageStatus }
      setImages(prev => prev.map(i => i.id === img.id ? updated : i))
      setSelected(prev => prev?.id === img.id ? updated : prev)
    }
    setUpdating(prev => { const s = new Set(prev); s.delete(img.id); return s })
  }

  async function rejectImage(img: ProductImage) {
    setUpdating(prev => new Set(prev).add(img.id))
    const { error } = await supabase
      .from('product_images')
      .update({ status: 'rejected' })
      .eq('id', img.id)
    if (!error) {
      const updated = { ...img, status: 'rejected' as ProductImageStatus }
      setImages(prev => prev.map(i => i.id === img.id ? updated : i))
      setSelected(prev => prev?.id === img.id ? updated : prev)
    }
    setUpdating(prev => { const s = new Set(prev); s.delete(img.id); return s })
  }

  async function unpublishImage(img: ProductImage) {
    setUpdating(prev => new Set(prev).add(img.id))
    const { error } = await supabase
      .from('product_images')
      .update({ status: 'pending_review' })
      .eq('id', img.id)
    if (!error) {
      await supabase.rpc('remove_product_image', { p_url: img.url })
      const updated = { ...img, status: 'pending_review' as ProductImageStatus }
      setImages(prev => prev.map(i => i.id === img.id ? updated : i))
      setSelected(prev => prev?.id === img.id ? updated : prev)
    }
    setUpdating(prev => { const s = new Set(prev); s.delete(img.id); return s })
  }

  async function handleDelete(img: ProductImage) {
    if (!(await confirm({
      title: 'Delete this image entry?',
      body: 'This cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
    }))) return
    if (img.status === 'published') {
      await supabase.rpc('remove_product_image', { p_url: img.url })
    }
    await supabase.from('product_images').delete().eq('id', img.id)
    setImages(prev => prev.filter(i => i.id !== img.id))
    if (selected?.id === img.id) setSelected(null)
  }

  async function handleAdd() {
    if (!form.brand.trim() || !form.product_family.trim() || !form.url.trim()) {
      setFormError('Brand, product family and URL are required')
      return
    }
    setSaving(true); setFormError('')
    const payload = {
      brand:          form.brand.trim(),
      product_family: form.product_family.trim(),
      url:            form.url.trim(),
      alt_text:       form.alt_text.trim() || null,
      notes:          form.notes.trim() || null,
      product_id:     form.product_id || null,
      status:         'pending_review' as ProductImageStatus,
    }
    const { data, error } = await supabase.from('product_images').insert(payload).select().single()
    if (error) { setFormError(error.message); setSaving(false); return }
    setImages(prev => [data as ProductImage, ...prev])
    setForm(emptyForm); setShowAdd(false); setSaving(false)
  }

  const f = (k: keyof typeof emptyForm, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="flex flex-col gap-5">
      {/* Stats */}
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
          <Plus className="h-4 w-4" /> Add Image
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="border-accent/40">
          <CardContent className="pt-4 pb-5">
            <p className="text-sm font-semibold mb-3">Add Image</p>
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
                <label className="text-xs text-muted-foreground block mb-1">Link to Product (optional)</label>
                <select
                  value={form.product_id}
                  onChange={e => f('product_id', e.target.value)}
                  className="w-full text-sm border border-border rounded-md px-2 h-8 bg-background text-foreground"
                >
                  <option value="">— Apply to all matching brand products —</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-xs text-muted-foreground block mb-1">Image URL *</label>
                <Input value={form.url} onChange={e => f('url', e.target.value)} placeholder="https://manufacturer.com/product.jpg" className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Alt Text</label>
                <Input value={form.alt_text} onChange={e => f('alt_text', e.target.value)} placeholder="e.g. Victron MultiPlus-II 48/3000" className="h-8 text-sm" />
              </div>
              <div className="sm:col-span-1 lg:col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Notes (internal)</label>
                <Input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="e.g. Official press image" className="h-8 text-sm" />
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

      {/* Main layout: list + detail panel */}
      <div className="flex gap-4 items-start">
        {/* Image list */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No images match your filters.</p>
            </div>
          ) : (
            Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([brand, brandImgs]) => (
              <Card key={brand}>
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                  <p className="font-semibold text-sm">{brand}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{brandImgs.length} image{brandImgs.length !== 1 ? 's' : ''}</Badge>
                    {brandImgs.some(i => i.status === 'pending_review') && (
                      <Badge variant="warning" className="text-[10px]">
                        {brandImgs.filter(i => i.status === 'pending_review').length} pending
                      </Badge>
                    )}
                  </div>
                </div>
                {/* Image grid */}
                <CardContent className="p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {brandImgs.map(img => {
                      const isSelected = selected?.id === img.id
                      const hasError = imgError.has(img.id)
                      const busy = updating.has(img.id)
                      return (
                        <button
                          key={img.id}
                          onClick={() => loadMatchCount(img)}
                          className={`group relative rounded-xl border-2 overflow-hidden text-left transition-all ${
                            isSelected
                              ? 'border-accent shadow-md'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          {/* Image */}
                          <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
                            {hasError ? (
                              <div className="flex flex-col items-center gap-1 p-2">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                <p className="text-[10px] text-muted-foreground text-center leading-tight">Can&apos;t load</p>
                              </div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={img.url}
                                alt={img.alt_text ?? img.product_family}
                                className="w-full h-full object-contain p-2"
                                onError={() => setImgError(prev => new Set(prev).add(img.id))}
                              />
                            )}
                          </div>

                          {/* Status badge */}
                          <div className="absolute top-1.5 right-1.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              img.status === 'published'      ? 'bg-green-500 text-white' :
                              img.status === 'rejected'       ? 'bg-red-500 text-white' :
                              'bg-amber-500 text-white'
                            }`}>
                              {img.status === 'published' ? 'Live' : img.status === 'rejected' ? '✕' : '…'}
                            </span>
                          </div>

                          {/* Busy spinner */}
                          {busy && (
                            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 animate-spin text-accent" />
                            </div>
                          )}

                          {/* Label */}
                          <div className="px-2 py-1.5 border-t border-border bg-card">
                            <p className="text-[11px] font-medium leading-tight truncate">{img.product_family}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-72 shrink-0 sticky top-4">
            <Card>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <p className="font-semibold text-sm">Image Detail</p>
                <button
                  onClick={() => setSelected(null)}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <CardContent className="p-4 flex flex-col gap-4">
                {/* Preview */}
                <div className="aspect-square rounded-xl border border-border bg-muted/20 overflow-hidden flex items-center justify-center">
                  {imgError.has(selected.id) ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 text-amber-500" />
                      <p className="text-xs text-center">Image failed to load.<br />Check the URL.</p>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.url}
                      alt={selected.alt_text ?? selected.product_family}
                      className="w-full h-full object-contain p-4"
                      onError={() => setImgError(prev => new Set(prev).add(selected.id))}
                    />
                  )}
                </div>

                {/* Meta */}
                <div className="flex flex-col gap-1.5">
                  <p className="font-semibold text-sm leading-snug">{selected.product_family}</p>
                  <p className="text-xs text-muted-foreground">{selected.brand}</p>
                  {selected.notes && (
                    <p className="text-xs text-muted-foreground italic">{selected.notes}</p>
                  )}
                  {selected.alt_text && (
                    <p className="text-xs text-muted-foreground">Alt: {selected.alt_text}</p>
                  )}
                </div>

                {/* URL */}
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-accent hover:underline break-all"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{selected.url}</span>
                </a>

                {/* Scope */}
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  {selected.product_id ? (
                    <span>Linked to 1 specific product</span>
                  ) : (
                    <span>
                      Applies to{' '}
                      <span className="font-semibold text-foreground">
                        {matchCounts[selected.id] !== undefined
                          ? `${matchCounts[selected.id]} product${matchCounts[selected.id] !== 1 ? 's' : ''}`
                          : 'loading…'}
                      </span>
                      {' '}matching <em>{selected.product_family}</em>
                    </span>
                  )}
                </div>

                {/* Status */}
                <Badge
                  variant={
                    selected.status === 'published' ? 'success' :
                    selected.status === 'rejected'  ? 'destructive' :
                    'warning'
                  }
                  className="self-start"
                >
                  {selected.status === 'pending_review' ? 'Pending Review' :
                   selected.status === 'published'      ? 'Live on site' : 'Rejected'}
                </Badge>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  {selected.status === 'pending_review' && (
                    <>
                      <Button
                        className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                        disabled={updating.has(selected.id)}
                        onClick={() => publishImage(selected)}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Publish — go live
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                        disabled={updating.has(selected.id)}
                        onClick={() => rejectImage(selected)}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </>
                  )}
                  {selected.status === 'published' && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      disabled={updating.has(selected.id)}
                      onClick={() => unpublishImage(selected)}
                    >
                      <XCircle className="h-4 w-4" />
                      Unpublish
                    </Button>
                  )}
                  {selected.status === 'rejected' && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={updating.has(selected.id)}
                      onClick={() => publishImage(selected)}
                    >
                      Publish anyway
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(selected)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
