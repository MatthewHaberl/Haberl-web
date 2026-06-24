'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DEFAULT_PRICING, mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import {
  parseEnclosureSpec, enclosureSpecToNotes,
  ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, ENCLOSURE_WAYS,
  type EnclosureSpec, type EnclosureMaterial, type EnclosureMount,
} from '@/lib/solar/system-design'
import { Loader2, Pencil, Plus, Search, X } from 'lucide-react'

type CategoryTab =
  | 'inverter' | 'battery' | 'panel' | 'enclosure'
  | 'breaker' | 'fuse' | 'fuseholder' | 'spd' | 'isolator' | 'disconnect' | 'cable'

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
  { value: 'cable', label: 'Cables' },
]

const DEFAULT_ENCLOSURE: EnclosureSpec = { material: 'plastic', mount: 'surface', ways: 12, rows: 1, ip: 'IP4X' }

type FormState = {
  id?: string
  category: CategoryTab
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
}

const EMPTY_FORM: FormState = {
  category: 'inverter',
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

function formatRands(value: number) {
  return `R${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function itemToForm(item: EquipmentCatalogItem): FormState {
  return {
    id: item.id,
    category: (item.category === 'other' ? 'inverter' : item.category) as CategoryTab,
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
  }
}

export default function CatalogPage() {
  const supabase = createClient()
  const [items, setItems] = useState<EquipmentCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<CategoryTab>('inverter')
  const [editing, setEditing] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [markup, setMarkup] = useState(DEFAULT_PRICING.markup)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('company_settings').select('markup_pct').eq('id', true).maybeSingle()
      if (active && data) setMarkup(mapSettingsToPricing(data).markup)
    })()
    return () => { active = false }
  }, [supabase])

  async function loadItems() {
    setLoading(true)
    setError('')
    const { data, error: dbError } = await supabase
      .from('equipment_catalog')
      .select('*')
      .order('category')
      .order('sort_order')
      .order('brand')
      .order('description')

    if (dbError) {
      setError(dbError.message)
      setLoading(false)
      return
    }

    setItems((data ?? []) as EquipmentCatalogItem[])
    setLoading(false)
  }

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data, error: dbError } = await supabase
        .from('equipment_catalog')
        .select('*')
        .order('category')
        .order('sort_order')
        .order('brand')
        .order('description')

      if (!active) return

      if (dbError) {
        setError(dbError.message)
        setLoading(false)
        return
      }

      setItems((data ?? []) as EquipmentCatalogItem[])
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [supabase])

  const visibleItems = useMemo(
    () => items.filter((item) => item.category === activeTab),
    [activeTab, items],
  )

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

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {navLink('/portal/employee/settings', 'Settings')}
        {navLink('/portal/employee/settings/brands', 'Brands')}
        {navLink('/portal/employee/settings/catalog', 'Catalog')}
        {navLink('/portal/employee/settings/tier-configs', 'Tier Configs')}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-primary">Equipment Catalog</h1>
        <p className="mt-1 text-muted-foreground">
          Manage the exact inverter, battery, panel and DB/enclosure models the calculator uses.
        </p>
      </div>

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
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setEditing({ ...EMPTY_FORM, category: activeTab })}
        >
          <Plus className="h-4 w-4" /> Add item
        </Button>
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
                    <th className="pb-3 pr-4">SKU</th>
                    <th className="pb-3 pr-4">Description</th>
                    <th className="pb-3 pr-4">Spec</th>
                    <th className="pb-3 pr-4">Cost</th>
                    <th className="pb-3 pr-4">Sell</th>
                    <th className="pb-3 pr-4">Status</th>
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
                            : '—'
                    return (
                      <tr key={item.id} className="border-b border-border/60">
                        <td className="py-3 pr-4">{item.brand}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{item.sku}</td>
                        <td className="py-3 pr-4">{item.description}</td>
                        <td className="py-3 pr-4">{spec}</td>
                        <td className="py-3 pr-4">{formatRands(item.cost_rands)}</td>
                        <td className="py-3 pr-4">{formatRands(item.cost_rands * markup)}</td>
                        <td className="py-3 pr-4">{item.active ? 'Active' : 'Hidden'}</td>
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
          <div className="w-full max-w-3xl rounded-xl bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-primary">{editing.id ? 'Edit catalog item' : 'Add catalog item'}</h2>
                <p className="text-sm text-muted-foreground">Sell price is always cost × 1.15.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Category</span>
                <select
                  value={editing.category}
                  onChange={(event) => setEditing({ ...editing, category: event.target.value as CategoryTab })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {TABS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Brand</span>
                <Input value={editing.brand} onChange={(event) => setEditing({ ...editing, brand: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">SKU</span>
                <Input value={editing.sku} onChange={(event) => setEditing({ ...editing, sku: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-sm font-medium">Description</span>
                <Input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
              </label>
              {editing.category === 'enclosure' && (() => {
                const spec = parseEnclosureSpec(editing.notes) ?? DEFAULT_ENCLOSURE
                const set = (p: Partial<EnclosureSpec>) => setEditing({ ...editing, notes: enclosureSpecToNotes({ ...spec, ...p }) })
                return (
                  <>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">Material</span>
                      <select value={spec.material} onChange={(e) => set({ material: e.target.value as EnclosureMaterial })} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                        {ENCLOSURE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">Mount</span>
                      <select value={spec.mount} onChange={(e) => set({ mount: e.target.value as EnclosureMount })} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                        {ENCLOSURE_MOUNTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">Ways</span>
                      <select value={spec.ways} onChange={(e) => set({ ways: Number(e.target.value) })} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                        {ENCLOSURE_WAYS.map((w) => <option key={w} value={w}>{w}-way</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">Rows</span>
                      <Input value={String(spec.rows)} onChange={(e) => set({ rows: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">IP rating</span>
                      <Input value={spec.ip} onChange={(e) => set({ ip: e.target.value })} />
                    </label>
                  </>
                )
              })()}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">AC Watts</span>
                <Input value={editing.watts_ac} onChange={(event) => setEditing({ ...editing, watts_ac: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">DC Watts / Wp</span>
                <Input value={editing.watts_dc} onChange={(event) => setEditing({ ...editing, watts_dc: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">kWh</span>
                <Input value={editing.kwh} onChange={(event) => setEditing({ ...editing, kwh: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Phase</span>
                <select
                  value={editing.phase}
                  onChange={(event) => setEditing({ ...editing, phase: event.target.value as FormState['phase'] })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="single">Single</option>
                  <option value="three">Three</option>
                  <option value="any">Any</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Cost (R)</span>
                <Input value={editing.cost_rands} onChange={(event) => setEditing({ ...editing, cost_rands: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Sell price (read-only)</span>
                <Input value={formatRands(Number(editing.cost_rands || 0) * markup)} readOnly />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Isc (A)</span>
                <Input value={editing.isc_amps} onChange={(event) => setEditing({ ...editing, isc_amps: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Voc (V)</span>
                <Input value={editing.voc_volts} onChange={(event) => setEditing({ ...editing, voc_volts: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Sort order</span>
                <Input value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-sm font-medium">Notes</span>
                <textarea
                  value={editing.notes}
                  onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
                  rows={3}
                  placeholder={editing.category === 'inverter'
                    ? 'Max PV kWp: 10.4\nMax panels: 20\nString example: 4 strings total, 2 parallel per MPPT, 8 in series\nBattery brands: Sunsynk, Deye'
                    : ''}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                {editing.category === 'inverter' && (
                  <span className="text-xs text-muted-foreground">
                    Use notes to store PV limits, max panel counts, string layouts, and battery brand compatibility.
                  </span>
                )}
              </label>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(event) => setEditing({ ...editing, active: event.target.checked })}
                />
                Active
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="accent" onClick={saveItem} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : 'Save item'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
