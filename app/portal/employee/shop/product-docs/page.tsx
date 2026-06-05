import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { ProductDocManager } from './ProductDocManager'
import type { Metadata } from 'next'
import type { ProductDocument } from '@/types/database'

export const metadata: Metadata = { title: 'Product Documents' }

export default async function ProductDocsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal/employee')

  const { data: docs } = await supabase
    .from('product_documents')
    .select('*')
    .order('brand')
    .order('product_family')
    .order('doc_type')

  const { data: products } = await supabase
    .from('products')
    .select('id, name, brand, slug')
    .order('brand')
    .order('name')

  const allDocs = (docs ?? []) as ProductDocument[]
  const pending  = allDocs.filter(d => d.status === 'pending_review').length
  const published = allDocs.filter(d => d.status === 'published').length
  const rejected  = allDocs.filter(d => d.status === 'rejected').length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-primary">Product Documents</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Review manuals, datasheets, drawings and certifications · approve to publish on product pages
          </p>
        </div>
      </div>

      <ProductDocManager
        initialDocs={allDocs}
        products={products ?? []}
        counts={{ total: allDocs.length, pending, published, rejected }}
      />
    </div>
  )
}
