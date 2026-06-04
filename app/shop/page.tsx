import { Navbar } from '@/components/layout/Navbar'
import { createClient } from '@/lib/supabase/server'
import { ProductGrid } from './components/ProductGrid'
import { CartSidebar } from './components/CartSidebar'
import { CartButton } from './components/CartButton'
import type { Metadata } from 'next'
import type { Product } from '@/types/database'

export const metadata: Metadata = { title: 'Shop' }

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; brand?: string }>
}) {
  const { category, brand } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .not('external_id', 'is', null)
    .order('category')
    .order('brand')

  return (
    <>
      <Navbar isLoggedIn={!!user} />

      <main className="flex-1 bg-muted/30 min-h-screen">
        {/* Shop header */}
        <div className="bg-primary text-primary-foreground py-10 px-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Solar & Electrical Shop</h1>
              <p className="text-primary-foreground/70 mt-1">
                {products?.length ?? 0} products · Inverters, batteries, panels & components
              </p>
            </div>
            <CartButton />
          </div>
        </div>

        {/* Product grid with sidebar */}
        <div className="max-w-6xl mx-auto px-4 py-8">
          <ProductGrid
            products={(products ?? []) as Product[]}
            initialCategory={category ?? ''}
            initialBrand={brand ?? ''}
          />
        </div>
      </main>

      <CartSidebar />
    </>
  )
}
