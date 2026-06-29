import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Tag } from 'lucide-react'
import { PriceListEditor } from './PriceListEditor'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Price Lists — Shop' }

export default async function PriceListsPage() {
  await requireSection('shop')
  const supabase = await createClient()

  const [{ data: priceLists }, { data: customers }] = await Promise.all([
    supabase.from('price_lists').select(`
      id, name, description, markup_percent, discount_percent, active, created_at,
      customer_price_lists(id, customer_id, active, customer:user_profiles(id, full_name, email))
    `).order('created_at'),
    supabase.from('user_profiles').select('id, full_name, email').eq('role', 'customer').order('full_name'),
  ])

  return (
    <PageShell width="wide">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
      </Button>
      <PageHeader
        icon={Tag}
        title="Price Lists"
        description="Create pricing tiers and assign customers to them"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How pricing works</CardTitle>
          <CardDescription>
            All products start at <strong>30% markup</strong> on cost. Price lists let you give specific customers a discount on top of that.
            Formula: <code className="bg-muted px-1 rounded text-xs">Final price = Cost × (1 + markup%) × (1 − discount%)</code>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Server-rendered list + client editor */}
      <PriceListEditor
        priceLists={(priceLists ?? []) as Parameters<typeof PriceListEditor>[0]['priceLists']}
        customers={(customers ?? []) as Parameters<typeof PriceListEditor>[0]['customers']}
      />
    </PageShell>
  )
}
