'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, ToggleLeft, ToggleRight, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/ui/confirm-dialog'

const RELATIONSHIP_TYPES = [
  { value: 'lugs_for_inverter',    label: 'Lugs for inverter' },
  { value: 'cable_for_inverter',   label: 'Cable for inverter' },
  { value: 'breaker_for_inverter', label: 'Breaker for inverter' },
  { value: 'earthing_for_system',  label: 'Earthing for system' },
  { value: 'mounting_for_panel',   label: 'Mounting for panel' },
  { value: 'other',                label: 'Other / generic' },
]

const TYPE_BADGE: Record<string, 'warning' | 'accent' | 'default' | 'success' | 'outline'> = {
  lugs_for_inverter:    'warning',
  cable_for_inverter:   'accent',
  breaker_for_inverter: 'default',
  earthing_for_system:  'success',
  mounting_for_panel:   'default',
  other:                'outline',
}

interface SimpleProduct { id: string; name: string; sku: string | null; category: string | null; brand: string | null }

interface Relationship {
  id: string
  relationship_type: string
  reason: string | null
  active: boolean
  priority: number
  product: SimpleProduct | SimpleProduct[] | null
  related: SimpleProduct | SimpleProduct[] | null
}

interface Props {
  relationships: Relationship[]
  products: SimpleProduct[]
}

function getOne<T>(val: T | T[] | null): T | null {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

export function RelationshipManager({ relationships: initial, products }: Props) {
  const supabase = createClient()
  const confirm = useConfirm()
  const [rels, setRels] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [form, setForm] = useState({
    product_id: '', related_product_id: '',
    relationship_type: 'lugs_for_inverter', reason: '', priority: '0',
  })
  function set(k: keyof typeof form, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleCreate() {
    if (!form.product_id || !form.related_product_id) { setError('Both products are required'); return }
    if (form.product_id === form.related_product_id) { setError('Cannot link a product to itself'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase
      .from('product_relationships')
      .insert({
        product_id: form.product_id,
        related_product_id: form.related_product_id,
        relationship_type: form.relationship_type,
        reason: form.reason || null,
        priority: Number(form.priority),
        active: true,
      })
      .select(`
        id, relationship_type, reason, active, priority,
        product:products!product_relationships_product_id_fkey(id, name, sku, category, brand),
        related:products!product_relationships_related_product_id_fkey(id, name, sku, category, brand)
      `)
      .single()
    if (err) { setError(err.message); setSaving(false); return }
    setRels(prev => [data as Relationship, ...prev])
    setForm({ product_id: '', related_product_id: '', relationship_type: 'lugs_for_inverter', reason: '', priority: '0' })
    setCreating(false)
    setSaving(false)
  }

  async function handleToggle(id: string, active: boolean) {
    await supabase.from('product_relationships').update({ active: !active }).eq('id', id)
    setRels(prev => prev.map(r => r.id === id ? { ...r, active: !active } : r))
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this relationship?', confirmText: 'Delete', destructive: true }))) return
    await supabase.from('product_relationships').delete().eq('id', id)
    setRels(prev => prev.filter(r => r.id !== id))
  }

  const filtered = search
    ? rels.filter(r => {
        const p = getOne(r.product); const rel = getOne(r.related)
        const q = search.toLowerCase()
        return p?.name.toLowerCase().includes(q) || rel?.name.toLowerCase().includes(q) ||
               p?.sku?.toLowerCase().includes(q) || rel?.sku?.toLowerCase().includes(q)
      })
    : rels

  const productOptions = products.map(p => ({
    ...p,
    label: `${p.sku ?? p.id.slice(0,8)} — ${p.name}${p.brand ? ` (${p.brand})` : ''}`,
  }))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        When a customer adds the <strong>main product</strong> to their cart, the <strong>related product</strong> appears in the
        &ldquo;Don&apos;t forget these&rdquo; section. Use this to link inverters to their required lugs, cables, or breakers.
      </p>

      {/* Search */}
      <Input
        placeholder="Search relationships by product name or SKU…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-md"
      />

      <p className="text-xs text-muted-foreground">{filtered.length} relationship{filtered.length !== 1 ? 's' : ''}</p>

      {/* List */}
      {filtered.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground">No relationships yet. Add one below.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map(rel => {
          const p = getOne(rel.product)
          const r = getOne(rel.related)
          return (
            <Card key={rel.id} className={rel.active ? '' : 'opacity-50'}>
              <CardContent className="py-2.5 px-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-mono">{p?.sku ?? '—'}</p>
                      <p className="text-sm font-medium truncate">{p?.name ?? 'Unknown'}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-mono">{r?.sku ?? '—'}</p>
                      <p className="text-sm font-medium truncate">{r?.name ?? 'Unknown'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={TYPE_BADGE[rel.relationship_type] ?? 'outline'} className="text-[10px]">
                      {RELATIONSHIP_TYPES.find(t => t.value === rel.relationship_type)?.label ?? rel.relationship_type}
                    </Badge>
                    <button onClick={() => handleToggle(rel.id, rel.active)} className="p-1 rounded hover:bg-muted">
                      {rel.active
                        ? <ToggleRight className="h-4 w-4 text-success" />
                        : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    <button onClick={() => handleDelete(rel.id)} className="p-1 rounded hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {rel.reason && <p className="text-xs text-muted-foreground mt-1 truncate">{rel.reason}</p>}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create form */}
      {creating ? (
        <Card>
          <CardContent className="pt-4 flex flex-col gap-3">
            <p className="font-semibold text-sm">New relationship</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Main product (in cart) *</label>
                <select value={form.product_id} onChange={e => set('product_id', e.target.value)} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                  <option value="">Select product…</option>
                  {productOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Related product (suggested) *</label>
                <select value={form.related_product_id} onChange={e => set('related_product_id', e.target.value)} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                  <option value="">Select product…</option>
                  {productOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Relationship type *</label>
                <select value={form.relationship_type} onChange={e => set('relationship_type', e.target.value)} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                  {RELATIONSHIP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reason (shown to customer)</label>
                <Input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="e.g. Required for SigenStor 8kW output circuit" className="mt-1" />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Saving…' : 'Add relationship'}
              </Button>
              <Button variant="ghost" onClick={() => { setCreating(false); setError('') }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)} className="self-start">
          <Plus className="h-4 w-4" /> Add relationship
        </Button>
      )}
    </div>
  )
}
