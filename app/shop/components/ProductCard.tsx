'use client'

import { ShoppingCart, Zap, Battery, Sun, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { useCart } from '@/lib/store/cart-context'
import type { Product } from '@/types/database'

const categoryIcon: Record<string, React.ReactNode> = {
  inverter: <Zap className="h-8 w-8 text-accent/60" />,
  battery:  <Battery className="h-8 w-8 text-accent/60" />,
  panel:    <Sun className="h-8 w-8 text-accent/60" />,
  other:    <Package className="h-8 w-8 text-accent/60" />,
}

const categoryLabel: Record<string, string> = {
  inverter: 'Inverter',
  battery:  'Battery',
  panel:    'Solar Panel',
  other:    'Component',
}

function productSpec(p: Product): string | null {
  if (p.watts_ac) return `${(p.watts_ac / 1000).toFixed(1)} kW`
  if (p.watts_dc) return `${p.watts_dc} W`
  if (p.kwh) return `${p.kwh} kWh`
  return null
}

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart()
  const cat = product.category ?? 'other'
  const spec = productSpec(product)

  function handleAdd() {
    addItem({
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      sku: product.sku,
      category: product.category,
      brand: product.brand ?? null,
      unit_price: product.price,
      image_url: product.images?.[0] ?? null,
    })
  }

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      {/* Image / placeholder */}
      <div className="bg-muted flex items-center justify-center h-40 relative">
        {product.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0]} alt={product.name} className="h-full w-full object-contain p-4" />
        ) : (
          <div className="flex flex-col items-center gap-2 opacity-40">
            {categoryIcon[cat] ?? categoryIcon.other}
            <span className="text-xs text-muted-foreground">{categoryLabel[cat] ?? 'Product'}</span>
          </div>
        )}
        {spec && (
          <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
            {spec}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-xs text-muted-foreground font-mono">{product.sku ?? '—'}</p>
            {product.brand && (
              <Badge variant="outline" className="text-[10px] shrink-0">{product.brand}</Badge>
            )}
          </div>
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{product.name}</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-lg font-bold text-primary">{formatCurrency(product.price)}</p>
            {product.compare_price && product.compare_price > product.price && (
              <p className="text-xs text-muted-foreground line-through">{formatCurrency(product.compare_price)}</p>
            )}
          </div>
          <Button size="sm" variant="accent" onClick={handleAdd} className="shrink-0">
            <ShoppingCart className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
