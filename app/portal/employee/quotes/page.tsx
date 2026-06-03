import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FileText, Plus, ChevronRight, Clock } from 'lucide-react'
import type { QuoteRequestStatus } from '@/types/database'

const statusVariant: Record<QuoteRequestStatus, 'default' | 'warning' | 'success'> = {
  pending: 'warning',
  generated: 'success',
  sent: 'default',
  accepted: 'success',
  declined: 'default',
}

type QuoteRow = {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  site_number: number | null
  quote_number: string | null
  address: string | null
  system_type: string
  monthly_kwh: string | null
  created_at: string
  status: QuoteRequestStatus
  total_amount: number | null
  submitter?: { full_name: string } | null
}

type CustomerGroup = {
  key: string
  customerName: string
  requests: QuoteRow[]
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function customerKey(request: QuoteRow) {
  return [
    request.customer_name.trim().toLowerCase(),
    request.customer_phone?.trim().toLowerCase() ?? '',
    request.customer_email?.trim().toLowerCase() ?? '',
  ].join('|')
}

function groupRequests(requests: QuoteRow[]): CustomerGroup[] {
  const grouped = new Map<string, CustomerGroup>()

  for (const request of requests) {
    const key = customerKey(request)
    const existing = grouped.get(key)

    if (existing) {
      existing.requests.push(request)
      continue
    }

    grouped.set(key, {
      key,
      customerName: request.customer_name,
      requests: [request],
    })
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      requests: [...group.requests].sort((a, b) => {
        const siteDiff = (a.site_number ?? 1) - (b.site_number ?? 1)
        if (siteDiff !== 0) return siteDiff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }),
    }))
    .sort((a, b) => {
      const latestA = Math.max(...a.requests.map((request) => new Date(request.created_at).getTime()))
      const latestB = Math.max(...b.requests.map((request) => new Date(request.created_at).getTime()))
      return latestB - latestA
    })
}

function RequestGroupCard({ group, isManager }: { group: CustomerGroup; isManager: boolean }) {
  if (group.requests.length === 1) {
    const request = group.requests[0]

    return (
      <Link href={`/portal/employee/quotes/${request.id}`}>
        <Card className="hover:border-accent transition-colors cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate">{request.customer_name}</p>
                  <Badge variant="default">Site {request.site_number ?? 1}</Badge>
                  {request.quote_number && (
                    <span className="text-xs font-mono text-muted-foreground">{request.quote_number}</span>
                  )}
                  {request.total_amount != null && (
                    <span className="text-xs font-semibold text-foreground">
                      R{(request.total_amount / 100).toLocaleString('en-ZA')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {request.address || 'No address'} · {request.system_type}
                  {request.monthly_kwh ? ` · ${request.monthly_kwh} kWh/mo` : ''}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo(request.created_at)}
                  </span>
                  {isManager && request.submitter?.full_name && (
                    <span>by {request.submitter.full_name}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={statusVariant[request.status]}>{request.status}</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <Card className="border-accent/40">
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-sm">{group.customerName}</p>
            <p className="text-xs text-muted-foreground">
              {group.requests.length} sites for this customer
            </p>
          </div>
          <Badge variant="default">{group.requests.length} sites</Badge>
        </div>

        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {group.requests.map((request) => (
            <Link
              key={request.id}
              href={`/portal/employee/quotes/${request.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">Site {request.site_number ?? 1}</p>
                  {request.quote_number && (
                    <span className="text-xs font-mono text-muted-foreground">{request.quote_number}</span>
                  )}
                  {request.total_amount != null && (
                    <span className="text-xs font-semibold text-foreground">
                      R{(request.total_amount / 100).toLocaleString('en-ZA')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {request.address || 'No address'} · {request.system_type}
                  {request.monthly_kwh ? ` · ${request.monthly_kwh} kWh/mo` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={statusVariant[request.status]}>{request.status}</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default async function QuotesPage() {
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const isManager = profile?.role === 'manager' || isAdmin

  const query = supabase
    .from('quote_requests')
    .select('*, submitter:user_profiles!submitted_by(full_name)')
    .order('created_at', { ascending: false })

  if (!isManager) query.eq('submitted_by', user!.id)

  const { data: requests } = await query

  const pending = (requests?.filter((request) => request.status === 'pending') ?? []) as QuoteRow[]
  const generated = (requests?.filter((request) => request.status !== 'pending') ?? []) as QuoteRow[]
  const pendingGroups = groupRequests(pending)
  const generatedGroups = groupRequests(generated)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Quote Requests</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? `${pending.length} awaiting review · ${generated.length} generated`
              : `${requests?.length ?? 0} submitted`}
          </p>
        </div>
        <Button asChild variant="accent" size="sm">
          <Link href="/portal/employee/quotes/new">
            <Plus className="h-4 w-4" />
            New request
          </Link>
        </Button>
      </div>

      {!requests?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No quote requests yet</p>
            <p className="text-muted-foreground text-sm mt-1">
              Submit a site survey to get started.
            </p>
            <Button asChild variant="accent" size="sm" className="mt-4">
              <Link href="/portal/employee/quotes/new">New request</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {pendingGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Awaiting Review ({pending.length})
              </h2>
              <div className="flex flex-col gap-2">
                {pendingGroups.map((group) => (
                  <RequestGroupCard key={group.key} group={group} isManager={isManager} />
                ))}
              </div>
            </div>
          )}

          {generatedGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Generated ({generated.length})
              </h2>
              <div className="flex flex-col gap-2">
                {generatedGroups.map((group) => (
                  <RequestGroupCard key={group.key} group={group} isManager={isManager} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
