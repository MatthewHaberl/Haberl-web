'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface DiscountCode {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed_amount'
  discount_value: number
  description: string | null
  max_uses: number | null
  uses_count: number
  min_order_amount_cents: number | null
  active: boolean
  valid_from: string | null
  valid_until: string | null
  created_at: string
}

interface Props { codes: DiscountCode[] }

const emptyForm = {
  code: '', discount_type: 'percentage' as 'percentage' | 'fixed_amount',
  discount_value: '', description: '', max_uses: '', min_order_rands: '',
  valid_from: '', valid_until: '',
}

export function DiscountCodeManager({ codes: initial }: Props) {
  const supabase = createClient()
  const confirm = useConfirm()
  const [codes, setCodes] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  function set(k: keyof typeof emptyForm, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleCreate() {
    if (!form.code.trim() || !form.discount_value) { setError('Code and value are required'); return }
    setSaving(true); setError('')
    const payload = {
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      description: form.description || null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      min_order_amount_cents: form.min_order_rands ? Math.round(Number(form.min_order_rands) * 100) : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      active: true,
    }
    const { data, error: err } = await supabase.from('discount_codes').insert(payload).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    setCodes(prev => [data, ...prev])
    setForm(emptyForm); setCreating(false)
    setSaving(false)
  }

  async function handleToggle(id: string, active: boolean) {
    await supabase.from('discount_codes').update({ active: !active }).eq('id', id)
    setCodes(prev => prev.map(c => c.id === id ? { ...c, active: !active } : c))
  }

  async function handleDelete(id: string) {
    if (!(await confirm({
      title: 'Deactivate this code?',
      body: 'It will no longer be accepted at checkout.',
      confirmText: 'Deactivate',
      destructive: true,
    }))) return
    await supabase.from('discount_codes').update({ active: false }).eq('id', id)
    setCodes(prev => prev.map(c => c.id === id ? { ...c, active: false } : c))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Existing codes */}
      {codes.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground">No discount codes yet. Create one below.</p>
      )}

      {codes.map(c => (
        <Card key={c.id} className={c.active ? '' : 'opacity-60'}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <code className="font-bold text-base bg-muted px-2 py-0.5 rounded">{c.code}</code>
                <Badge variant={c.discount_type === 'percentage' ? 'accent' : 'default'}>
                  {c.discount_type === 'percentage' ? `${c.discount_value}% off` : `R${c.discount_value} off`}
                </Badge>
                <Badge variant={c.active ? 'success' : 'outline'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                <span className="text-xs text-muted-foreground">
                  Used {c.uses_count}{c.max_uses ? `/${c.max_uses}` : ''} time{c.uses_count !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleToggle(c.id, c.active)} className="p-1 rounded hover:bg-muted">
                  {c.active
                    ? <ToggleRight className="h-5 w-5 text-success" />
                    : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                </button>
                <button onClick={() => handleDelete(c.id)} className="p-1 rounded hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {(c.description || c.min_order_amount_cents || c.valid_until) && (
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                {c.description && <span>{c.description}</span>}
                {c.min_order_amount_cents && <span>Min order: R{(c.min_order_amount_cents/100).toFixed(0)}</span>}
                {c.valid_until && <span>Expires: {new Date(c.valid_until).toLocaleDateString('en-ZA')}</span>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Create form */}
      {creating ? (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={(e) => { e.preventDefault(); handleCreate() }} className="flex flex-col gap-4">
              <p className="font-semibold text-sm">New discount code</p>

              <div className="grid sm:grid-cols-2 gap-3">
                <FormField label="Code (auto-uppercased)" htmlFor="discount-code" required>
                  <Input id="discount-code" value={form.code} onChange={e => set('code', e.target.value)} placeholder="WELCOME10" />
                </FormField>
                <FormField label="Description" htmlFor="discount-description">
                  <Input id="discount-description" value={form.description} onChange={e => set('description', e.target.value)} placeholder="New customer discount" />
                </FormField>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <FormField label="Type" htmlFor="discount-type" required>
                  <Select
                    id="discount-type"
                    value={form.discount_type}
                    onChange={e => set('discount_type', e.target.value)}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed amount (R)</option>
                  </Select>
                </FormField>
                <FormField label="Value" htmlFor="discount-value" required>
                  <Input
                    id="discount-value"
                    type="number"
                    value={form.discount_value}
                    onChange={e => set('discount_value', e.target.value)}
                    placeholder={form.discount_type === 'percentage' ? '10' : '50'}
                    min={0}
                    {...(form.discount_type === 'percentage'
                      ? { max: 100, trailingText: '%' as const }
                      : { leadingText: 'R' as const })}
                  />
                </FormField>
                <FormField label="Max uses (blank = unlimited)" htmlFor="discount-max-uses">
                  <Input id="discount-max-uses" type="number" value={form.max_uses} onChange={e => set('max_uses', e.target.value)} placeholder="Unlimited" min={1} />
                </FormField>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <FormField label="Min order (optional)" htmlFor="discount-min-order">
                  <Input id="discount-min-order" type="number" value={form.min_order_rands} onChange={e => set('min_order_rands', e.target.value)} placeholder="e.g. 500" min={0} leadingText="R" />
                </FormField>
                <FormField label="Valid from (optional)" htmlFor="discount-valid-from">
                  <Input id="discount-valid-from" type="datetime-local" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} />
                </FormField>
                <FormField label="Valid until (optional)" htmlFor="discount-valid-until">
                  <Input id="discount-valid-until" type="datetime-local" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
                </FormField>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Create code'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setCreating(false); setError('') }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)} className="self-start">
          <Plus className="h-4 w-4" /> New discount code
        </Button>
      )}
    </div>
  )
}
