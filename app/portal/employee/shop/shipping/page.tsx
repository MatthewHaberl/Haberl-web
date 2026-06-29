import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Truck } from 'lucide-react'
import { ShippingManager } from './ShippingManager'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Shipping — Shop' }

export default async function ShippingPage() {
  await requireSection('shop')
  const supabase = await createClient()

  const { data: zones } = await supabase
    .from('shipping_zones')
    .select('id, name, description, base_fee_cents, per_kg_rate_cents, max_weight_kg, active')
    .order('name')

  return (
    <PageShell width="content">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
      </Button>
      <PageHeader
        icon={Truck}
        title="Shipping Zones"
        description="Weight-based delivery rates by region"
      />
      <ShippingManager zones={(zones ?? []) as Parameters<typeof ShippingManager>[0]['zones']} />
    </PageShell>
  )
}
