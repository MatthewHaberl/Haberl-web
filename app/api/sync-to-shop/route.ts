import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/calculate-quote/helpers'

export const runtime = 'nodejs'

const SHOP_MARKUP = 1.30
const CATEGORY_LABEL: Record<string, string> = {
  inverter: 'Inverters',
  battery: 'Batteries',
  panel: 'Solar Panels',
}

function toSlug(sku: string) {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json() as { catalogIds: string[] }
  const ids = (body.catalogIds ?? []).filter(Boolean)
  if (!ids.length) return NextResponse.json({ synced: [] })

  const { data: items, error } = await supabase
    .from('equipment_catalog')
    .select('id, brand, sku, description, category, cost_rands, kwh, watts_ac, watts_dc')
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ synced: [] })

  const synced: string[] = []

  for (const item of items) {
    const priceCents = Math.round(Number(item.cost_rands) * SHOP_MARKUP * 100)
    const slug = toSlug(item.sku)
    const category = CATEGORY_LABEL[item.category] ?? item.category

    // Upsert by external_id so re-saves don't create duplicates
    const { error: upsertError } = await supabase
      .from('products')
      .upsert(
        {
          external_id: item.id,
          name: item.description,
          slug,
          brand: item.brand,
          category,
          sku: item.sku,
          price: priceCents,
          kwh: item.kwh ?? null,
          watts_ac: item.watts_ac ?? null,
          watts_dc: item.watts_dc ?? null,
          active: false,   // hidden from shop until manually activated
          stock_qty: 99,
        },
        { onConflict: 'external_id', ignoreDuplicates: false },
      )

    if (!upsertError) synced.push(item.description)
  }

  return NextResponse.json({ synced })
}
