import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { ShippingManager } from './ShippingManager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Shipping — Shop' }

export default async function ShippingPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal/employee')

  const { data: zones } = await supabase
    .from('shipping_zones')
    .select('id, name, description, base_fee_cents, per_kg_rate_cents, max_weight_kg, active')
    .order('name')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-primary">Shipping Zones</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Weight-based delivery rates by region</p>
        </div>
      </div>
      <ShippingManager zones={(zones ?? []) as Parameters<typeof ShippingManager>[0]['zones']} />
    </div>
  )
}
