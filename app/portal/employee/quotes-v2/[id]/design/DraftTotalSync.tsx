'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_PRICING, mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { consolidateBom, designToBom } from '@/lib/solar/design-bom'
import { useDesign } from './DesignProvider'
import { useCatalog } from './useCatalog'

/**
 * Keeps quote_requests.working_total_rands in step with the canvas (migration
 * 122) so the quotes list can show a figure for a design that has never been
 * generated.
 *
 * Headless, and mounted inside DesignProvider rather than folded into it: the
 * price of a design is the BOM's answer, and the BOM needs the catalog, which
 * the provider deliberately doesn't carry.
 *
 * It only ever writes a total it actually priced — an empty design, a catalog
 * still loading, or a design whose products have no cost all leave the column
 * alone rather than stamping R0 over a real figure.
 */
export function DraftTotalSync() {
  const { design, gridSupply, canSave, requestId } = useDesign()
  const { items, loading } = useCatalog()
  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let active = true
    createClient()
      .from('company_settings').select('*').eq('id', true).maybeSingle()
      .then(({ data }) => { if (active && data) setPricing(mapSettingsToPricing(data)) })
    return () => { active = false }
  }, [])

  const catalog = useMemo(() => {
    const m = new Map<string, EquipmentCatalogItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const totalR = useMemo(() => {
    if (loading || catalog.size === 0) return null
    if (design.panels.length === 0 && design.inverters.length === 0) return null
    const bom = consolidateBom(designToBom(design, catalog, pricing.markup, { gridSupply, pricing }))
    return bom.totalSellR > 0 ? Math.round(bom.totalSellR * 100) / 100 : null
  }, [design, catalog, loading, pricing, gridSupply])

  // Only the changes are written: the canvas re-renders constantly and the total
  // moves rarely, so the last figure sent is remembered rather than re-sent.
  const lastWritten = useRef<number | null>(null)
  useEffect(() => {
    if (!canSave || totalR == null || totalR === lastWritten.current) return
    const timer = setTimeout(async () => {
      lastWritten.current = totalR
      // Awaited, not fired-and-forgotten: a PostgREST builder is lazy and only
      // sends its request when something consumes the promise.
      const { error } = await supabase
        .from('quote_requests')
        .update({ working_total_rands: totalR })
        .eq('id', requestId)
      // A failed write is not worth interrupting a design for — the list simply
      // shows no figure. Let the next change try again.
      if (error) lastWritten.current = null
    }, 1200)
    return () => clearTimeout(timer)
  }, [totalR, canSave, requestId, supabase])

  return null
}
