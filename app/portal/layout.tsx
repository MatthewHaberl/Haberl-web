import { redirect } from 'next/navigation'
import { PortalSidebar } from '@/components/layout/PortalSidebar'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { ReportIssueWidget } from '@/components/portal/ReportIssueWidget'
import { getUserAccess } from '@/lib/auth/permissions'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const access = await getUserAccess()
  if (!access) redirect('/auth/login')

  const { role, name, sections } = access

  return (
    <ConfirmProvider>
      <div className="flex min-h-screen">
        <PortalSidebar role={role} name={name} allowedSections={[...sections]} />
        <main className="flex-1 overflow-auto md:ml-0 pt-14 md:pt-0">
          <div className="p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
      <ReportIssueWidget />
    </ConfirmProvider>
  )
}
