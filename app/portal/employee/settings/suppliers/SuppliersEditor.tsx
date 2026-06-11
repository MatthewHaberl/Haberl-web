'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Supplier } from '@/types/database'
import { Check, Loader2, Pencil, Plus, X } from 'lucide-react'

interface FormState {
  name: string
  contact_person: string
  email: string
  phone: string
  notes: string
}

const EMPTY: FormState = { name: '', contact_person: '', email: '', phone: '', notes: '' }

export function SuppliersEditor({ initialSuppliers }: { initialSuppliers: Supplier[] }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function startEdit(supplier: Supplier | null) {
    setError('')
    if (!supplier) {
      setEditingId('new')
      setForm(EMPTY)
      return
    }
    setEditingId(supplier.id)
    setForm({
      name: supplier.name,
      contact_person: supplier.contact_person ?? '',
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
      notes: supplier.notes ?? '',
    })
  }

  async function save() {
    if (form.name.trim().length < 2) {
      setError('Supplier name is required')
      return
    }
    setBusy(true)
    setError('')
    const supabase = createClient()
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    }
    if (editingId === 'new') {
      const { data, error: dbError } = await supabase
        .from('suppliers').insert(payload).select('*').single()
      if (dbError) setError(dbError.message)
      else if (data) {
        setSuppliers((prev) => [...prev, data as Supplier].sort((a, b) => a.name.localeCompare(b.name)))
        setEditingId(null)
      }
    } else if (editingId) {
      const { error: dbError } = await supabase
        .from('suppliers').update(payload).eq('id', editingId)
      if (dbError) setError(dbError.message)
      else {
        setSuppliers((prev) => prev.map((s) => (s.id === editingId ? { ...s, ...payload } : s)))
        setEditingId(null)
      }
    }
    setBusy(false)
  }

  async function toggleActive(supplier: Supplier) {
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('suppliers').update({ active: !supplier.active }).eq('id', supplier.id)
    if (!dbError) {
      setSuppliers((prev) => prev.map((s) => (s.id === supplier.id ? { ...s, active: !s.active } : s)))
    }
  }

  const editForm = (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Supplier name *</span>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Voltex Midrand" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Contact person</span>
          <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Email (for sending POs)</span>
          <Input value={form.email} type="email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Phone</span>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Notes (account number, rep, terms…)</span>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
        />
      </label>
      <div className="flex items-center gap-2">
        <Button variant="accent" size="sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {suppliers.map((supplier) =>
        editingId === supplier.id ? (
          <div key={supplier.id}>{editForm}</div>
        ) : (
          <Card key={supplier.id} className={supplier.active ? '' : 'opacity-60'}>
            <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{supplier.name}</p>
                  {!supplier.active && <Badge variant="default">Inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[supplier.contact_person, supplier.email, supplier.phone].filter(Boolean).join(' · ') || 'No contact details'}
                </p>
                {supplier.notes && <p className="text-xs text-muted-foreground mt-1">{supplier.notes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => startEdit(supplier)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={() => toggleActive(supplier)}>
                  {supplier.active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ),
      )}

      {editingId === 'new' ? (
        editForm
      ) : (
        <Button variant="outline" onClick={() => startEdit(null)} className="self-start">
          <Plus className="h-4 w-4" /> Add supplier
        </Button>
      )}
    </div>
  )
}
