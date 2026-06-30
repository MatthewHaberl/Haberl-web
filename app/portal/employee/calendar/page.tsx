import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { loadCalendarItems } from '@/lib/calendar/events'
import { PageShell, PageHeader } from '@/components/layout/page'
import { CalendarDays } from 'lucide-react'
import { CalendarView } from './CalendarView'
import type { LinkTarget } from './EventDialog'

export const dynamic = 'force-dynamic'

/** YYYY-MM for a Date. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Team scheduling calendar. Overlays the appointments layer (calendar_events)
 * with installations (jobs.scheduled_date), filterable per field worker. RLS
 * scopes rows per viewer, so field workers see only their own schedule.
 *
 * The server loads a 3-month window around the focused month; the client
 * navigates freely inside it and reloads (?month=) when it steps outside.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; leadId?: string; customerId?: string; new?: string }>
}) {
  const { role } = await requireSection('calendar')
  const isManager = role === 'manager' || role === 'admin'
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const sp = await searchParams

  // Focus month: ?month=YYYY-MM, else current.
  const now = new Date()
  let focus = now
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const [y, m] = sp.month.split('-').map(Number)
    focus = new Date(y, m - 1, 1)
  }
  const windowStart = new Date(focus.getFullYear(), focus.getMonth() - 1, 1)
  const windowEnd = new Date(focus.getFullYear(), focus.getMonth() + 2, 1)

  const items = await loadCalendarItems(
    supabase,
    windowStart.toISOString(),
    windowEnd.toISOString(),
  )

  // Staff directory for the worker filter + assignee picker (managers/admins
  // get everyone; restricted users only their own row via RLS, which is fine —
  // the filter is hidden for them).
  const { data: staffRows } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .in('role', ['field_worker', 'manager', 'admin'])
    .order('full_name')
  const staff = (staffRows ?? []).map((s) => ({
    id: s.id as string,
    full_name: (s.full_name as string) || 'Unnamed',
    role: s.role as string,
  }))

  // Link targets for the "New event" dialog (small-business sized lists).
  const { data: customerRows } = await supabase
    .from('customers')
    .select('id, full_name, email, phone, address')
    .is('archived_at', null)
    .order('full_name')
  const { data: leadRows } = await supabase
    .from('leads')
    .select('id, name, phone, suburb')
    .in('status', ['new', 'contacted'])
    .order('created_at', { ascending: false })

  const linkTargets: LinkTarget[] = [
    ...(customerRows ?? []).map((c) => ({
      kind: 'customer' as const,
      id: c.id as string,
      name: (c.full_name as string) || 'Unnamed',
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      address: (c.address as string | null) ?? null,
    })),
    ...(leadRows ?? []).map((l) => ({
      kind: 'lead' as const,
      id: l.id as string,
      name: (l.name as string) || 'Lead',
      email: null,
      phone: (l.phone as string | null) ?? null,
      // Leads have no full address — use the suburb as a location hint.
      address: (l.suburb as string | null) ?? null,
    })),
  ]

  const prefill = sp.new === '1' || sp.leadId || sp.customerId
    ? { leadId: sp.leadId ?? null, customerId: sp.customerId ?? null }
    : null

  return (
    <PageShell width="wide">
      <PageHeader
        icon={CalendarDays}
        title="Calendar"
        description={
          isManager
            ? 'Team schedule — meetings, inspections, installs, service & follow-ups'
            : 'Your schedule — visits and jobs assigned to you'
        }
      />
      <CalendarView
        items={items}
        staff={staff}
        linkTargets={linkTargets}
        currentUserId={user!.id}
        isManager={isManager}
        focusMonth={monthKey(focus)}
        windowStart={windowStart.toISOString()}
        windowEnd={windowEnd.toISOString()}
        prefill={prefill}
      />
    </PageShell>
  )
}
