import { redirect } from 'next/navigation'
import { getUserAccess } from '@/lib/auth/permissions'

// Redirect to the correct dashboard based on role (the previewed one, if any)
export default async function PortalPage() {
  const access = await getUserAccess()
  if (!access) redirect('/auth/login')

  if (access.role === 'customer') redirect('/portal/customer')
  redirect('/portal/employee')
}
