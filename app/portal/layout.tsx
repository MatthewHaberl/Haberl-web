import { redirect } from 'next/navigation'
import { PortalSidebar } from '@/components/layout/PortalSidebar'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { ReportIssueWidget } from '@/components/portal/ReportIssueWidget'
import { getUserAccess } from '@/lib/auth/permissions'
import { getFounderContext } from '@/lib/founders/access'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const access = await getUserAccess()
  if (!access) redirect('/auth/login')

  // Membership of the founders' workbook is its own permission — not a role and
  // not a matrix section — so the sidebar link is resolved separately.
  const founder = await getFounderContext()

  const { role, realRole, viewingAs, name, sections } = access

  return (
    <ConfirmProvider>
      <div className="flex min-h-screen">
        <PortalSidebar
          role={role}
          realRole={realRole}
          viewingAs={viewingAs}
          name={name}
          allowedSections={[...sections]}
          isFounder={!!founder}
        />
        {/* min-w-0: without it the main column is sized by its widest child
            rather than by the screen, and one over-wide table drags every page
            on the site off the right edge of a phone. */}
        <main className="min-w-0 flex-1 overflow-auto md:ml-0 pt-14 md:pt-0">
          <div className="p-3 sm:p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
      <ReportIssueWidget />
    </ConfirmProvider>
  )
}
