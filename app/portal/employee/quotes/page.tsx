import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FileText, Plus, ChevronRight, Clock } from 'lucide-react'
import type { QuoteRequestStatus } from '@/types/database'

const statusVariant: Record<QuoteRequestStatus, 'default' | 'warning' | 'success'> = {
  pending:   'warning',
  generated: 'success',
  sent:      'default',
  accepted:  'success',
  declined:  'default',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
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

  // Non-managers only see their own submissions
  if (!isManager) query.eq('submitted_by', user!.id)

  const { data: requests } = await query

  const pending   = requests?.filter((r) => r.status === 'pending') ?? []
  const generated = requests?.filter((r) => r.status !== 'pending') ?? []

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
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Awaiting Review ({pending.length})
              </h2>
              <div className="flex flex-col gap-2">
                {pending.map((r) => (
                  <Link key={r.id} href={`/portal/employee/quotes/${r.id}`}>
                    <Card className="hover:border-accent transition-colors cursor-pointer">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{r.customer_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {r.address || 'No address'} · {r.system_type} · {r.monthly_kwh} kWh/mo
                            </p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {timeAgo(r.created_at)}
                              </span>
                              {isManager && (r.submitter as { full_name: string } | null)?.full_name && (
                                <span>by {(r.submitter as { full_name: string }).full_name}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={statusVariant[r.status as QuoteRequestStatus]}>
                              {r.status}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {generated.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Generated ({generated.length})
              </h2>
              <div className="flex flex-col gap-2">
                {generated.map((r) => (
                  <Link key={r.id} href={`/portal/employee/quotes/${r.id}`}>
                    <Card className="hover:border-accent transition-colors cursor-pointer">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{r.customer_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {r.address || 'No address'} · {r.system_type}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {timeAgo(r.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={statusVariant[r.status as QuoteRequestStatus]}>
                              {r.status}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
