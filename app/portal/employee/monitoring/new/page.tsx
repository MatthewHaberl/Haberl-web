import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { AddSystemForm, type SiteOption } from '@/components/monitoring/AddSystemForm'

export const metadata: Metadata = { title: 'Add monitoring system' }

type SiteRow = {
  id: string
  name: string | null
  customer: { full_name: string | null } | { full_name: string | null }[] | null
}

export default async function NewMonitoringSystemPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  const { data: sitesRaw } = await supabase
    .from('sites')
    .select('id, name, customer:user_profiles ( full_name )')
    .order('name')

  const sites: SiteOption[] = ((sitesRaw ?? []) as unknown as SiteRow[]).map((s) => {
    const c = Array.isArray(s.customer) ? s.customer[0] : s.customer
    return { id: s.id, name: s.name ?? 'Unnamed site', customer_name: c?.full_name ?? null }
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/employee/monitoring"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to fleet
        </Link>
        <h1 className="text-2xl font-bold">Add a monitoring system</h1>
        <p className="text-sm text-muted-foreground">
          Connect an installed inverter to its manufacturer&apos;s cloud so its live data flows into the portal.
        </p>
      </div>
      <AddSystemForm sites={sites} />
    </div>
  )
}
