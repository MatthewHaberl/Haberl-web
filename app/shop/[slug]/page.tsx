import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { CartButton } from '../components/CartButton'
import { CartSidebar } from '../components/CartSidebar'
import { AddToCartButton } from './AddToCartButton'
import { ProductTabs } from './ProductTabs'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Zap, Battery, Sun, Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Metadata } from 'next'
import type { Product, EquipmentCatalogItem } from '@/types/database'

const categoryLabel: Record<string, string> = {
  inverter: 'Inverters',
  battery:  'Batteries',
  panel:    'Solar Panels',
  other:    'Components',
}

const categoryIcon: Record<string, React.ReactNode> = {
  inverter: <Zap className="h-16 w-16 text-accent/30" />,
  battery:  <Battery className="h-16 w-16 text-accent/30" />,
  panel:    <Sun className="h-16 w-16 text-accent/30" />,
  other:    <Package className="h-16 w-16 text-accent/30" />,
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('name, description')
    .eq('slug', slug)
    .single()
  return {
    title: data?.name ?? 'Product',
    description: data?.description ?? undefined,
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rawProduct } = await supabase
    .from('products')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (!rawProduct) notFound()
  const product = rawProduct as Product

  // Fetch catalog item for extra specs + datasheet
  let catalogItem: EquipmentCatalogItem | null = null
  if (product.external_id) {
    const { data } = await supabase
      .from('equipment_catalog')
      .select('*')
      .eq('id', product.external_id)
      .single()
    catalogItem = data ?? null
  }

  const cat = product.category ?? 'other'

  return (
    <>
      <Navbar isLoggedIn={!!user} />

      <main className="flex-1 bg-muted/30 min-h-screen">
        {/* Breadcrumb */}
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
            <Link href="/shop" className="hover:text-foreground transition-colors">Shop</Link>
            {product.category && (
              <>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                <Link
                  href={`/shop?category=${product.category}`}
                  className="hover:text-foreground transition-colors"
                >
                  {categoryLabel[product.category] ?? product.category}
                </Link>
              </>
            )}
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground font-medium line-clamp-1">{product.name}</span>
          </nav>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Product hero */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* Image panel */}
            <div className="bg-card border border-border rounded-2xl flex items-center justify-center h-72 lg:h-[420px] overflow-hidden">
              {product.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="h-full w-full object-contain p-10"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 opacity-25">
                  {categoryIcon[cat] ?? categoryIcon.other}
                  <span className="text-sm text-muted-foreground">{categoryLabel[cat] ?? 'Product'}</span>
                </div>
              )}
            </div>

            {/* Product info */}
            <div className="flex flex-col gap-5">
              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {product.brand && <Badge variant="outline">{product.brand}</Badge>}
                {product.category && (
                  <Badge variant="outline">{categoryLabel[product.category] ?? product.category}</Badge>
                )}
              </div>

              {/* Name + SKU */}
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-foreground leading-snug">{product.name}</h1>
                {product.sku && (
                  <p className="text-sm text-muted-foreground font-mono mt-1">SKU: {product.sku}</p>
                )}
              </div>

              {/* Spec pills */}
              {(product.watts_ac || product.watts_dc || product.kwh || catalogItem?.phase) && (
                <div className="flex flex-wrap gap-2">
                  {product.watts_ac && (
                    <span className="bg-primary/10 text-primary text-sm font-semibold px-3 py-1 rounded-full">
                      {(product.watts_ac / 1000).toFixed(1)} kW
                    </span>
                  )}
                  {product.watts_dc && !product.watts_ac && (
                    <span className="bg-primary/10 text-primary text-sm font-semibold px-3 py-1 rounded-full">
                      {product.watts_dc} W
                    </span>
                  )}
                  {product.kwh && (
                    <span className="bg-primary/10 text-primary text-sm font-semibold px-3 py-1 rounded-full">
                      {product.kwh} kWh
                    </span>
                  )}
                  {catalogItem?.phase && catalogItem.phase !== 'any' && (
                    <span className="bg-muted text-muted-foreground text-sm px-3 py-1 rounded-full capitalize">
                      {catalogItem.phase}-phase
                    </span>
                  )}
                </div>
              )}

              {/* Price */}
              <div className="flex items-baseline gap-3">
                <p className="text-3xl font-bold text-primary">{formatCurrency(product.price)}</p>
                {product.compare_price && product.compare_price > product.price && (
                  <p className="text-lg text-muted-foreground line-through">{formatCurrency(product.compare_price)}</p>
                )}
              </div>

              {/* Stock status */}
              <p className={`text-sm font-medium ${product.stock_qty > 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {product.stock_qty > 0 ? `In stock` : 'Out of stock — contact us'}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-3 flex-wrap">
                <AddToCartButton product={product} disabled={product.stock_qty === 0} />
                <CartButton />
              </div>

              {/* Delivery note */}
              <p className="text-xs text-muted-foreground">
                Delivery available nationwide · WhatsApp{' '}
                <a href="https://wa.me/27000000000" className="text-accent hover:underline">
                  for a quote
                </a>
              </p>
            </div>
          </div>

          {/* Tabs: Overview | Specifications | Downloads */}
          <div className="mt-10 bg-card border border-border rounded-2xl overflow-hidden">
            <ProductTabs product={product} catalogItem={catalogItem} />
          </div>
        </div>
      </main>

      <CartSidebar />
    </>
  )
}
