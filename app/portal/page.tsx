import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Redirect to the correct dashboard based on role
export default async function PortalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'customer'

  if (role === 'customer') redirect('/portal/customer')
  redirect('/portal/employee')
}
