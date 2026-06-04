'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Users, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Customer {
  id: string
  full_name: string
  email: string
}

interface CustomerAssignment {
  id: string
  customer_id: string
  active: boolean
  customer: Customer | Customer[] | null
}

interface PriceList {
  id: string
  name: string
  description: string | null
  markup_percent: number
  discount_percent: number
  active: boolean
  created_at: string
  customer_price_lists: CustomerAssignment[]
}

interface Props {
  priceLists: PriceList[]
  customers: Customer[]
}

const EXAMPLE_COST = 10000

function calcPrice(cost: number, markup: number, discount: number) {
  return cost * (1 + markup / 100) * (1 - discount / 100)
}

export function PriceListEditor({ priceLists: initial, customers }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [lists, setLists] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newMarkup, setNewMarkup] = useState(30)
  const [newDiscount, setNewDiscount] = useState(0)

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('price_lists')
      .insert({ name: newName.trim(), description: newDesc || null, markup_percent: newMarkup, discount_percent: newDiscount, active: true })
      .select()
      .single()
    if (!error && data) {
      setLists(prev => [...prev, { ...data, customer_price_lists: [] }])
      setNewName(''); setNewDesc(''); setNewMarkup(30); setNewDiscount(0)
      setCreating(false)
    }
    setSaving(false)
  }

  async function handleToggleActive(id: string, current: boolean) {
    await supabase.from('price_lists').update({ active: !current }).eq('id', id)
    setLists(prev => prev.map(l => l.id === id ? { ...l, active: !current } : l))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this price list? Customers assigned to it will lose their discount.')) return
    await supabase.from('price_lists').delete().eq('id', id)
    setLists(prev => prev.filter(l => l.id !== id))
  }

  async function handleAssignCustomer(priceListId: string, customerId: string, alreadyAssigned: boolean) {
    if (alreadyAssigned) {
      await supabase.from('customer_price_lists').delete().eq('price_list_id', priceListId).eq('customer_id', customerId)
      setLists(prev => prev.map(l => l.id !== priceListId ? l : {
        ...l,
        customer_price_lists: l.customer_price_lists.filter(a => a.customer_id !== customerId)
      }))
    } else {
      const { data } = await supabase
        .from('customer_price_lists')
        .insert({ price_list_id: priceListId, customer_id: customerId, active: true })
        .select('id, customer_id, active')
        .single()
      if (data) {
        const cust = customers.find(c => c.id === customerId) ?? null
        setLists(prev => prev.map(l => l.id !== priceListId ? l : {
          ...l,
          customer_price_lists: [...l.customer_price_lists, { ...data, customer: cust }]
        }))
      }
    }
  }

  function getCustomer(assignment: CustomerAssignment): Customer | null {
    if (!assignment.customer) return null
    if (Array.isArray(assignment.customer)) return assignment.customer[0] ?? null
    return assignment.customer
  }

  return (
    <div className="flex flex-col gap-4">
      {lists.map(list => {
        const isOpen = expanded === list.id
        const assignedIds = new Set(list.customer_price_lists.map(a => a.customer_id))
        const previewPrice = calcPrice(EXAMPLE_COST, list.markup_percent, list.discount_percent)

        return (
          <Card key={list.id} className={list.active ? '' : 'opacity-60'}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{list.name}</CardTitle>
                    <Badge variant={list.active ? 'success' : 'outline'}>{list.active ? 'Active' : 'Inactive'}</Badge>
                    <Badge variant="default">{list.markup_percent}% markup</Badge>
                    {list.discount_percent > 0 && (
                      <Badge variant="accent">−{list.discount_percent}% discount</Badge>
                    )}
                  </div>
                  {list.description && <p className="text-sm text-muted-foreground mt-1">{list.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Preview: R10,000 cost → <strong>R{previewPrice.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong>
                    {' · '}
                    <span className="text-success">{list.customer_price_lists.length} customer{list.customer_price_lists.length !== 1 ? 's' : ''} assigned</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setExpanded(isOpen ? null : list.id)}
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                  >
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <Button variant="outline" size="sm" onClick={() => handleToggleActive(list.id, list.active)}>
                    {list.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <button
                    onClick={() => handleDelete(list.id)}
                    className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>

            {isOpen && (
              <CardContent className="pt-0">
                <div className="border-t border-border pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Assign customers to this price list</p>
                  </div>
                  {customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No customer accounts yet.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {customers.map(c => {
                        const assigned = assignedIds.has(c.id)
                        return (
                          <button
                            key={c.id}
                            onClick={() => handleAssignCustomer(list.id, c.id, assigned)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors text-sm ${
                              assigned
                                ? 'border-success bg-success/5 text-success'
                                : 'border-border hover:bg-muted'
                            }`}
                          >
                            {assigned && <Check className="h-3.5 w-3.5 shrink-0" />}
                            <div className="min-w-0">
                              <p className="font-medium truncate">{c.full_name}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Create new */}
      {creating ? (
        <Card>
          <CardContent className="pt-4 flex flex-col gap-3">
            <p className="font-semibold text-sm">New price list</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Contractor 10%" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Markup % (base)</label>
                <Input type="number" value={newMarkup} onChange={e => setNewMarkup(Number(e.target.value))} min={0} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Discount % (off marked price)</label>
                <Input type="number" value={newDiscount} onChange={e => setNewDiscount(Number(e.target.value))} min={0} max={100} className="mt-1" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Preview: R10,000 cost → <strong>R{calcPrice(EXAMPLE_COST, newMarkup, newDiscount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong>
            </p>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !newName.trim()}>
                {saving ? 'Saving…' : 'Create list'}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)} className="self-start">
          <Plus className="h-4 w-4" /> New price list
        </Button>
      )}
    </div>
  )
}
