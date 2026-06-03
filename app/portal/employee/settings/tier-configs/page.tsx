'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { EquipmentCatalogItem, QuoteTierConfig } from '@/types/database'
import { Loader2, Pencil, Plus, X } from 'lucide-react'

type FormState = {
  id?: string
  min_inverter_kw: string
  max_inverter_kw: string
  tier: 'premium' | 'recommended' | 'budget'
  phase: 'single' | 'three' | 'any'
  inverter_id: string
  battery_id: string
  panel_id: string
  sort_order: string
  active: boolean
}

const EMPTY_FORM: FormState = {
  min_inverter_kw: '',
  max_inverter_kw: '',
  tier: 'recommended',
  phase: 'single',
  inverter_id: '',
  battery_id: '',
  panel_id: '',
  sort_order: '0',
  active: true,
}

function navLink(href: string, label: string) {
  return (
    <Link href={href} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
      {label}
    </Link>
  )
}

function configToForm(config: QuoteTierConfig): FormState {
  return {
    id: config.id,
    min_inverter_kw: String(config.min_inverter_kw),
    max_inverter_kw: String(config.max_inverter_kw),
    tier: config.tier,
    phase: config.phase,
    inverter_id: config.inverter_id,
    battery_id: config.battery_id,
    panel_id: config.panel_id,
    sort_order: String(config.sort_order),
    active: config.active,
  }
}

export default function TierConfigsPage() {
  const supabase = createClient()
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([])
  const [configs, setConfigs] = useState<QuoteTierConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<FormState | null>(null)

  async function loadData() {
    setLoading(true)
    setError('')
    const [{ data: equipmentRows, error: equipmentError }, { data: configRows, error: configError }] = await Promise.all([
      supabase.from('equipment_catalog').select('*').eq('active', true).order('brand').order('description'),
      supabase.from('quote_tier_configs').select('*').order('min_inverter_kw').order('sort_order'),
    ])

    if (equipmentError || configError) {
      setError(equipmentError?.message ?? configError?.message ?? 'Could not load tier configs')
      setLoading(false)
      return
    }

    setCatalog((equipmentRows ?? []) as EquipmentCatalogItem[])
    setConfigs((configRows ?? []) as QuoteTierConfig[])
    setLoading(false)
  }

  useEffect(() => {
    let active = true

    ;(async () => {
      const [{ data: equipmentRows, error: equipmentError }, { data: configRows, error: configError }] = await Promise.all([
        supabase.from('equipment_catalog').select('*').eq('active', true).order('brand').order('description'),
        supabase.from('quote_tier_configs').select('*').order('min_inverter_kw').order('sort_order'),
      ])

      if (!active) return

      if (equipmentError || configError) {
        setError(equipmentError?.message ?? configError?.message ?? 'Could not load tier configs')
        setLoading(false)
        return
      }

      setCatalog((equipmentRows ?? []) as EquipmentCatalogItem[])
      setConfigs((configRows ?? []) as QuoteTierConfig[])
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [supabase])

  const grouped = useMemo(() => {
    const groups = new Map<string, QuoteTierConfig[]>()
    for (const config of configs) {
      const key = `${config.phase}:${config.min_inverter_kw}-${config.max_inverter_kw}`
      groups.set(key, [...(groups.get(key) ?? []), config])
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [configs])

  const inverterOptions = catalog.filter((item) => item.category === 'inverter')
  const batteryOptions = catalog.filter((item) => item.category === 'battery')
  const panelOptions = catalog.filter((item) => item.category === 'panel')
  const itemMap = new Map(catalog.map((item) => [item.id, item]))

  async function saveConfig() {
    if (!editing) return
    setSaving(true)
    setError('')

    const payload = {
      min_inverter_kw: Number(editing.min_inverter_kw || 0),
      max_inverter_kw: Number(editing.max_inverter_kw || 0),
      tier: editing.tier,
      phase: editing.phase,
      inverter_id: editing.inverter_id,
      battery_id: editing.battery_id,
      panel_id: editing.panel_id,
      sort_order: Number(editing.sort_order || 0),
      active: editing.active,
    }

    const query = editing.id
      ? supabase.from('quote_tier_configs').update(payload).eq('id', editing.id)
      : supabase.from('quote_tier_configs').insert(payload)

    const { error: dbError } = await query
    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    setEditing(null)
    setSaving(false)
    await loadData()
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {navLink('/portal/employee/settings', 'Settings')}
        {navLink('/portal/employee/settings/brands', 'Brands')}
        {navLink('/portal/employee/settings/catalog', 'Catalog')}
        {navLink('/portal/employee/settings/tier-configs', 'Tier Configs')}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tier Configs</h1>
          <p className="mt-1 text-muted-foreground">
            Map inverter size brackets to Premium, Recommended, and Budget equipment sets.
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditing({ ...EMPTY_FORM })}>
          <Plus className="h-4 w-4" /> Add bracket row
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardContent className="pt-5">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tier configs...
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {grouped.map(([key, rows]) => {
                const [phase, range] = key.split(':')
                return (
                  <div key={key} className="rounded-lg border border-border">
                    <div className="border-b border-border bg-muted/50 px-4 py-3">
                      <div className="text-sm font-semibold text-primary">{range}kW bracket</div>
                      <div className="text-xs text-muted-foreground">{phase} phase</div>
                    </div>
                    <div className="overflow-x-auto px-4 py-4">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-muted-foreground">
                          <tr className="border-b border-border">
                            <th className="pb-3 pr-4">Tier</th>
                            <th className="pb-3 pr-4">Inverter</th>
                            <th className="pb-3 pr-4">Battery</th>
                            <th className="pb-3 pr-4">Panel</th>
                            <th className="pb-3 pr-4">Status</th>
                            <th className="pb-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.sort((a, b) => a.sort_order - b.sort_order).map((row) => (
                            <tr key={row.id} className="border-b border-border/60">
                              <td className="py-3 pr-4 capitalize">{row.tier}</td>
                              <td className="py-3 pr-4">{itemMap.get(row.inverter_id)?.description ?? row.inverter_id}</td>
                              <td className="py-3 pr-4">{itemMap.get(row.battery_id)?.description ?? row.battery_id}</td>
                              <td className="py-3 pr-4">{itemMap.get(row.panel_id)?.description ?? row.panel_id}</td>
                              <td className="py-3 pr-4">{row.active ? 'Active' : 'Hidden'}</td>
                              <td className="py-3">
                                <Button variant="outline" size="sm" onClick={() => setEditing(configToForm(row))}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-primary">{editing.id ? 'Edit tier row' : 'Add tier row'}</h2>
                <p className="text-sm text-muted-foreground">Each bracket should end up with Premium, Recommended, and Budget rows.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Min inverter kW</span>
                <Input value={editing.min_inverter_kw} onChange={(event) => setEditing({ ...editing, min_inverter_kw: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Max inverter kW</span>
                <Input value={editing.max_inverter_kw} onChange={(event) => setEditing({ ...editing, max_inverter_kw: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Tier</span>
                <select
                  value={editing.tier}
                  onChange={(event) => setEditing({ ...editing, tier: event.target.value as FormState['tier'] })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="premium">Premium</option>
                  <option value="recommended">Recommended</option>
                  <option value="budget">Budget</option>
                </select>
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
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-sm font-medium">Inverter</span>
                <select
                  value={editing.inverter_id}
                  onChange={(event) => setEditing({ ...editing, inverter_id: event.target.value })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">Select inverter</option>
                  {inverterOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.description}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Battery</span>
                <select
                  value={editing.battery_id}
                  onChange={(event) => setEditing({ ...editing, battery_id: event.target.value })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">Select battery</option>
                  {batteryOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.description}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Panel</span>
                <select
                  value={editing.panel_id}
                  onChange={(event) => setEditing({ ...editing, panel_id: event.target.value })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">Select panel</option>
                  {panelOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.description}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Sort order</span>
                <Input value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: event.target.value })} />
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
              <Button variant="accent" onClick={saveConfig} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : 'Save config'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
