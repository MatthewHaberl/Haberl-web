import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { RelationshipManager } from './RelationshipManager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Product Relationships — Shop' }

export default async function RelationshipsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal/employee')

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-primary">Product Relationships</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            "Products that go with this" — shown in cart when related items are added
          </p>
        </div>
      </div>
      <RelationshipManager
        relationships={(relationships ?? []) as Parameters<typeof RelationshipManager>[0]['relationships']}
        products={(products ?? []) as Parameters<typeof RelationshipManager>[0]['products']}
      />
    </div>
  )
}
