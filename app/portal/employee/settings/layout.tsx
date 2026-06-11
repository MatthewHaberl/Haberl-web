import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'

export default async function EmployeeSettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/portal/employee')

  return children
}
