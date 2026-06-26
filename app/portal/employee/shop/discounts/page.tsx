import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Percent } from 'lucide-react'
import { DiscountCodeManager } from './DiscountCodeManager'
import { PageShell, PageHeader } from '@/components/layout/page'
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
    <PageShell width="content">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
      </Button>
      <PageHeader
        icon={Percent}
        title="Discount Codes"
        description="Percentage or fixed-amount codes for customers"
      />
      <DiscountCodeManager codes={(codes ?? []) as Parameters<typeof DiscountCodeManager>[0]['codes']} />
    </PageShell>
  )
}
