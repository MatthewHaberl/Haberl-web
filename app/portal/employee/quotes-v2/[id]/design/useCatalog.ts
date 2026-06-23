'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/** Loads the active equipment catalog once (same source as the legacy selector). */
export function useCatalog() {
  const [items, setItems] = useState<EquipmentCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase
      .from('equipment_catalog')
      .select('*')
      .eq('active', true)
      .order('sort_order').order('brand').order('description')
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else setItems((data ?? []) as EquipmentCatalogItem[])
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  return { items, loading, error }
}

export function byCategory(items: EquipmentCatalogItem[], category: EquipmentCatalogItem['category']) {
  return items.filter((i) => i.category === category)
}
