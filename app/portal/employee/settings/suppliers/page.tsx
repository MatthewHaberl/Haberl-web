import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Supplier } from '@/types/database'
import { Truck } from 'lucide-react'
import { SuppliersEditor } from './SuppliersEditor'
import { PageShell, PageHeader } from '@/components/layout/page'

export default async function SuppliersPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    redirect('/portal/employee')
  }

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*')
    .order('active', { ascending: false })
    .order('name')

  return (
    <PageShell width="form">
      <PageHeader
        icon={Truck}
        title="Suppliers"
        description="Who you order from. Purchase orders pick from this list — add an email to send POs directly from the platform."
      />
      <SuppliersEditor initialSuppliers={(suppliers ?? []) as Supplier[]} />
    </PageShell>
  )
}
