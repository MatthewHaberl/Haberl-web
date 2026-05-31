import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import { PortalSidebar } from '@/components/layout/PortalSidebar'
import type { Role } from '@/types/database'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'customer') as Role
  const name = profile?.full_name ?? user.email ?? 'User'

  return (
    <div className="flex min-h-screen">
      <PortalSidebar role={role} name={name} />
      <main className="flex-1 overflow-auto md:ml-0 pt-14 md:pt-0">
        <div className="p-6 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
