import { createClient, getUser } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, MapPin, FileText, Wrench, Clock, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { customerAccountStatus, type Customer } from '@/types/database'
import { CustomerPanel } from './CustomerPanel'
import { AddSiteDialog } from './AddSiteDialog'
import { SiteCard } from './SiteCard'
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
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user!.id).single()
  if (!['manager', 'admin'].includes(profile?.role ?? '')) redirect('/portal/employee/jobs')

  const { data: customerRow } = await supabase
    .from('customers').select('*').eq('id', id).maybeSingle()
  if (!customerRow) notFound()
  const customer = customerRow as Customer

  const { data: sites } = await supabase
    .from('sites')
    .select('id, name, address, status, system_size_kw, system_type, created_at')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  const { data: quotes } = await supabase
    .from('quote_requests')
    .select('id, quote_number, status, total_amount, created_at, sent_at, accepted_at, declined_at')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  const siteIds = (sites ?? []).map((s) => s.id)
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
    <div className="flex flex-col gap-6 max-w-4xl">
      <Link href="/portal/employee/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-4 w-4" /> All customers
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-primary">{customer.full_name || 'Unknown'}</h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {customer.is_business && <Badge variant="default">Business</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            From {customer.source} · added {formatDate(customer.created_at)}
          </p>
        </div>
      </div>

      {/* Interactive: editable contact details + invite */}
      <CustomerPanel customer={customer} accountStatus={status} />

      {/* Sites */}
      <section>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            <MapPin className="h-4 w-4" /> Sites ({sites?.length ?? 0})
          </h2>
          <AddSiteDialog customerId={id} defaultAddress={customer.address} />
        </div>
        {!sites?.length ? (
          <p className="text-sm text-muted-foreground">
            No sites yet. A site is created automatically when a quote is accepted — or add one by hand
            (e.g. an existing system you want to put on monitoring).
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {sites.map((s) => (
              <SiteCard key={s.id} site={s} />
            ))}
          </div>
        )}
      </section>

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
    </div>
  )
}
