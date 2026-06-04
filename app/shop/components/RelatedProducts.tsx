'use client'

import { useEffect, useState } from 'react'
import { ShoppingCart, Zap, Battery, Sun, Package, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { useCart } from '@/lib/store/cart-context'
import type { CartItem } from '@/types/database'

const categoryIcon: Record<string, React.ReactNode> = {
  inverter: <Zap className="h-5 w-5 text-accent/50" />,
  battery:  <Battery className="h-5 w-5 text-accent/50" />,
  panel:    <Sun className="h-5 w-5 text-accent/50" />,
  other:    <Package className="h-5 w-5 text-accent/50" />,
}

const relationLabel: Record<string, string> = {
  lugs_for_inverter:    'Required lugs',
  cable_for_inverter:   'Required cable',
  breaker_for_inverter: 'Recommended breaker',
  earthing_for_system:  'Earthing needed',
  mounting_for_panel:   'Panel mounting',
  other:                'Goes with this',
}

interface RelatedProduct {
  id: string
  slug: string
  name: string
  sku: string | null
  category: string | null
  brand: string | null
  price: number
  images: string[]
  watts_ac: number | null
  watts_dc: number | null
  kwh: number | null
}

interface Recommendation {
  id: string
  product_id: string
  relationship_type: string
  reason: string | null
  related_product: RelatedProduct
}

export function RelatedProducts() {
  const { items, addItem } = useCart()
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(false)

  const cartProductIds = items.map(i => i.product_id)
  const cacheKey = cartProductIds.sort().join(',')

  useEffect(() => {
    if (!cartProductIds.length) { setRecs([]); return }

    setLoading(true)
    fetch('/api/shop/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: cartProductIds }),
    })
      .then(r => r.json())
      .then(({ recommendations }) => setRecs(recommendations ?? []))
      .catch(() => setRecs([]))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  if (loading || !recs.length) return null

  function handleAdd(rec: Recommendation) {
    const p = rec.related_product
    addItem({
      product_id: p.id,
      slug: p.slug,
      name: p.name,
      sku: p.sku,
      category: p.category,
      brand: p.brand,
      unit_price: p.price,
      image_url: p.images?.[0] ?? null,
    } as Omit<CartItem, 'quantity'>)
  }

  return (
    <div className="border-t border-border px-4 pt-3 pb-2">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0" />
        <p className="text-xs font-semibold text-foreground">Don&apos;t forget these</p>
      </div>
      <ul className="space-y-2">
        {recs.map(rec => {
          const p = rec.related_product
          const cat = p.category ?? 'other'
          return (
            <li key={rec.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
              <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                {p.images?.[0]
                  ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain p-0.5 rounded" />
                  : categoryIcon[cat] ?? categoryIcon.other}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-warning font-semibold uppercase tracking-wide">
                  {relationLabel[rec.relationship_type] ?? 'Required'}
                </p>
                <p className="text-xs font-medium leading-snug line-clamp-1">{p.name}</p>
                {rec.reason && (
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{rec.reason}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-primary">{formatCurrency(p.price)}</p>
                <button
                  onClick={() => handleAdd(rec)}
                  className="text-[10px] text-accent hover:underline font-medium"
                >
                  Add
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
