'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Plus, Truck, Calculator, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ShippingZone {
  id: string
  name: string
  description: string | null
  base_fee_cents: number
  per_kg_rate_cents: number
  max_weight_kg: number | null
  active: boolean
}

interface Props { zones: ShippingZone[] }

function calcShipping(zone: ShippingZone, weightKg: number): number {
  return zone.base_fee_cents + Math.ceil(weightKg) * zone.per_kg_rate_cents
}

export function ShippingManager({ zones: initial }: Props) {
  const supabase = createClient()
  const [zones, setZones] = useState(initial)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [testWeight, setTestWeight] = useState('5')
  const [saving, setSaving] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, { base: string; perKg: string }>>(() =>
    Object.fromEntries(initial.map(z => [z.id, {
      base: (z.base_fee_cents / 100).toFixed(2),
      perKg: (z.per_kg_rate_cents / 100).toFixed(2),
    }]))
  )

  const [form, setForm] = useState({
    name: '', description: '', base_fee_rands: '100', per_kg_rands: '10', max_weight_kg: ''
  })

  function set(k: keyof typeof form, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleCreate() {
    if (!form.name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('shipping_zones').insert({
      name: form.name.trim(),
      description: form.description || null,
      base_fee_cents: Math.round(Number(form.base_fee_rands) * 100),
      per_kg_rate_cents: Math.round(Number(form.per_kg_rands) * 100),
      max_weight_kg: form.max_weight_kg ? Number(form.max_weight_kg) : null,
      active: true,
    }).select().single()
    if (data) {
      setZones(prev => [...prev, data])
      setForm({ name: '', description: '', base_fee_rands: '100', per_kg_rands: '10', max_weight_kg: '' })
      setCreating(false)
    }
    setSaving(false)
  }

  async function handleToggle(id: string, active: boolean) {
    await supabase.from('shipping_zones').update({ active: !active }).eq('id', id)
    setZones(prev => prev.map(z => z.id === id ? { ...z, active: !active } : z))
  }

  async function handleSaveEdit(id: string, baseFeeRands: string, perKgRands: string) {
    const updates = {
      base_fee_cents: Math.round(Number(baseFeeRands) * 100),
      per_kg_rate_cents: Math.round(Number(perKgRands) * 100),
    }
    await supabase.from('shipping_zones').update(updates).eq('id', id)
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z))
    setEditing(null)
  }

  const weight = Number(testWeight) || 5

  return (
    <div className="flex flex-col gap-4">
      {/* Test calculator */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="h-4 w-4 text-accent" />
            <p className="text-sm font-medium">Shipping cost calculator</p>
          </div>
          <div className="flex items-center gap-3">
            <FormField label="Cart weight" htmlFor="ship-test-weight">
              <Input id="ship-test-weight" type="number" value={testWeight} onChange={e => setTestWeight(e.target.value)} className="w-24" min={0} trailingText="kg" />
            </FormField>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Cost by zone</p>
              <div className="flex flex-wrap gap-2">
                {zones.filter(z => z.active).map(z => (
                  <div key={z.id} className="bg-muted rounded-lg px-3 py-1.5 text-sm">
                    <span className="font-medium">{z.name}:</span>{' '}
                    <span className="text-accent font-bold">R{(calcShipping(z, weight) / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zone list */}
      {zones.map(zone => {
        const isEditing = editing === zone.id
        const ev = editValues[zone.id] ?? { base: (zone.base_fee_cents/100).toFixed(2), perKg: (zone.per_kg_rate_cents/100).toFixed(2) }
        const setEditBase = (v: string) => setEditValues(prev => ({ ...prev, [zone.id]: { ...prev[zone.id], base: v } }))
        const setEditPerKg = (v: string) => setEditValues(prev => ({ ...prev, [zone.id]: { ...prev[zone.id], perKg: v } }))

        return (
          <Card key={zone.id} className={zone.active ? '' : 'opacity-60'}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{zone.name}</span>
                  <Badge variant={zone.active ? 'success' : 'outline'}>{zone.active ? 'Active' : 'Inactive'}</Badge>
                  {!isEditing && (
                    <span className="text-sm text-muted-foreground">
                      R{(zone.base_fee_cents/100).toFixed(0)} base + R{(zone.per_kg_rate_cents/100).toFixed(0)}/kg
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setEditing(isEditing ? null : zone.id)}>
                    {isEditing ? 'Cancel' : 'Edit rates'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(zone.id, zone.active)}>
                    {zone.active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>

              {isEditing && (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSaveEdit(zone.id, ev.base, ev.perKg) }}
                  className="mt-3 pt-3 border-t border-border flex flex-wrap gap-3 items-end"
                >
                  <FormField label="Base fee" htmlFor={`ship-edit-base-${zone.id}`}>
                    <Input id={`ship-edit-base-${zone.id}`} type="number" value={ev.base} onChange={e => setEditBase(e.target.value)} className="w-28" min={0} leadingText="R" />
                  </FormField>
                  <FormField label="Per kg rate" htmlFor={`ship-edit-perkg-${zone.id}`}>
                    <Input id={`ship-edit-perkg-${zone.id}`} type="number" value={ev.perKg} onChange={e => setEditPerKg(e.target.value)} className="w-28" min={0} leadingText="R" trailingText="/kg" />
                  </FormField>
                  <Button type="submit">Save</Button>
                </form>
              )}

              {zone.description && (
                <p className="text-xs text-muted-foreground mt-1">{zone.description}</p>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* Create */}
      {creating ? (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={(e) => { e.preventDefault(); handleCreate() }} className="flex flex-col gap-3">
              <p className="font-semibold text-sm">New shipping zone</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <FormField label="Zone name" htmlFor="ship-new-name" required>
                  <Input id="ship-new-name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Cape Town" />
                </FormField>
                <FormField label="Description" htmlFor="ship-new-description">
                  <Input id="ship-new-description" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Cape Metro area" />
                </FormField>
                <FormField label="Base fee" htmlFor="ship-new-base">
                  <Input id="ship-new-base" type="number" value={form.base_fee_rands} onChange={e => set('base_fee_rands', e.target.value)} min={0} leadingText="R" />
                </FormField>
                <FormField label="Per kg rate" htmlFor="ship-new-perkg">
                  <Input id="ship-new-perkg" type="number" value={form.per_kg_rands} onChange={e => set('per_kg_rands', e.target.value)} min={0} leadingText="R" trailingText="/kg" />
                </FormField>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving || !form.name.trim()}>
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Create zone'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)} className="self-start">
          <Plus className="h-4 w-4" /> Add shipping zone
        </Button>
      )}
    </div>
  )
}
