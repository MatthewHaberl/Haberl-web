import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BarChart2 } from 'lucide-react'
import { RelationshipManager } from './RelationshipManager'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Product Relationships — Shop' }

export default async function RelationshipsPage() {
  await requireSection('shop')
  const supabase = await createClient()

  const [{ data: relationships }, { data: products }] = await Promise.all([
    supabase
      .from('product_relationships')
      .select(`
        id, relationship_type, reason, active, priority,
        product:products!product_relationships_product_id_fkey(id, name, sku, category, brand),
        related:products!product_relationships_related_product_id_fkey(id, name, sku, category, brand)
      `)
      .order('relationship_type')
      .order('priority', { ascending: false }),
    supabase
      .from('products')
      .select('id, name, sku, category, brand')
      .eq('active', true)
      .order('category')
      .order('name'),
  ])

  return (
    <PageShell width="content">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
      </Button>
      <PageHeader
        icon={BarChart2}
        title="Product Relationships"
        description={'"Products that go with this" — shown in cart when related items are added'}
      />
      <RelationshipManager
        relationships={(relationships ?? []) as Parameters<typeof RelationshipManager>[0]['relationships']}
        products={(products ?? []) as Parameters<typeof RelationshipManager>[0]['products']}
      />
    </PageShell>
  )
}
