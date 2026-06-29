import { Ticket } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { PortalTicket } from '@/types/database'
import { TicketsList } from './TicketsList'

export const dynamic = 'force-dynamic'

export default async function TicketsPage() {
  // Gated by the data-driven permissions matrix (admin-only by default;
  // grantable to managers/field workers on the Users → Permissions page).
  await requireSection('tickets')

  // RLS-locked table — read with the service-role client (access already
  // gated by requireSection above).
  const admin = createAdminClient()
  const { data: tickets } = await admin
    .from('portal_tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <PageShell width="wide">
      <PageHeader
        icon={Ticket}
        title="Tickets"
        description="Issues, suggestions, and questions submitted from the in-portal “Report an issue” widget. The team is emailed on each new ticket."
      />
      <TicketsList initial={(tickets ?? []) as PortalTicket[]} />
    </PageShell>
  )
}
