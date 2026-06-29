import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Image as ImageIcon } from 'lucide-react'
import { ProductImageManager } from './ProductImageManager'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'
import type { ProductImage } from '@/types/database'

export const metadata: Metadata = { title: 'Product Images' }

export default async function ProductImagesPage() {
  await requireSection('shop')
  const supabase = await createClient()

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
    <PageShell width="wide">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
      </Button>
      <PageHeader
        icon={ImageIcon}
        title="Product Images"
        description="Review product images · approve to show on product pages and the shop grid"
      />

      <ProductImageManager
        initialImages={allImages}
        products={products ?? []}
        counts={{ total: allImages.length, pending, published, rejected }}
      />
    </PageShell>
  )
}
