import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, Activity } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { AddSystemForm, type SiteOption, type BrandAccountOption } from '@/components/monitoring/AddSystemForm'
import type { MonitoringBrand } from '@/lib/monitoring/types'
import { PageShell, PageHeader } from '@/components/layout/page'

export const metadata: Metadata = { title: 'Add monitoring system' }

type SiteRow = {
  id: string
  name: string | null
  customer: { full_name: string | null } | { full_name: string | null }[] | null
}

export default async function NewMonitoringSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  const { siteId } = await searchParams
  await requireSection('monitoring')
  const supabase = await createClient()

  const { data: sitesRaw } = await supabase
    .from('sites')
    .select('id, name, customer:customers ( full_name )')
    .order('name')

  const sites: SiteOption[] = ((sitesRaw ?? []) as unknown as SiteRow[]).map((s) => {
    const c = Array.isArray(s.customer) ? s.customer[0] : s.customer
    return { id: s.id, name: s.name ?? 'Unnamed site', customer_name: c?.full_name ?? null }
  })

  const { data: accountsRaw } = await supabase
    .from('monitoring_brand_accounts')
    .select('id, brand, name')
    .order('name')

  const accounts: BrandAccountOption[] = ((accountsRaw ?? []) as { id: string; brand: string; name: string }[])
    .map((a) => ({ id: a.id, brand: a.brand as MonitoringBrand, name: a.name }))

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
          icon={Activity}
          title="Add a monitoring system"
          description="Connect an installed inverter to its manufacturer's cloud so its live data flows into the portal."
        />
      </div>
      <AddSystemForm sites={sites} initialSiteId={siteId} accounts={accounts} />
    </PageShell>
  )
}
