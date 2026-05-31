import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'

export default async function EmployeePortalRoot() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'field_worker'
  if (role === 'customer') redirect('/portal/customer')

  redirect('/portal/employee/jobs')
}
