import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { normalizePhone } from '@/lib/customers/phone'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PhoneIncoming, CheckCircle2 } from 'lucide-react'
import type { Lead } from '@/types/database'
import { AddLeadDialog } from './AddLeadDialog'
import { LeadsInbox } from './LeadsInbox'
import type { LeadCardData, StaffMember } from './LeadCard'
import { PageShell, PageHeader } from '@/components/layout/page'

export const dynamic = 'force-dynamic'

/**
 * Leads inbox — "who do I need to contact". Website enquiries land here as soon
 * as someone fills the form at /quote-request. Record-level visibility
 * (migration 071) means each viewer only receives the leads they own, the
 * unassigned pool (managers/admins), or leads shared to them — RLS does the
 * filtering, so this page just renders whatever it's allowed to read.
 */
export default async function LeadsPage() {
  const { user, role } = await requireSection('leads')
  const canManage = role === 'manager' || role === 'admin'
  const supabase = await createClient()

  const { data: leadRows } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  const leads = (leadRows ?? []) as Lead[]

  // Flag leads who are already customers (matched on canonical phone) so staff
  // call them as a known contact and aren't offered "Convert to customer".
  const { data: customerRows } = await supabase
    .from('customers')
    .select('id, full_name, phone_normalized')
  const customersByPhone = new Map<string, { id: string; full_name: string }>()
  for (const c of (customerRows ?? []) as { id: string; full_name: string; phone_normalized: string | null }[]) {
    if (c.phone_normalized && !customersByPhone.has(c.phone_normalized)) {
      customersByPhone.set(c.phone_normalized, { id: c.id, full_name: c.full_name })
    }
  }
  const phoneMatch = (lead: Lead) => {
    const key = normalizePhone(lead.phone)
    return key ? customersByPhone.get(key) ?? null : null
  }

  // Staff directory powers the owner picker + owner/share name labels. Only
  // managers/admins can read other profiles (RLS); restricted users get just
  // their own row, which is all the picker (hidden for them) would need anyway.
  const { data: staffRows } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .in('role', ['field_worker', 'manager', 'admin'])
    .order('full_name')
  const staff: StaffMember[] = (staffRows ?? []).map((s) => ({
    id: s.id as string,
    full_name: (s.full_name as string) || 'Unnamed',
  }))
  const nameById = new Map(staff.map((s) => [s.id, s.full_name]))

  // Share grants for the visible leads, grouped per lead.
  const { data: grantRows } = await supabase
    .from('record_grants')
    .select('record_id, user_id')
    .eq('section', 'leads')
  const sharesByLead = new Map<string, StaffMember[]>()
  for (const g of (grantRows ?? []) as { record_id: string; user_id: string }[]) {
    const list = sharesByLead.get(g.record_id) ?? []
    list.push({ id: g.user_id, full_name: nameById.get(g.user_id) ?? 'Someone' })
    sharesByLead.set(g.record_id, list)
  }

  const actionable = leads.filter((l) => l.status === 'new' || l.status === 'contacted')
  const cards: LeadCardData[] = actionable.map((lead) => {
    const match = phoneMatch(lead)
    // Staff can mark a phone match as wrong (two people sharing a number) — when
    // they have, drop it from `customer` so the lead behaves normally, but keep
    // it as `dismissedCustomer` so the card can offer an Undo.
    const dismissed = !!match && lead.not_duplicate_customer_id === match.id
    return {
      lead,
      customer: dismissed ? null : match,
      dismissedCustomer: dismissed ? match : null,
      ownerName: lead.owner_id ? nameById.get(lead.owner_id) ?? 'Assigned' : null,
      sharedWith: sharesByLead.get(lead.id) ?? [],
    }
  })

  const convertedCount = leads.filter((l) => l.status === 'converted').length
  const discardedCount = leads.filter((l) => l.status === 'discarded').length
  const toContact = actionable.length

  return (
    <PageShell width="content">
      <PageHeader
        icon={PhoneIncoming}
        title="Leads"
        description={
          toContact > 0
            ? `${toContact} ${toContact === 1 ? 'person' : 'people'} to contact`
            : 'No one waiting on a call right now'
        }
        actions={<AddLeadDialog />}
      />

      {toContact === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
            <p className="font-medium">All caught up</p>
            <p className="text-muted-foreground text-sm mt-1">
              New website enquiries from <Link href="/quote-request" className="text-accent underline">your quote form</Link> will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <LeadsInbox
          cards={cards}
          staff={staff}
          currentUserId={user.id}
          canManage={canManage}
        />
      )}

      {(convertedCount > 0 || discardedCount > 0) && (
        <p className="text-xs text-muted-foreground">
          {convertedCount > 0 && (
            <>
              <Badge variant="success" className="mr-1">{convertedCount}</Badge>
              converted to a quote
            </>
          )}
          {convertedCount > 0 && discardedCount > 0 && <span className="mx-2">·</span>}
          {discardedCount > 0 && <>{discardedCount} discarded</>}
        </p>
      )}
    </PageShell>
  )
}
