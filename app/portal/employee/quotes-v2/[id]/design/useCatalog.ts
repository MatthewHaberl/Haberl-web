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

/**
 * Quick-add a custom placeholder into the catalog as a `pending` row (migration 049):
 * the designer typed a label NOW but the part still needs a real SKU/cost/spec.
 * It surfaces in catalog admin as a "to-add" queue item. Returns the new row id, or
 * null on failure (caller can fall back to the `custom:<label>` sentinel on the design).
 *
 * NOTE: requires migration 049 (the `pending` column) to be applied; until then the
 * insert will fail and callers keep the inline custom placeholder. Pragmatic and
 * additive — no design data is lost either way.
 */
export async function addPendingCatalogItem(
  label: string,
  category: EquipmentCatalogItem['category'],
): Promise<string | null> {
  const description = label.trim()
  if (!description) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('equipment_catalog')
    .insert({
      category,
      brand: 'TBD',
      sku: `PENDING-${Date.now()}`,
      description,
      phase: 'any',
      cost_rands: 0,
      active: false,   // hidden from the quote calculator until priced
      pending: true,   // flagged for the catalog "to-add" queue
      sort_order: 0,
    })
    .select('id')
    .single()
  if (error || !data) return null
  return data.id as string
}
