import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TYPE_PRIORITY: Record<string, number> = {
  lugs_for_inverter: 1,
  cable_for_inverter: 2,
  breaker_for_inverter: 3,
  earthing_for_system: 4,
  mounting_for_panel: 5,
  other: 6,
}

export async function POST(req: NextRequest) {
  const { product_ids }: { product_ids: string[] } = await req.json()

  if (!product_ids?.length) {
    return NextResponse.json({ recommendations: [] })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
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

  // Deduplicate by related product id, pick highest priority relationship
  const seen = new Map<string, typeof data[0]>()
  for (const row of (data ?? [])) {
    const relId = (row.related_product as { id: string } | null)?.id
    if (!relId || product_ids.includes(relId)) continue  // skip if already in cart
    const existing = seen.get(relId)
    if (!existing || TYPE_PRIORITY[row.relationship_type] < TYPE_PRIORITY[existing.relationship_type]) {
      seen.set(relId, row)
    }
  }

  const recommendations = Array.from(seen.values())
    .sort((a, b) => TYPE_PRIORITY[a.relationship_type] - TYPE_PRIORITY[b.relationship_type])
    .slice(0, 4)

  return NextResponse.json({ recommendations })
}
