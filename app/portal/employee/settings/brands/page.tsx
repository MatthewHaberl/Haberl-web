'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Loader2, Eye, EyeOff } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { BrandCategory, EquipmentBrand } from '@/types/database'

const CATEGORIES: { key: BrandCategory; label: string; colour: string }[] = [
  { key: 'inverter', label: 'Inverters', colour: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60'  },
  { key: 'battery',  label: 'Batteries', colour: 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800/60' },
  { key: 'panel',    label: 'Panels',    colour: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800/60' },
]

export default function BrandsPage() {
  const [brands,  setBrands]  = useState<EquipmentBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState<Record<BrandCategory, string>>({
    inverter: '', battery: '', panel: '',
  })
  const [saving, setSaving] = useState<Record<BrandCategory, boolean>>({
    inverter: false, battery: false, panel: false,
  })
  const [error, setError] = useState('')

  const supabase = createClient()
  const confirm = useConfirm()

  async function fetchBrands() {
    const { data } = await supabase
      .from('equipment_brands')
      .select('*')
      .order('category')
      .order('brand')
    setBrands((data ?? []) as EquipmentBrand[])
    setLoading(false)
  }

  useEffect(() => { fetchBrands() }, []) // eslint-disable-line

  async function addBrand(category: BrandCategory) {
    const name = newName[category].trim()
    if (!name) return
    setSaving((s) => ({ ...s, [category]: true }))
    setError('')
    try {
      const { error: dbErr } = await supabase.from('equipment_brands').insert({
        category, brand: name,
      })
      if (dbErr) { setError(dbErr.message); return }
      setNewName((n) => ({ ...n, [category]: '' }))
      await fetchBrands()
    } finally {
      setSaving((s) => ({ ...s, [category]: false }))
    }
  }

  async function toggleActive(brand: EquipmentBrand) {
    await supabase.from('equipment_brands').update({ active: !brand.active }).eq('id', brand.id)
    setBrands((prev) => prev.map((b) => b.id === brand.id ? { ...b, active: !b.active } : b))
  }

  async function deleteBrand(id: string) {
    if (!(await confirm({
      title: 'Delete this brand?',
      body: 'It will no longer appear in the form.',
      confirmText: 'Delete',
      destructive: true,
    }))) return
    await supabase.from('equipment_brands').delete().eq('id', id)
    setBrands((prev) => prev.filter((b) => b.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading brands…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">Equipment Brands</h1>
        <p className="text-muted-foreground mt-1">
          Manage the brand options available in the quote request form. Inactive brands are hidden from technicians.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-2">{error}</p>
      )}

      {CATEGORIES.map(({ key, label, colour }) => {
        const categoryBrands = brands.filter((b) => b.category === key)
        return (
          <Card key={key} className={`border ${colour}`}>
            <CardContent className="pt-5 pb-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{label}</h2>

              {/* Brand list */}
              <div className="flex flex-col gap-1">
                {categoryBrands.map((brand) => (
                  <div key={brand.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm truncate ${brand.active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                        {brand.brand}
                      </span>
                      {!brand.active && <Badge variant="outline" className="text-xs shrink-0">hidden</Badge>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={brand.active ? 'Hide from form' : 'Show in form'}
                        onClick={() => toggleActive(brand)}
                      >
                        {brand.active
                          ? <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-destructive"
                        title="Delete brand"
                        onClick={() => deleteBrand(brand.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {!categoryBrands.length && (
                  <p className="text-sm text-muted-foreground py-2">No brands yet.</p>
                )}
              </div>

              {/* Add new */}
              <div className="flex gap-2">
                <Input
                  value={newName[key]}
                  onChange={(e) => setNewName((n) => ({ ...n, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBrand(key))}
                  placeholder={`Add new ${label.toLowerCase().slice(0, -1)} brand…`}
                  className="h-9 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addBrand(key)}
                  disabled={saving[key] || !newName[key].trim()}
                >
                  {saving[key]
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
