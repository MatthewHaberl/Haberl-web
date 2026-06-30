'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { DEFAULT_PRICING, mapSettingsToPricing, type EquipmentCatalogItem, type CatalogSpecs } from '@/lib/solar/quote-calculator'
import {
  parseEnclosureSpec, enclosureSpecToNotes,
  ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, ENCLOSURE_WAYS,
  type EnclosureSpec, type EnclosureMaterial, type EnclosureMount,
} from '@/lib/solar/system-design'
import { Loader2, Pencil, Plus, Search, X } from 'lucide-react'
import OffersPanel from './OffersPanel'
import { PageShell, PageHeader } from '@/components/layout/page'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

type CategoryTab =
  | 'inverter' | 'battery' | 'panel' | 'enclosure'
  | 'breaker' | 'fuse' | 'fuseholder' | 'spd' | 'isolator' | 'disconnect' | 'rccb' | 'cable'
  | 'connector' | 'mounting' | 'other'

const TABS: Array<{ value: CategoryTab; label: string }> = [
  { value: 'inverter', label: 'Inverters' },
  { value: 'battery', label: 'Batteries' },
  { value: 'panel', label: 'Panels' },
  { value: 'enclosure', label: 'Enclosures / DBs' },
  { value: 'breaker', label: 'Breakers' },
  { value: 'fuse', label: 'Fuses' },
  { value: 'fuseholder', label: 'Fuse holders' },
  { value: 'spd', label: 'SPDs' },
  { value: 'isolator', label: 'Isolators' },
  { value: 'disconnect', label: 'Disconnects' },
  { value: 'rccb', label: 'Earth leakage' },
  { value: 'cable', label: 'Cables' },
  { value: 'connector', label: 'Terminals / glands' },
  { value: 'mounting', label: 'Mounting' },
  { value: 'other', label: 'Other / Accessories' },
]

// Categories that carry structured protection-gear attributes (migration 051 specs).
const PROTECTION_CATEGORIES: CategoryTab[] = ['breaker', 'fuse', 'fuseholder', 'spd', 'isolator', 'disconnect', 'rccb']
const CURRENT_TYPES = ['AC', 'DC', 'AC/DC'] as const

// Per-category electrical fields shown in the edit modal (item 49). Only surface the
// spec inputs that actually apply to a category, so e.g. cables don't show "Voc / Wp"
// and inverters don't show panel-only "Wp". Enclosures + protection gear render their
// own dedicated spec blocks below, so they don't list any of these generic fields.
type ElectricalField = 'watts_ac' | 'watts_dc' | 'kwh' | 'phase' | 'isc' | 'voc'
const CATEGORY_FIELDS: Record<CategoryTab, ElectricalField[]> = {
  // PV panels: peak watts (Wp) + cell electrical (Voc / Isc).
  panel: ['watts_dc', 'voc', 'isc'],
  // Inverters: AC output + phase (MPPT / PV limits live in notes).
  inverter: ['watts_ac', 'phase'],
  // Batteries: usable energy (kWh) — V / class live in specs / notes.
  battery: ['kwh'],
  // Enclosures + protection gear carry their own structured spec blocks.
  enclosure: [],
  breaker: [],
  fuse: [],
  fuseholder: [],
  spd: [],
  isolator: [],
  disconnect: [],
  rccb: [],
  // Passive / mechanical lines have no generic electrical fields here.
  cable: [],
  connector: [],
  mounting: [],
  // Catch-all bucket (EV chargers, ATESS utility gear, dongles, misc) — no generic
  // electrical fields; use Notes for any spec.
  other: [],
}

// Compact one-line spec for the table, e.g. "2P · 63A · DC · 1000V · 6kA · Curve C · polarized".
function formatProtectionSpec(specs?: CatalogSpecs | null): string {
  if (!specs) return '—'
  const parts: string[] = []
  if (specs.pole_config) parts.push(String(specs.pole_config))
  else if (specs.poles != null) parts.push(`${specs.poles}P`)
  if (specs.amperage_a != null) parts.push(`${specs.amperage_a}A`)
  if (specs.current_type) parts.push(String(specs.current_type))
  if (specs.voltage_v != null) parts.push(`${specs.voltage_v}V`)
  if (specs.breaking_capacity_ka != null) parts.push(`${specs.breaking_capacity_ka}kA`)
  if (specs.curve) parts.push(`Curve ${specs.curve}`)
  if (specs.polarized) parts.push('polarized')
  return parts.length ? parts.join(' · ') : '—'
}

const DEFAULT_ENCLOSURE: EnclosureSpec = { material: 'plastic', mount: 'surface', ways: 12, rows: 1, ip: 'IP4X' }

type FormState = {
  id?: string
  category: CategoryTab
  supplier: string
  brand: string
  sku: string
  description: string
  watts_ac: string
  watts_dc: string
  kwh: string
  phase: 'single' | 'three' | 'any'
  cost_rands: string
  isc_amps: string
  voc_volts: string
  sort_order: string
  notes: string
  active: boolean
  show_on_store: boolean
  store_price_rands: string
  shop_description: string
  primary_image_url: string
  datasheet_url: string
  model_3d_url: string
  specs: CatalogSpecs
}

const EMPTY_FORM: FormState = {
  category: 'inverter',
  supplier: '',
  brand: '',
  sku: '',
  description: '',
  watts_ac: '',
  watts_dc: '',
  kwh: '',
  phase: 'any',
  cost_rands: '',
  isc_amps: '',
  voc_volts: '',
  sort_order: '0',
  notes: '',
  active: true,
  show_on_store: false,
  store_price_rands: '',
  shop_description: '',
  primary_image_url: '',
  datasheet_url: '',
  model_3d_url: '',
  specs: {},
}

function navLink(href: string, label: string) {
  return (
    <Link href={href} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
      {label}
    </Link>
  )
}

function coerceNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// The catalog now exceeds the ~1000-row PostgREST cap (1500+ items), so a single
// query — ordered by category — silently dropped every row past ~1000 (panels, rccb,
// spd, other, tail of mounting). Page through so every category loads regardless of size.
async function fetchAllCatalog(
  supabase: ReturnType<typeof createClient>,
): Promise<{ data: EquipmentCatalogItem[]; error: string | null }> {
  const { data, error } = await fetchAllRows<EquipmentCatalogItem>((from, to) =>
    supabase
      .from('equipment_catalog')
      .select('*')
      .order('category')
      .order('sort_order')
      .order('brand')
      .order('description')
      .range(from, to),
  )
  return { data, error: error?.message ?? null }
}

function formatRands(value: number) {
  return `R${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function itemToForm(item: EquipmentCatalogItem): FormState {
  return {
    id: item.id,
    category: item.category as CategoryTab,
    supplier: item.supplier ?? '',
    brand: item.brand,
    sku: item.sku,
    description: item.description,
    watts_ac: item.watts_ac?.toString() ?? '',
    watts_dc: item.watts_dc?.toString() ?? '',
    kwh: item.kwh?.toString() ?? '',
    phase: item.phase,
    cost_rands: item.cost_rands.toString(),
    isc_amps: item.isc_amps?.toString() ?? '',
    voc_volts: item.voc_volts?.toString() ?? '',
    sort_order: item.sort_order.toString(),
    notes: item.notes ?? '',
    active: item.active,
    show_on_store: item.show_on_store ?? false,
    store_price_rands: item.store_price_rands?.toString() ?? '',
    shop_description: item.shop_description ?? '',
    primary_image_url: item.primary_image_url ?? '',
    datasheet_url: item.datasheet_url ?? '',
    model_3d_url: item.model_3d_url ?? '',
    specs: (item.specs ?? {}) as CatalogSpecs,
  }
}

export default function CatalogPage() {
  const supabase = createClient()
  const [items, setItems] = useState<EquipmentCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 'pending' is a cross-category filter for the "to-add" queue, not a real category.
  const [activeTab, setActiveTab] = useState<CategoryTab | 'pending'>('inverter')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [editing, setEditing] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [markup, setMarkup] = useState(DEFAULT_PRICING.markup)
  const [storeMarkup, setStoreMarkup] = useState(30)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('company_settings').select('markup_pct, store_markup_pct').eq('id', true).maybeSingle()
      if (active && data) {
        setMarkup(mapSettingsToPricing(data).markup)
        setStoreMarkup(Number(data.store_markup_pct ?? 30))
      }
    })()
    return () => { active = false }
  }, [supabase])

  async function loadItems() {
    setLoading(true)
    setError('')
    const { data, error: dbError } = await fetchAllCatalog(supabase)
    if (dbError) {
      setError(dbError)
      setLoading(false)
      return
    }
    setItems(data)
    setLoading(false)
  }

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data, error: dbError } = await fetchAllCatalog(supabase)
      if (!active) return
      if (dbError) {
        setError(dbError)
        setLoading(false)
        return
      }
      setItems(data)
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [supabase])

  // Count of "to-add" placeholders created from the design canvas (migration 049).
  const pendingCount = useMemo(() => items.filter((item) => item.pending).length, [items])

  // Distinct suppliers present in the catalog, for the supplier filter.
  const suppliers = useMemo(
    () => Array.from(new Set(items.map((i) => i.supplier).filter((s): s is string => !!s))).sort(),
    [items],
  )

  const visibleItems = useMemo(() => {
    const base = activeTab === 'pending'
      ? items.filter((item) => item.pending)
      : items.filter((item) => item.category === activeTab)
    return supplierFilter === 'all' ? base : base.filter((item) => item.supplier === supplierFilter)
  }, [activeTab, items, supplierFilter])

  async function saveItem() {
    if (!editing) return
    setSaving(true)
    setError('')

    const payload = {
      category: editing.category,
      brand: editing.brand.trim(),
      sku: editing.sku.trim(),
      description: editing.description.trim(),
      watts_ac: coerceNumber(editing.watts_ac),
      watts_dc: coerceNumber(editing.watts_dc),
      kwh: coerceNumber(editing.kwh),
      phase: editing.phase,
      cost_rands: Number(editing.cost_rands || 0),
      isc_amps: coerceNumber(editing.isc_amps),
      voc_volts: coerceNumber(editing.voc_volts),
      sort_order: Number(editing.sort_order || 0),
      notes: editing.notes.trim() || null,
      active: editing.active,
      show_on_store: editing.show_on_store,
      store_price_rands: coerceNumber(editing.store_price_rands),
      shop_description: editing.shop_description.trim() || null,
      primary_image_url: editing.primary_image_url.trim() || null,
      datasheet_url: editing.datasheet_url.trim() || null,
      model_3d_url: editing.model_3d_url.trim() || null,
      supplier: editing.supplier.trim() || null,
      specs: editing.specs ?? {},
      // Clear the "to-add" flag once the placeholder gets a real cost (migration 049).
      // Only sent when clearing, so it's a no-op for rows that were never pending.
      ...(Number(editing.cost_rands || 0) > 0 ? { pending: false } : {}),
    }

    const query = editing.id
      ? supabase.from('equipment_catalog').update(payload).eq('id', editing.id)
      : supabase.from('equipment_catalog').insert(payload)

    const { error: dbError } = await query
    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    setEditing(null)
    setSaving(false)
    await loadItems()
  }

  async function toggleActive(item: EquipmentCatalogItem) {
    await supabase.from('equipment_catalog').update({ active: !item.active }).eq('id', item.id)
    await loadItems()
  }

  // Flip web-store visibility. The DB mirror trigger publishes/hides the
  // matching shop product automatically — quoting is unaffected.
  async function toggleStore(item: EquipmentCatalogItem) {
    await supabase
      .from('equipment_catalog')
      .update({ show_on_store: !item.show_on_store })
      .eq('id', item.id)
    await loadItems()
  }

  function storeSellPrice(item: EquipmentCatalogItem) {
    return item.store_price_rands != null && item.store_price_rands !== undefined
      ? Number(item.store_price_rands)
      : item.cost_rands * (1 + storeMarkup / 100)
  }

  return (
    <PageShell width="wide">
      <div className="flex flex-wrap items-center gap-2">
        {navLink('/portal/employee/settings', 'Settings')}
        {navLink('/portal/employee/settings/brands', 'Brands')}
        {navLink('/portal/employee/settings/catalog', 'Catalog')}
        {navLink('/portal/employee/settings/tier-configs', 'Tier Configs')}
      </div>

      <PageHeader
        title="Equipment Catalog"
        description="Manage the exact inverter, battery, panel and DB/enclosure models the calculator uses."
      />

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(({ value, label }) => (
          <Button
            key={value}
            variant={activeTab === value ? 'accent' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(value)}
          >
            {label}
          </Button>
        ))}
        {pendingCount > 0 && (
          <Button
            variant={activeTab === 'pending' ? 'accent' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('pending')}
            title="Placeholders created while designing — fill in the real product"
          >
            To add
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive/15 px-1 text-[10px] font-semibold text-destructive">
              {pendingCount}
            </span>
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {suppliers.length > 0 && (
            <Select
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
              className="w-auto"
              title="Filter by supplier"
            >
              <option value="all">All suppliers</option>
              {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing({
              ...EMPTY_FORM,
              category: activeTab === 'pending' ? 'inverter' : activeTab,
              supplier: supplierFilter !== 'all' ? supplierFilter : '',
            })}
          >
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading catalog...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="pb-3 pr-4">Brand</th>
                    <th className="pb-3 pr-4">Supplier</th>
                    <th className="pb-3 pr-4">SKU</th>
                    <th className="pb-3 pr-4">Description</th>
                    <th className="pb-3 pr-4">Spec</th>
                    <th className="pb-3 pr-4">Cost</th>
                    <th className="pb-3 pr-4">Sell</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Web store</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const enc = item.category === 'enclosure' ? parseEnclosureSpec(item.notes) : null
                    const spec = item.category === 'inverter'
                      ? `${((item.watts_ac ?? 0) / 1000).toFixed(1)}kW · ${item.phase}`
                      : item.category === 'battery'
                        ? `${item.kwh ?? 0}kWh`
                        : item.category === 'enclosure'
                          ? (enc ? `${enc.rows > 1 ? `${enc.rows}×${enc.ways}` : `${enc.ways}-way`} · ${enc.mount} · ${enc.material} · ${enc.ip}` : 'DB')
                          : item.category === 'panel'
                            ? `${item.watts_dc ?? 0}Wp`
                            : PROTECTION_CATEGORIES.includes(item.category as CategoryTab)
                              ? formatProtectionSpec(item.specs)
                              : '—'
                    return (
                      <tr key={item.id} className="border-b border-border/60">
                        <td className="py-3 pr-4">{item.brand}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{item.supplier ?? '—'}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{item.sku}</td>
                        <td className="py-3 pr-4">{item.description}</td>
                        <td className="py-3 pr-4">{spec}</td>
                        <td className="py-3 pr-4">{formatRands(item.cost_rands)}</td>
                        <td className="py-3 pr-4">{formatRands(item.cost_rands * markup)}</td>
                        <td className="py-3 pr-4">
                          {item.pending ? (
                            <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive" title="Placeholder from the design canvas — needs a real SKU + cost">
                              Needs product
                            </span>
                          ) : (item.active ? 'Active' : 'Hidden')}
                        </td>
                        <td className="py-3 pr-4">
                          <button
                            onClick={() => toggleStore(item)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                              item.show_on_store
                                ? 'bg-accent/15 text-accent hover:bg-accent/25'
                                : 'bg-muted text-muted-foreground hover:bg-muted/70'
                            }`}
                            title={item.show_on_store
                              ? 'On the web store — click to remove'
                              : 'Not on the web store — click to sell online'}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${item.show_on_store ? 'bg-accent' : 'bg-muted-foreground/50'}`} />
                            {item.show_on_store ? 'On store' : 'Off'}
                          </button>
                          {item.show_on_store && (
                            <div className="mt-1 text-[11px] text-muted-foreground">{formatRands(storeSellPrice(item))}</div>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setEditing(itemToForm(item))}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => toggleActive(item)}>
                              {item.active ? 'Hide' : 'Show'}
                            </Button>
                            <Link href={`/portal/employee/settings/catalog/${item.id}/research`}>
                              <Button variant="outline" size="sm" title="Research datasheets, photos, SLDs…">
                                <Search className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); saveItem() }}
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-primary">{editing.id ? 'Edit catalog item' : 'Add catalog item'}</h2>
                <p className="text-sm text-muted-foreground">Sell price is always cost × 1.15.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 overflow-y-auto px-6 py-5 md:grid-cols-2">
              <FormField label="Category">
                <Select
                  value={editing.category}
                  onChange={(event) => setEditing({ ...editing, category: event.target.value as CategoryTab })}
                >
                  {TABS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </FormField>
              <FormField label={<>Brand <span className="text-muted-foreground">(manufacturer)</span></>} required>
                <Input value={editing.brand} onChange={(event) => setEditing({ ...editing, brand: event.target.value })} />
              </FormField>
              <FormField label="Supplier">
                <Input value={editing.supplier} onChange={(event) => setEditing({ ...editing, supplier: event.target.value })} placeholder="e.g. Key Electric" />
              </FormField>
              <FormField label="SKU" required>
                <Input value={editing.sku} onChange={(event) => setEditing({ ...editing, sku: event.target.value })} />
              </FormField>
              <FormField label="Description" required className="md:col-span-2">
                <Input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
              </FormField>
              {editing.category === 'enclosure' && (() => {
                const spec = parseEnclosureSpec(editing.notes) ?? DEFAULT_ENCLOSURE
                const set = (p: Partial<EnclosureSpec>) => setEditing({ ...editing, notes: enclosureSpecToNotes({ ...spec, ...p }) })
                return (
                  <>
                    <FormField label="Material">
                      <Select value={spec.material} onChange={(e) => set({ material: e.target.value as EnclosureMaterial })}>
                        {ENCLOSURE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </Select>
                    </FormField>
                    <FormField label="Mount">
                      <Select value={spec.mount} onChange={(e) => set({ mount: e.target.value as EnclosureMount })}>
                        {ENCLOSURE_MOUNTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </Select>
                    </FormField>
                    <FormField label="Ways">
                      <Select value={spec.ways} onChange={(e) => set({ ways: Number(e.target.value) })}>
                        {ENCLOSURE_WAYS.map((w) => <option key={w} value={w}>{w}-way</option>)}
                      </Select>
                    </FormField>
                    <FormField label="Rows">
                      <Input value={String(spec.rows)} onChange={(e) => set({ rows: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
                    </FormField>
                    <FormField label="IP rating">
                      <Input value={spec.ip} onChange={(e) => set({ ip: e.target.value })} />
                    </FormField>
                  </>
                )
              })()}
              {PROTECTION_CATEGORIES.includes(editing.category) && (() => {
                const s = editing.specs ?? {}
                const setSpec = (patch: Partial<CatalogSpecs>) => setEditing({ ...editing, specs: { ...s, ...patch } })
                return (
                  <div className="md:col-span-2 grid gap-4 md:grid-cols-3 rounded-lg border border-border bg-muted/30 p-4">
                    <p className="md:col-span-3 text-sm font-semibold text-primary">Protection attributes</p>
                    <FormField label="Poles">
                      <Input value={s.poles?.toString() ?? ''} onChange={(e) => setSpec({ poles: coerceNumber(e.target.value) })} placeholder="1 / 2 / 3 / 4" />
                    </FormField>
                    <FormField label="Pole config">
                      <Input value={s.pole_config ?? ''} onChange={(e) => setSpec({ pole_config: e.target.value || null })} placeholder="1P / 2P / 3P / 4P / 1P+N" />
                    </FormField>
                    <FormField label="Amperage">
                      <Input type="number" min={0} step="0.1" trailingText="A" value={s.amperage_a?.toString() ?? ''} onChange={(e) => setSpec({ amperage_a: coerceNumber(e.target.value) })} />
                    </FormField>
                    <FormField label="Current type">
                      <Select
                        value={(s.current_type as string) ?? ''}
                        onChange={(e) => setSpec({ current_type: (e.target.value || null) as CatalogSpecs['current_type'] })}
                      >
                        <option value="">—</option>
                        {CURRENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </FormField>
                    <FormField label="Voltage">
                      <Input type="number" min={0} step={1} trailingText="V" value={s.voltage_v?.toString() ?? ''} onChange={(e) => setSpec({ voltage_v: coerceNumber(e.target.value) })} placeholder="230 / 400 / 1000" />
                    </FormField>
                    <FormField label="Breaking capacity">
                      <Input type="number" min={0} step="0.1" trailingText="kA" value={s.breaking_capacity_ka?.toString() ?? ''} onChange={(e) => setSpec({ breaking_capacity_ka: coerceNumber(e.target.value) })} />
                    </FormField>
                    <FormField label="Trip curve">
                      <Input value={s.curve ?? ''} onChange={(e) => setSpec({ curve: e.target.value || null })} placeholder="B / C / D / 2 / 3" />
                    </FormField>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!s.polarized}
                        onChange={(e) => setSpec({ polarized: e.target.checked })}
                      />
                      Polarized <span className="text-muted-foreground">(DC)</span>
                    </label>
                  </div>
                )
              })()}
              {CATEGORY_FIELDS[editing.category].includes('watts_ac') && (
                <FormField label={<>AC Watts <span className="text-muted-foreground">(kW × 1000)</span></>}>
                  <Input type="number" min={0} step={1} trailingText="W" value={editing.watts_ac} onChange={(event) => setEditing({ ...editing, watts_ac: event.target.value })} />
                </FormField>
              )}
              {CATEGORY_FIELDS[editing.category].includes('watts_dc') && (
                <FormField label={<>Wp <span className="text-muted-foreground">(peak watts)</span></>}>
                  <Input type="number" min={0} step={1} trailingText="W" value={editing.watts_dc} onChange={(event) => setEditing({ ...editing, watts_dc: event.target.value })} />
                </FormField>
              )}
              {CATEGORY_FIELDS[editing.category].includes('kwh') && (
                <FormField label="Energy">
                  <Input type="number" min={0} step="0.01" trailingText="kWh" value={editing.kwh} onChange={(event) => setEditing({ ...editing, kwh: event.target.value })} />
                </FormField>
              )}
              {CATEGORY_FIELDS[editing.category].includes('phase') && (
                <FormField label="Phase">
                  <Select
                    value={editing.phase}
                    onChange={(event) => setEditing({ ...editing, phase: event.target.value as FormState['phase'] })}
                  >
                    <option value="single">Single</option>
                    <option value="three">Three</option>
                    <option value="any">Any</option>
                  </Select>
                </FormField>
              )}
              <FormField label="Cost" required>
                <Input type="number" min={0} step="0.01" leadingText="R" value={editing.cost_rands} onChange={(event) => setEditing({ ...editing, cost_rands: event.target.value })} />
              </FormField>
              <FormField label="Sell price (read-only)">
                <Input value={formatRands(Number(editing.cost_rands || 0) * markup)} readOnly />
              </FormField>
              {CATEGORY_FIELDS[editing.category].includes('isc') && (
                <FormField label="Isc">
                  <Input type="number" min={0} step="0.01" trailingText="A" value={editing.isc_amps} onChange={(event) => setEditing({ ...editing, isc_amps: event.target.value })} />
                </FormField>
              )}
              {CATEGORY_FIELDS[editing.category].includes('voc') && (
                <FormField label="Voc">
                  <Input type="number" min={0} step="0.01" trailingText="V" value={editing.voc_volts} onChange={(event) => setEditing({ ...editing, voc_volts: event.target.value })} />
                </FormField>
              )}
              <FormField label="Sort order">
                <Input type="number" min={0} step={1} value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: event.target.value })} />
              </FormField>
              <FormField
                label="Notes"
                className="md:col-span-2"
                hint={editing.category === 'inverter'
                  ? 'Use notes to store PV limits, max panel counts, string layouts, and battery brand compatibility.'
                  : undefined}
              >
                <Textarea
                  value={editing.notes}
                  onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
                  rows={3}
                  placeholder={editing.category === 'inverter'
                    ? 'Max PV kWp: 10.4\nMax panels: 20\nString example: 4 strings total, 2 parallel per MPPT, 8 in series\nBattery brands: Sunsynk, Deye'
                    : ''}
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(event) => setEditing({ ...editing, active: event.target.checked })}
                />
                Active <span className="text-muted-foreground">(available to the quote calculator)</span>
              </label>

              {editing.id && (
                <OffersPanel catalogId={editing.id} onChange={loadItems} />
              )}

              {/* Web store */}
              <div className="md:col-span-2 mt-2 border-t border-border pt-4">
                <p className="text-sm font-semibold text-primary">Web store</p>
                <p className="text-xs text-muted-foreground">
                  Control whether customers can buy this item online, and what they see. Quoting is unaffected.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={editing.show_on_store}
                  onChange={(event) => setEditing({ ...editing, show_on_store: event.target.checked })}
                />
                Sell on web store
              </label>
              <FormField label="Store price override" hint={`Leave blank to use cost + ${storeMarkup}% store markup.`}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  leadingText="R"
                  value={editing.store_price_rands}
                  onChange={(event) => setEditing({ ...editing, store_price_rands: event.target.value })}
                  placeholder={`Auto: ${formatRands(Number(editing.cost_rands || 0) * (1 + storeMarkup / 100))}`}
                />
              </FormField>
              <FormField label="Primary image URL" hint="Shown on the store; reusable on quotes.">
                <Input
                  type="url"
                  value={editing.primary_image_url}
                  onChange={(event) => setEditing({ ...editing, primary_image_url: event.target.value })}
                  placeholder="https://…"
                />
              </FormField>
              <FormField label="Shop description" className="md:col-span-2">
                <Textarea
                  value={editing.shop_description}
                  onChange={(event) => setEditing({ ...editing, shop_description: event.target.value })}
                  rows={2}
                  placeholder="Customer-facing description for the web store (falls back to the description above)."
                />
              </FormField>
              <FormField label="Datasheet URL">
                <Input
                  type="url"
                  value={editing.datasheet_url}
                  onChange={(event) => setEditing({ ...editing, datasheet_url: event.target.value })}
                  placeholder="https://…"
                />
              </FormField>
              <FormField label={<>3D model URL <span className="text-muted-foreground">(future)</span></>}>
                <Input
                  type="url"
                  value={editing.model_3d_url}
                  onChange={(event) => setEditing({ ...editing, model_3d_url: event.target.value })}
                  placeholder="https://… .glb / .gltf"
                />
              </FormField>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-background px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : 'Save item'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </PageShell>
  )
}
