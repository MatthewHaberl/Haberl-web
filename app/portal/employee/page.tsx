import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function EmployeePortalRoot() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'field_worker'
  if (role === 'customer') redirect('/portal/customer')

  redirect('/portal/employee/jobs')
}
