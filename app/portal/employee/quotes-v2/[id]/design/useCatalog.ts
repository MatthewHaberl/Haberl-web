'use client'

import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import {
  catalogByCategory,
  ensureCatalog,
  getCatalogServerSnapshot,
  getCatalogSnapshot,
  invalidateCatalog as invalidateCatalogStore,
  subscribeCatalog,
} from '@/lib/catalog/catalog-store'

/**
 * The active equipment catalog, shared by every caller.
 *
 * The design page mounts ~15 components that each want the catalog (every section,
 * the BOM panel, the overview, the faceplate). They all read one copy, held in
 * lib/catalog/catalog-store.ts, which also remembers it in IndexedDB between visits —
 * so moving between sections costs nothing and a reload paints the products you
 * already chose immediately, instead of a "Loading…" placeholder.
 */
export function useCatalog() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      // Kick the load on subscribe rather than in an effect, so the first render after
      // hydration already has the cached catalog where one exists.
      ensureCatalog()
      return subscribeCatalog(listener)
    },
    getCatalogSnapshot,
    getCatalogServerSnapshot,
  )
  return snapshot
}

/** Drops the shared catalog so the next read refetches it. */
export function invalidateCatalog() {
  invalidateCatalogStore()
}

/** Products of one category. Bucketed once per catalog copy, not filtered per render. */
export function byCategory(items: EquipmentCatalogItem[], category: EquipmentCatalogItem['category']) {
  return catalogByCategory(items, category)
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
  invalidateCatalog()
  return data.id as string
}
