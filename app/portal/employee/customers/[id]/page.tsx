import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, MapPin, FileText, Wrench, Clock, ChevronRight, Users, Trash2 } from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'
import { formatDate } from '@/lib/utils'
import { customerAccountStatus, type Customer } from '@/types/database'
import { getSharingContext } from '@/lib/records/sharing'
import { RecordShareControl } from '@/components/records/RecordShareControl'
import { CustomerPanel } from './CustomerPanel'
import { AddSiteProvider, AddSiteTrigger, AddSitePanel } from './AddSiteDialog'
import { SiteCard } from './SiteCard'
import { ArchiveCustomerButton } from './ArchiveCustomerButton'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Customer' }

function rand(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const STATUS_BADGE = {
  registered: { label: 'Registered', variant: 'success' as const },
  invited:    { label: 'Invited',    variant: 'accent' as const },
  prospect:   { label: 'Prospect',   variant: 'outline' as const },
}

type TimelineItem = { at: string; label: string }

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, role } = await requireSection('customers')
  const supabase = await createClient()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager' || role === 'admin'

  const { data: customerRow } = await supabase
    .from('customers').select('*').eq('id', id).maybeSingle()
  if (!customerRow) notFound()
  const customer = customerRow as Customer

  // Ownership/sharing (migration 072): staff directory + grants for this record.
  const { staff, nameById, sharedWith } = await getSharingContext(supabase, 'customers', id)
  const ownerName = customer.created_by ? nameById.get(customer.created_by) ?? 'Assigned' : null

  const { data: sites } = await supabase
    .from('sites')
    .select('id, name, address, status, system_size_kw, system_type, created_at')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  const { data: quotes } = await supabase
    .from('quote_requests')
    .select('id, quote_number, status, total_amount, created_at, sent_at, accepted_at, declined_at')
    .eq('customer_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Soft-deleted documents for this customer (admin-only "Deleted documents" view).
  const { count: deletedDocsCount } = isAdmin
    ? await supabase
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', id)
        .not('deleted_at', 'is', null)
    : { count: 0 }

  const siteIds = (sites ?? []).map((s) => s.id)

  // Map each site to its monitoring system (if connected) so clicking a site
  // card jumps straight to live monitoring — or to "add system" if there's none.
  const { data: monitoringSystems } = siteIds.length
    ? await supabase
        .from('monitoring_systems')
        .select('id, site_id')
        .in('site_id', siteIds)
    : { data: [] as { id: string; site_id: string }[] }
  const monitoringBySite = new Map<string, string>()
  for (const m of monitoringSystems ?? []) {
    if (m.site_id && !monitoringBySite.has(m.site_id)) monitoringBySite.set(m.site_id, m.id)
  }

  const { data: jobs } = siteIds.length
    ? await supabase
        .from('jobs')
        .select('id, title, status, created_at, site_id')
        .in('site_id', siteIds)
        .order('created_at', { ascending: false })
    : { data: [] as { id: string; title: string; status: string; created_at: string; site_id: string }[] }

  const status = customerAccountStatus(customer)
  const badge = STATUS_BADGE[status]

  // Activity timeline — newest first.
  const timeline: TimelineItem[] = [{ at: customer.created_at, label: 'Customer record created' }]
  if (customer.invited_at) timeline.push({ at: customer.invited_at, label: 'Portal invite sent' })
  if (customer.registered_at) timeline.push({ at: customer.registered_at, label: 'Registered & verified the portal account' })
  for (const q of quotes ?? []) {
    const ref = q.quote_number ?? 'Quote'
    if (q.created_at) timeline.push({ at: q.created_at, label: `${ref} drafted` })
    if (q.sent_at) timeline.push({ at: q.sent_at, label: `${ref} sent to customer` })
    if (q.accepted_at) timeline.push({ at: q.accepted_at, label: `${ref} accepted` })
    if (q.declined_at) timeline.push({ at: q.declined_at, label: `${ref} declined` })
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <PageShell width="content">
      <Link href="/portal/employee/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-4 w-4" /> All customers
      </Link>

      <PageHeader
        icon={Users}
        title={
          <span className="flex items-center gap-2 flex-wrap">
            {customer.full_name || 'Unknown'}
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {customer.is_business && <Badge variant="default">Business</Badge>}
            {customer.archived_at && <Badge variant="destructive">Archived</Badge>}
          </span>
        }
        description={
          <span className="capitalize">
            From {customer.source} · added {formatDate(customer.created_at)}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/portal/employee/customers/${customer.id}/statement`}>
                <FileText className="h-3.5 w-3.5" />
                Statement
              </Link>
            </Button>
            {isAdmin && (deletedDocsCount ?? 0) > 0 && (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Link href={`/portal/employee/customers/${customer.id}/deleted`}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Deleted documents
                  <Badge variant="outline">{deletedDocsCount}</Badge>
                </Link>
              </Button>
            )}
            {isAdmin && (
              <ArchiveCustomerButton
                customerId={customer.id}
                customerName={customer.full_name}
                archived={!!customer.archived_at}
              />
            )}
          </div>
        }
      />

      {/* Interactive: editable contact details + invite */}
      <CustomerPanel customer={customer} accountStatus={status} />

      {/* Ownership & sharing — who this customer belongs to / is shared with */}
      <RecordShareControl
        section="customers"
        recordId={customer.id}
        table="customers"
        ownerColumn="created_by"
        ownerId={customer.created_by}
        ownerName={ownerName}
        staff={staff}
        sharedWith={sharedWith}
        currentUserId={user.id}
        canAssignOwner={isManager}
        canShare={isManager}
        ownerNoun="No owner set"
      />

      {/* Sites */}
      <AddSiteProvider>
      <section>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            <MapPin className="h-4 w-4" /> Sites ({sites?.length ?? 0})
          </h2>
          <AddSiteTrigger />
        </div>
        <AddSitePanel customerId={id} defaultAddress={customer.address} />
        {!sites?.length ? (
          <p className="text-sm text-muted-foreground">
            No sites yet. A site is created automatically when a quote is accepted — or add one by hand
            (e.g. an existing system you want to put on monitoring).
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {sites.map((s) => (
              <SiteCard key={s.id} site={s} monitoringSystemId={monitoringBySite.get(s.id) ?? null} />
            ))}
          </div>
        )}
      </section>
      </AddSiteProvider>

      {/* Quotes */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          <FileText className="h-4 w-4" /> Quotes ({quotes?.length ?? 0})
        </h2>
        {!quotes?.length ? (
          <p className="text-sm text-muted-foreground">No quotes yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {quotes.map((q) => (
              <Link key={q.id} href={`/portal/employee/quotes-v2/${q.id}`}>
                <Card className="hover:border-accent transition-colors">
                  <CardContent className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{q.quote_number ?? 'Draft quote'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(q.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium">{rand(q.total_amount)}</span>
                      <Badge variant={q.status === 'accepted' ? 'success' : q.status === 'declined' ? 'destructive' : 'default'}>
                        {q.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Jobs */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          <Wrench className="h-4 w-4" /> Jobs ({jobs?.length ?? 0})
        </h2>
        {!jobs?.length ? (
          <p className="text-sm text-muted-foreground">No installation jobs yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((j) => (
              <Link key={j.id} href={`/portal/employee/jobs/${j.id}`}>
                <Card className="hover:border-accent transition-colors">
                  <CardContent className="py-3 flex items-center justify-between gap-3">
                    <p className="font-medium text-sm truncate">{j.title}</p>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="default">{j.status}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Activity */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          <Clock className="h-4 w-4" /> Activity
        </h2>
        <Card>
          <CardContent className="py-4">
            <ol className="flex flex-col gap-3">
              {timeline.map((t, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0" />
                  <div>
                    <p className="text-sm">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  )
}
