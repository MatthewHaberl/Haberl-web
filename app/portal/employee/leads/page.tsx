import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PhoneIncoming, PhoneCall, CheckCircle2 } from 'lucide-react'
import type { Lead } from '@/types/database'
import { LeadCard } from './LeadCard'
import { AddLeadDialog } from './AddLeadDialog'

export const dynamic = 'force-dynamic'

/**
 * Leads inbox — "who do I need to contact". Website enquiries land here as soon
 * as someone fills the form at /quote-request. New leads are the call-now list;
 * contacted-not-converted are the follow-ups. Converted/discarded are kept as a
 * tally so the list stays focused on people who still need a call.
 */
export default async function LeadsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    redirect('/portal/employee')
  }

  const { data: leadRows } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  const leads = (leadRows ?? []) as Lead[]

  const newLeads = leads.filter((l) => l.status === 'new')
  const contacted = leads.filter((l) => l.status === 'contacted')
  const convertedCount = leads.filter((l) => l.status === 'converted').length
  const discardedCount = leads.filter((l) => l.status === 'discarded').length
  const toContact = newLeads.length + contacted.length

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PhoneIncoming className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-primary">Leads</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {toContact > 0
              ? `${toContact} ${toContact === 1 ? 'person' : 'people'} to contact`
              : 'No one waiting on a call right now'}
          </p>
        </div>
      </div>

      <AddLeadDialog />

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
                  <LeadCard key={lead.id} lead={lead} />
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
                  <LeadCard key={lead.id} lead={lead} />
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
    </div>
  )
}
