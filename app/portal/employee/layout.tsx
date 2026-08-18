import { redirect } from 'next/navigation'
import { getUserAccess } from '@/lib/auth/permissions'

const EMPLOYEE_ROLES = new Set(['field_worker', 'manager', 'admin'])

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const access = await getUserAccess()
  if (!access) redirect('/auth/login')

  // Effective role, so previewing the portal as a customer really does land you
  // in the customer portal rather than just re-labelling the sidebar.
  if (!EMPLOYEE_ROLES.has(access.role)) redirect('/portal/customer')

  return children
}
