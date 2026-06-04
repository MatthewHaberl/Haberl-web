import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { DiscountCodeManager } from './DiscountCodeManager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Discount Codes — Shop' }

export default async function DiscountsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal/employee')

  const { data: codes } = await supabase
    .from('discount_codes')
    .select('id, code, discount_type, discount_value, description, max_uses, uses_count, min_order_amount_cents, active, valid_from, valid_until, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-primary">Discount Codes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Percentage or fixed-amount codes for customers</p>
        </div>
      </div>
      <DiscountCodeManager codes={(codes ?? []) as Parameters<typeof DiscountCodeManager>[0]['codes']} />
    </div>
  )
}
