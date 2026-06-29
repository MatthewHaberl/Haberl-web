import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { normalizePhone } from '@/lib/customers/phone'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PhoneIncoming, PhoneCall, CheckCircle2 } from 'lucide-react'
import type { Lead } from '@/types/database'
import { LeadCard } from './LeadCard'
import { AddLeadDialog } from './AddLeadDialog'
import { PageShell, PageHeader } from '@/components/layout/page'

export const dynamic = 'force-dynamic'

/**
 * Leads inbox — "who do I need to contact". Website enquiries land here as soon
 * as someone fills the form at /quote-request. New leads are the call-now list;
 * contacted-not-converted are the follow-ups. Converted/discarded are kept as a
 * tally so the list stays focused on people who still need a call.
 */
export default async function LeadsPage() {
  await requireSection('leads')
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
  const matchedCustomer = (lead: Lead) => {
    const key = normalizePhone(lead.phone)
    return key ? customersByPhone.get(key) ?? null : null
  }

  const newLeads = leads.filter((l) => l.status === 'new')
  const contacted = leads.filter((l) => l.status === 'contacted')
  const convertedCount = leads.filter((l) => l.status === 'converted').length
  const discardedCount = leads.filter((l) => l.status === 'discarded').length
  const toContact = newLeads.length + contacted.length

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
        <>
          {newLeads.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <PhoneIncoming className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  New — call these ({newLeads.length})
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {newLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} customer={matchedCustomer(lead)} />
                ))}
              </div>
            </div>
          )}

          {contacted.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <PhoneCall className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Contacted — follow up ({contacted.length})
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {contacted.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} customer={matchedCustomer(lead)} />
                ))}
              </div>
            </div>
          )}
        </>
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
