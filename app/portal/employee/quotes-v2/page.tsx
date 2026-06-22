import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FileText, Plus, ChevronRight, Clock, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { QuoteRequestStatus } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// QUOTES (NEW) — workspace we are refining together.
// Reads the same `quote_requests` backend as the old Quotes tab, and links to
// the existing detail (`/quotes/[id]`) and new-request (`/quotes/new`) pages so
// nothing is lost. We reshape the FRONT of the workflow here, iteratively.
// ─────────────────────────────────────────────────────────────────────────────

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function QuoteCard({ request, isManager }: { request: QuoteRow; isManager: boolean }) {
  return (
    <Card className="hover:border-accent transition-colors">
      <CardContent className="pt-4 pb-4">
        <Link href={`/portal/employee/quotes/${request.id}`} className="block">
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
                    {formatCurrency(request.total_amount)}
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
        </Link>
      </CardContent>
    </Card>
  )
}

function Column({
  title,
  requests,
  isManager,
}: {
  title: string
  requests: QuoteRow[]
  isManager: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h2>
        <Badge variant="default">{requests.length}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {requests.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-6 text-center border border-dashed border-border rounded-lg">
            Nothing here yet
          </p>
        ) : (
          requests.map((request) => (
            <QuoteCard key={request.id} request={request} isManager={isManager} />
          ))
        )}
      </div>
    </div>
  )
}

export default async function QuotesV2Page() {
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

  const all = (requests ?? []) as QuoteRow[]

  // Simple pipeline view — three stages. We'll refine these buckets together.
  const toQuote = all.filter((r) => r.status === 'pending')
  const inProgress = all.filter((r) => r.status === 'generated' || r.status === 'sent')
  const closed = all.filter((r) => r.status === 'accepted' || r.status === 'declined')

  return (
    <div className="flex flex-col gap-6">
      {/* Workspace banner — remove once we're happy with this tab */}
      <div className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
        <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-foreground">New Quotes workspace</p>
          <p className="text-muted-foreground">
            Same data as the old Quotes tab — this is where we reshape the workflow.
            Tell me what the pipeline should look like and we&apos;ll refine it here.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Quotes</h1>
          <p className="text-muted-foreground mt-1">
            {toQuote.length} to quote · {inProgress.length} in progress · {closed.length} closed
          </p>
        </div>
        <Button asChild variant="accent" size="sm">
          <Link href="/portal/employee/quotes/new">
            <Plus className="h-4 w-4" />
            New request
          </Link>
        </Button>
      </div>

      {all.length === 0 ? (
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Column title="To quote" requests={toQuote} isManager={isManager} />
          <Column title="In progress" requests={inProgress} isManager={isManager} />
          <Column title="Closed" requests={closed} isManager={isManager} />
        </div>
      )}
    </div>
  )
}
