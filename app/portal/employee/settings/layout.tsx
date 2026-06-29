import { requireSection } from '@/lib/auth/permissions'

export default async function EmployeeSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireSection('settings')
  return children
}
