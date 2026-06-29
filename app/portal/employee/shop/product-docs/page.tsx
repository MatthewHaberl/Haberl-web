import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileText } from 'lucide-react'
import { ProductDocManager } from './ProductDocManager'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'
import type { ProductDocument } from '@/types/database'

export const metadata: Metadata = { title: 'Product Documents' }

export default async function ProductDocsPage() {
  await requireSection('shop')
  const supabase = await createClient()

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
    <PageShell width="wide">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
      </Button>
      <PageHeader
        icon={FileText}
        title="Product Documents"
        description="Review manuals, datasheets, drawings and certifications · approve to publish on product pages"
      />

      <ProductDocManager
        initialDocs={allDocs}
        products={products ?? []}
        counts={{ total: allDocs.length, pending, published, rejected }}
      />
    </PageShell>
  )
}
