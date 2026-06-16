import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import { SolarCoverageTester } from './SolarCoverageTester'

export default async function SolarCoveragePage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    redirect('/portal/employee')
  }

  return <SolarCoverageTester />
}
