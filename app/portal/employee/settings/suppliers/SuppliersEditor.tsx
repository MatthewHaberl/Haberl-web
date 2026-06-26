'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import type { Supplier, SupplierContact } from '@/types/database'
import { Check, Loader2, Pencil, Plus, X } from 'lucide-react'

interface FormState {
  name: string
  contact_person: string
  email: string
  phone: string
  notes: string
}

interface ContactForm {
  name: string
  email: string
  role: string
  cc_on_po: boolean
}

const EMPTY: FormState = { name: '', contact_person: '', email: '', phone: '', notes: '' }
const EMPTY_CONTACT: ContactForm = { name: '', email: '', role: '', cc_on_po: true }

export function SuppliersEditor({ initialSuppliers }: { initialSuppliers: Supplier[] }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // contacts keyed by supplier_id, loaded once on mount
  const [contacts, setContacts] = useState<Record<string, SupplierContact[]>>({})
  const [newContact, setNewContact] = useState<ContactForm>(EMPTY_CONTACT)
  const [contactBusy, setContactBusy] = useState(false)
  const [contactError, setContactError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('supplier_contacts')
      .select('*')
      .order('sort_order')
      .then(({ data }) => {
        if (!data) return
        const grouped: Record<string, SupplierContact[]> = {}
        for (const c of data as SupplierContact[]) {
          ;(grouped[c.supplier_id] ??= []).push(c)
        }
        setContacts(grouped)
      })
  }, [])

  function startEdit(supplier: Supplier | null) {
    setError('')
    setContactError('')
    setNewContact(EMPTY_CONTACT)
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
        // keep the new supplier open so the user can immediately add contacts
        setEditingId((data as Supplier).id)
        setForm({
          name: data.name,
          contact_person: data.contact_person ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
          notes: data.notes ?? '',
        })
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

  async function addContact(supplierId: string) {
    if (!newContact.name.trim() && !newContact.email.trim()) {
      setContactError('Add a name or email')
      return
    }
    setContactBusy(true)
    setContactError('')
    const supabase = createClient()
    const payload = {
      supplier_id: supplierId,
      name: newContact.name.trim() || null,
      email: newContact.email.trim() || null,
      role: newContact.role.trim() || null,
      cc_on_po: newContact.cc_on_po,
      sort_order: contacts[supplierId]?.length ?? 0,
    }
    const { data, error: dbError } = await supabase
      .from('supplier_contacts').insert(payload).select('*').single()
    if (dbError) setContactError(dbError.message)
    else if (data) {
      setContacts((prev) => ({
        ...prev,
        [supplierId]: [...(prev[supplierId] ?? []), data as SupplierContact],
      }))
      setNewContact(EMPTY_CONTACT)
    }
    setContactBusy(false)
  }

  async function removeContact(contact: SupplierContact) {
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('supplier_contacts').delete().eq('id', contact.id)
    if (!dbError) {
      setContacts((prev) => ({
        ...prev,
        [contact.supplier_id]: (prev[contact.supplier_id] ?? []).filter((c) => c.id !== contact.id),
      }))
    }
  }

  async function toggleContactCc(contact: SupplierContact) {
    const next = !contact.cc_on_po
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('supplier_contacts').update({ cc_on_po: next }).eq('id', contact.id)
    if (!dbError) {
      setContacts((prev) => ({
        ...prev,
        [contact.supplier_id]: (prev[contact.supplier_id] ?? []).map((c) =>
          c.id === contact.id ? { ...c, cc_on_po: next } : c,
        ),
      }))
    }
  }

  const contactsBlock = editingId && editingId !== 'new' && (
    <div className="rounded-md border border-border bg-background/60 p-3 flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        Contact people — ticked names are CC&rsquo;d on every PO email (the supplier email above stays the main recipient)
      </p>
      {(contacts[editingId] ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">No extra contacts yet.</p>
      )}
      {(contacts[editingId] ?? []).map((c) => (
        <div key={c.id} className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
            <input type="checkbox" checked={c.cc_on_po} onChange={() => toggleContactCc(c)} />
            <span className="text-xs text-muted-foreground">CC</span>
          </label>
          <span className="min-w-0 truncate">
            <span className="font-medium">{c.name || c.email}</span>
            {c.email && c.name && <span className="text-muted-foreground"> · {c.email}</span>}
            {c.role && <span className="text-muted-foreground"> · {c.role}</span>}
          </span>
          <Button
            type="button"
            variant="ghost" size="sm"
            className="ml-auto text-destructive h-7 px-2 shrink-0"
            onClick={() => removeContact(c)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="grid sm:grid-cols-4 gap-2 mt-1">
        <Input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} placeholder="Name" />
        <Input value={newContact.email} type="email" onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} placeholder="Email" />
        <Input value={newContact.role} onChange={(e) => setNewContact({ ...newContact, role: e.target.value })} placeholder="Role (optional)" />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={newContact.cc_on_po} onChange={(e) => setNewContact({ ...newContact, cc_on_po: e.target.checked })} /> CC
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => addContact(editingId)} disabled={contactBusy}>
            {contactBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
          </Button>
        </div>
      </div>
      {contactError && <span className="text-xs text-destructive">{contactError}</span>}
    </div>
  )

  const editForm = (
    <form
      onSubmit={(e) => { e.preventDefault(); save() }}
      className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="Supplier name" htmlFor="supplier-name" required error={error || undefined}>
          <Input id="supplier-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Voltex Midrand" />
        </FormField>
        <FormField label="Contact person" htmlFor="supplier-contact-person">
          <Input id="supplier-contact-person" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
        </FormField>
        <FormField label="Email (main PO recipient)" htmlFor="supplier-email">
          <Input id="supplier-email" value={form.email} type="email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField label="Phone" htmlFor="supplier-phone">
          <Input id="supplier-phone" value={form.phone} type="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </FormField>
      </div>
      <FormField label="Notes (account number, rep, terms…)" htmlFor="supplier-notes">
        <Textarea
          id="supplier-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="resize-none"
        />
      </FormField>
      {contactsBlock}
      {editingId === 'new' && (
        <p className="text-xs text-muted-foreground">Save the supplier first, then re-open it to add contact people who should be CC&rsquo;d on POs.</p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="accent" size="sm" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
          <X className="h-3.5 w-3.5" /> Done
        </Button>
      </div>
    </form>
  )

  return (
    <div className="flex flex-col gap-3">
      {suppliers.map((supplier) => {
        const ccPeople = (contacts[supplier.id] ?? []).filter((c) => c.cc_on_po)
        return editingId === supplier.id ? (
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
                {ccPeople.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    CC on POs: {ccPeople.map((c) => c.name || c.email).join(', ')}
                  </p>
                )}
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
        )
      })}

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
