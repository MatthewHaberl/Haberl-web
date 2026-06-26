import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Activity } from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { AddSystemForm, type SiteOption, type ExistingSystem, type BrandAccountOption } from '@/components/monitoring/AddSystemForm'
import type { MonitoringBrand } from '@/lib/monitoring/types'
import { PageShell, PageHeader } from '@/components/layout/page'

export const metadata: Metadata = { title: 'Edit monitoring system' }

type SiteRow = {
  id: string
  name: string | null
  customer: { full_name: string | null } | { full_name: string | null }[] | null
}

export default async function EditMonitoringSystemPage({ params }: { params: { systemId: string } }) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  // Load the system being edited. Credentials are deliberately NOT selected —
  // they are never sent to the client; the form keeps them blank and the API
  // merges any re-entered values onto the stored secret.
  const { data: system } = await supabase
    .from('monitoring_systems')
    .select('id, site_id, brand, label, plant_id, device_sn, capacity_kw, battery_kwh, brand_account_id')
    .eq('id', params.systemId)
    .single()

  if (!system) notFound()

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

  const existing: ExistingSystem = {
    id: system.id,
    site_id: system.site_id,
    brand: system.brand as MonitoringBrand,
    label: system.label,
    capacity_kw: system.capacity_kw,
    battery_kwh: system.battery_kwh,
    plant_id: system.plant_id,
    device_sn: system.device_sn,
    brand_account_id: system.brand_account_id,
  }

  return (
    <PageShell width="form">
      <div>
        <Link
          href={`/portal/employee/monitoring/${system.id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to system
        </Link>
        <PageHeader
          icon={Activity}
          title="Edit monitoring system"
          description="Fix a wrong Plant/Station ID, serial number, or API key, then test the connection before saving."
        />
      </div>
      <AddSystemForm sites={sites} existing={existing} accounts={accounts} />
    </PageShell>
  )
}
