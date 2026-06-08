import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { ProductImageManager } from './ProductImageManager'
import type { Metadata } from 'next'
import type { ProductImage } from '@/types/database'

export const metadata: Metadata = { title: 'Product Images' }

export default async function ProductImagesPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal/employee')

  const { data: images } = await supabase
    .from('product_images')
    .select('*')
    .order('brand')
    .order('product_family')
    .order('sort_order')

  const { data: products } = await supabase
    .from('products')
    .select('id, name, brand, slug')
    .order('brand')
    .order('name')

  const allImages = (images ?? []) as ProductImage[]
  const pending   = allImages.filter(i => i.status === 'pending_review').length
  const published = allImages.filter(i => i.status === 'published').length
  const rejected  = allImages.filter(i => i.status === 'rejected').length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-primary">Product Images</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Review product images · approve to show on product pages and the shop grid
          </p>
        </div>
      </div>

      <ProductImageManager
        initialImages={allImages}
        products={products ?? []}
        counts={{ total: allImages.length, pending, published, rejected }}
      />
    </div>
  )
}
