import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Lower number = shown first. Manual product_relationships types rank above the
// auto-generated SANS compatibility types so hand-curated picks always lead.
const TYPE_PRIORITY: Record<string, number> = {
  lugs_for_inverter: 1,
  cable_for_inverter: 2,
  breaker_for_inverter: 3,
  earthing_for_system: 4,
  mounting_for_panel: 5,
  // Catalog-level SANS compatibility links (equipment_relationships, migration 092)
  battery_for_inverter: 6,
  changeover_for_inverter: 7,
  spd_for_inverter: 8,
  dc_breaker_for_panel: 9,
  dc_isolator_for_panel: 10,
  string_fuse_for_panel: 11,
  dc_spd_for_panel: 12,
  spd_for_breaker: 13,
  changeover_for_breaker: 14,
  other: 99,
}

interface RecommendationRow {
  id: string
  product_id: string
  relationship_type: string
  reason: string | null
  priority: number
  related_product: {
    id: string
    slug: string
    name: string
    sku: string | null
    category: string | null
    brand: string | null
    price: number
    images: string[] | null
    watts_ac: number | null
    watts_dc: number | null
    kwh: number | null
  } | null
}

export async function POST(req: NextRequest) {
  let product_ids: string[]
  try {
    const body = await req.json()
    product_ids = body?.product_ids
  } catch {
    return NextResponse.json({ recommendations: [] })
  }

  if (!product_ids?.length) {
    return NextResponse.json({ recommendations: [] })
  }

  const supabase = await createClient()

  // 1 — hand-curated store relationships
  const { data: manual, error } = await supabase
    .from('product_relationships')
    .select(`
      id,
      product_id,
      relationship_type,
      reason,
      priority,
      related_product:products!product_relationships_related_product_id_fkey(
        id, slug, name, sku, category, brand, price, images, watts_ac, watts_dc, kwh
      )
    `)
    .in('product_id', product_ids)
    .eq('active', true)
    .order('priority', { ascending: false })

  if (error) {
    return NextResponse.json({ recommendations: [] })
  }

  const rows: RecommendationRow[] = (manual ?? []) as unknown as RecommendationRow[]

  // 2 — auto-generated SANS compatibility links live at the CATALOG level
  // (equipment_relationships), so hop products → external_id → catalog graph →
  // back to store-visible products.
  const { data: cartProducts } = await supabase
    .from('products')
    .select('id, external_id')
    .in('id', product_ids)
    .not('external_id', 'is', null)

  const externalToProduct = new Map(
    (cartProducts ?? []).map((p) => [p.external_id as string, p.id as string]),
  )
  const externalIds = Array.from(externalToProduct.keys())

  if (externalIds.length > 0) {
    const { data: catalogRels } = await supabase
      .from('equipment_relationships')
      .select('id, item_id, related_id, relationship_type, reason, priority')
      .in('item_id', externalIds)
      .eq('active', true)
      .order('priority', { ascending: false })
      .limit(60)

    const relatedExternalIds = Array.from(new Set((catalogRels ?? []).map((r) => r.related_id as string)))
    if (relatedExternalIds.length > 0) {
      const { data: relatedProducts } = await supabase
        .from('products')
        .select('id, external_id, slug, name, sku, category, brand, price, images, watts_ac, watts_dc, kwh')
        .in('external_id', relatedExternalIds)
        .eq('active', true)

      const byExternal = new Map((relatedProducts ?? []).map((p) => [p.external_id as string, p]))
      for (const rel of catalogRels ?? []) {
        const related = byExternal.get(rel.related_id as string)
        if (!related) continue
        rows.push({
          id: rel.id as string,
          product_id: externalToProduct.get(rel.item_id as string) ?? '',
          relationship_type: rel.relationship_type as string,
          reason: rel.reason as string | null,
          priority: rel.priority as number,
          related_product: related as RecommendationRow['related_product'],
        })
      }
    }
  }

  // Deduplicate by related product id, pick highest-ranked relationship type
  const rank = (t: string) => TYPE_PRIORITY[t] ?? 99
  const seen = new Map<string, RecommendationRow>()
  for (const row of rows) {
    const relId = row.related_product?.id
    if (!relId || product_ids.includes(relId)) continue // skip if already in cart
    const existing = seen.get(relId)
    if (!existing || rank(row.relationship_type) < rank(existing.relationship_type)) {
      seen.set(relId, row)
    }
  }

  const recommendations = Array.from(seen.values())
    .sort((a, b) => rank(a.relationship_type) - rank(b.relationship_type) || b.priority - a.priority)
    .slice(0, 4)

  return NextResponse.json({ recommendations })
}
