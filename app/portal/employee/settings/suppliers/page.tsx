import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Supplier } from '@/types/database'
import { SuppliersEditor } from './SuppliersEditor'

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
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">Suppliers</h1>
        <p className="text-muted-foreground mt-1">
          Who you order from. Purchase orders pick from this list — add an email to send POs
          directly from the platform.
        </p>
      </div>
      <SuppliersEditor initialSuppliers={(suppliers ?? []) as Supplier[]} />
    </div>
  )
}
