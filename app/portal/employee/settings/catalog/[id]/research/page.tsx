'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { EquipmentCatalogItem, ProductResearch, ResearchResourceType } from '@/types/database'
import {
  ArrowLeft, Check, ChevronDown, ChevronUp, ExternalLink,
  FileText, Image, Loader2, Search, X, Zap,
} from 'lucide-react'

const RESOURCE_LABELS: Record<ResearchResourceType, string> = {
  description: 'Description',
  spec_table: 'Spec Table',
  datasheet: 'Datasheet',
  photo: 'Photo',
  sld: 'SLD',
  manual: 'Manual',
  compatibility: 'Compatibility',
  model_3d: '3D Model',
}

const RESOURCE_ORDER: ResearchResourceType[] = [
  'description', 'spec_table', 'datasheet', 'photo', 'sld', 'manual', 'compatibility', 'model_3d',
]

function confidenceColor(n: number) {
  if (n >= 85) return 'text-success'
  if (n >= 65) return 'text-warning'
  return 'text-muted-foreground'
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'accepted') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
        <Check className="h-3 w-3" /> Accepted
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
        <X className="h-3 w-3" /> Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Pending
    </span>
  )
}

function ResearchCard({
  item,
  onAccept,
  onReject,
  onApplyDescription,
  onSetPrimaryImage,
  onSetDatasheet,
}: {
  item: ProductResearch
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onApplyDescription: (content: string) => void
  onSetPrimaryImage: (url: string) => void
  onSetDatasheet: (url: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const hasContent = !!item.content
  const previewLen = 240
  const needsExpand = hasContent && item.content!.length > previewLen
  const displayContent = expanded || !needsExpand ? item.content : item.content!.slice(0, previewLen) + '…'

  return (
    <Card className="border-border">
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
              {RESOURCE_LABELS[item.resource_type as ResearchResourceType] ?? item.resource_type}
            </span>
            <StatusBadge status={item.status} />
            <span className={`text-xs ${confidenceColor(item.confidence)}`}>
              {item.confidence}% confidence
            </span>
            {item.source_domain && (
              <span className="text-xs text-muted-foreground">{item.source_domain}</span>
            )}
          </div>

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <p className="mt-2 text-sm font-medium">{item.title}</p>

        {item.thumbnail_url && (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnail_url}
              alt={item.title}
              className="max-h-48 rounded border border-border object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        {hasContent && (
          <div className="mt-3">
            <pre className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-xs leading-relaxed">
              {displayContent}
            </pre>
            {needsExpand && (
              <button
                className="mt-1 flex items-center gap-1 text-xs text-accent hover:underline"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <><ChevronUp className="h-3 w-3" />Show less</> : <><ChevronDown className="h-3 w-3" />Show more</>}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {item.status !== 'accepted' && (
            <Button size="sm" variant="outline" className="text-success border-success/40 hover:bg-success/10" onClick={() => onAccept(item.id)}>
              <Check className="h-3.5 w-3.5" /> Accept
            </Button>
          )}
          {item.status !== 'rejected' && (
            <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => onReject(item.id)}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          )}
          {item.status === 'accepted' && item.resource_type === 'description' && item.content && (
            <Button size="sm" variant="accent" onClick={() => onApplyDescription(item.content!)}>
              <FileText className="h-3.5 w-3.5" /> Apply as shop description
            </Button>
          )}
          {item.status === 'accepted' && item.resource_type === 'photo' && (item.thumbnail_url ?? item.url) && (
            <Button size="sm" variant="accent" onClick={() => onSetPrimaryImage((item.thumbnail_url ?? item.url)!)}>
              <Image className="h-3.5 w-3.5" /> Set as primary image
            </Button>
          )}
          {item.status === 'accepted' && item.resource_type === 'datasheet' && item.url && (
            <Button size="sm" variant="accent" onClick={() => onSetDatasheet(item.url!)}>
              <FileText className="h-3.5 w-3.5" /> Set as primary datasheet
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ResearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: catalogId } = use(params)
  const supabase = createClient()

  const [item, setItem] = useState<EquipmentCatalogItem | null>(null)
  const [research, setResearch] = useState<ProductResearch[]>([])
  const [activeTab, setActiveTab] = useState<'all' | ResearchResourceType>('all')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const [catalogRes, researchRes] = await Promise.all([
      supabase.from('equipment_catalog').select('*').eq('id', catalogId).single(),
      supabase.from('product_research').select('*').eq('catalog_id', catalogId).order('resource_type').order('confidence', { ascending: false }),
    ])
    if (catalogRes.data) setItem(catalogRes.data as EquipmentCatalogItem)
    if (researchRes.data) setResearch(researchRes.data as ProductResearch[])
    setLoading(false)
  }, [catalogId, supabase])

  useEffect(() => { load() }, [load])

  async function runResearch() {
    setRunning(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/equipment/${catalogId}/research`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const { count } = await res.json()
      setNotice(`Research complete — ${count} items found. Review and accept below.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed. Check ANTHROPIC_API_KEY in .env.local.')
    } finally {
      setRunning(false)
    }
  }

  async function updateStatus(id: string, status: 'accepted' | 'rejected') {
    const now = new Date().toISOString()
    const patch = status === 'accepted'
      ? { status, accepted_at: now, rejected_at: null }
      : { status, rejected_at: now, accepted_at: null }
    await supabase.from('product_research').update(patch).eq('id', id)
    setResearch((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r))
  }

  async function applyDescription(content: string) {
    if (!item) return
    await supabase.from('equipment_catalog').update({ shop_description: content }).eq('id', catalogId)
    setItem((prev) => prev ? { ...prev, shop_description: content } : prev)
    setNotice('Shop description updated.')
  }

  async function setPrimaryImage(url: string) {
    if (!item) return
    await supabase.from('equipment_catalog').update({ primary_image_url: url }).eq('id', catalogId)
    setItem((prev) => prev ? { ...prev, primary_image_url: url } : prev)
    setNotice('Primary image updated.')
  }

  async function setDatasheet(url: string) {
    if (!item) return
    await supabase.from('equipment_catalog').update({ datasheet_url: url }).eq('id', catalogId)
    setItem((prev) => prev ? { ...prev, datasheet_url: url } : prev)
    setNotice('Primary datasheet updated.')
  }

  const counts = RESOURCE_ORDER.reduce<Record<string, number>>((acc, t) => {
    acc[t] = research.filter((r) => r.resource_type === t).length
    return acc
  }, {})

  const visible = activeTab === 'all' ? research : research.filter((r) => r.resource_type === activeTab)

  const acceptedCount = research.filter((r) => r.status === 'accepted').length
  const pendingCount = research.filter((r) => r.status === 'pending').length

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (!item) {
    return <p className="py-8 text-sm text-destructive">Catalog item not found.</p>
  }

  const ranAt = (item as any).research_ran_at
    ? new Date((item as any).research_ran_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      {/* Nav */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/portal/employee/settings/catalog" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Equipment Catalog
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">{item.brand} {item.sku}</h1>
          <p className="mt-0.5 text-muted-foreground">{item.description}</p>
          <p className="mt-1 text-xs text-muted-foreground capitalize">
            {item.category}
            {item.watts_ac ? ` · ${(item.watts_ac / 1000).toFixed(1)} kW` : ''}
            {item.kwh ? ` · ${item.kwh} kWh` : ''}
            {item.watts_dc ? ` · ${item.watts_dc} Wp` : ''}
            {item.phase !== 'any' ? ` · ${item.phase} phase` : ''}
          </p>
          {ranAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last researched: {ranAt} · {research.length} items · {acceptedCount} accepted · {pendingCount} pending
            </p>
          )}
          {!ranAt && (
            <p className="mt-1 text-xs text-muted-foreground">No research yet — click Run Research to begin.</p>
          )}
        </div>

        <Button variant="accent" onClick={runResearch} disabled={running}>
          {running
            ? <><Loader2 className="h-4 w-4 animate-spin" />Researching… (~60–90 s)</>
            : <><Search className="h-4 w-4" />Run Research</>}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}
      {notice && (
        <p className="rounded-md bg-success/10 px-4 py-2 text-sm text-success flex items-center gap-2">
          <Zap className="h-4 w-4" />{notice}
        </p>
      )}

      {/* Applied fields summary */}
      {((item as any).shop_description || (item as any).primary_image_url || (item as any).datasheet_url) && (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">Applied to catalog item</p>
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {(item as any).shop_description && (
                <span>✓ Shop description: {String((item as any).shop_description).slice(0, 80)}…</span>
              )}
              {(item as any).primary_image_url && (
                <span>✓ Primary image: <a href={(item as any).primary_image_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{(item as any).primary_image_url}</a></span>
              )}
              {(item as any).datasheet_url && (
                <span>✓ Datasheet: <a href={(item as any).datasheet_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{(item as any).datasheet_url}</a></span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {research.length > 0 && (
        <>
          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {([['all', `All (${research.length})`], ...RESOURCE_ORDER.map((t) => [t, `${RESOURCE_LABELS[t]} (${counts[t] ?? 0})`])] as [string, string][])
              .filter(([key]) => key === 'all' || (counts[key] ?? 0) > 0)
              .map(([key, label]) => (
                <Button
                  key={key}
                  variant={activeTab === key ? 'accent' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab(key as any)}
                >
                  {label}
                </Button>
              ))}
          </div>

          {/* Research item cards */}
          <div className="flex flex-col gap-3">
            {visible.map((r) => (
              <ResearchCard
                key={r.id}
                item={r}
                onAccept={(id) => updateStatus(id, 'accepted')}
                onReject={(id) => updateStatus(id, 'rejected')}
                onApplyDescription={applyDescription}
                onSetPrimaryImage={setPrimaryImage}
                onSetDatasheet={setDatasheet}
              />
            ))}
          </div>
        </>
      )}

      {research.length === 0 && !running && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Search className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p className="text-sm">No research yet for this product.</p>
          <p className="mt-1 text-xs">Click <strong>Run Research</strong> above to fetch datasheets, photos, SLDs, and more.</p>
        </div>
      )}
    </div>
  )
}
