import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { BrandAccountManager, type BrandAccount } from '@/components/monitoring/BrandAccountManager'
import type { MonitoringBrand } from '@/lib/monitoring/types'
import { PageShell, PageHeader } from '@/components/layout/page'

export const metadata: Metadata = { title: 'Monitoring — Brand connections' }

export default async function BrandConnectionsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  // Saved connections (never select credentials) + a usage tally per account.
  const { data: accountsRaw } = await supabase
    .from('monitoring_brand_accounts')
    .select('id, brand, name')
    .order('brand')
    .order('name')

  const { data: links } = await supabase
    .from('monitoring_systems')
    .select('brand_account_id')

  const usage = new Map<string, number>()
  for (const row of (links ?? []) as { brand_account_id: string | null }[]) {
    if (row.brand_account_id) usage.set(row.brand_account_id, (usage.get(row.brand_account_id) ?? 0) + 1)
  }

  const accounts: BrandAccount[] = ((accountsRaw ?? []) as { id: string; brand: string; name: string }[]).map((a) => ({
    id: a.id,
    brand: a.brand as MonitoringBrand,
    name: a.name,
    usage: usage.get(a.id) ?? 0,
  }))

  return (
    <PageShell width="form">
      <div>
        <Link
          href="/portal/employee/monitoring"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to fleet
        </Link>
        <PageHeader
          icon={KeyRound}
          title="Brand connections"
          description="Save each brand's API key once, then reuse it across every site of that brand. When connecting a site you'll only need its Plant/Station ID or serial number."
        />
      </div>
      <BrandAccountManager accounts={accounts} />
    </PageShell>
  )
}
