import { requireSection } from '@/lib/auth/permissions'
import { PageShell } from '@/components/layout/page'
import { SansTabs } from '@/components/sans/SansTabs'

export default async function SansLayout({ children }: { children: React.ReactNode }) {
  await requireSection('sans')
  return (
    <PageShell width="content">
      <SansTabs />
      {children}
    </PageShell>
  )
}
