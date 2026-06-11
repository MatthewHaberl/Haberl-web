import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'

const EMPLOYEE_ROLES = new Set(['field_worker', 'manager', 'admin'])

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'customer'
  if (!EMPLOYEE_ROLES.has(role)) redirect('/portal/customer')

  return children
}
