import { notFound, redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, Clock, User, Plus } from 'lucide-react'
import { QuoteDetailTabs } from './QuoteDetailTabs'
import { QuoteStatusBar } from './QuoteStatusBar'
import type { QuoteRequestStatus } from '@/types/database'

const statusVariant: Record<QuoteRequestStatus, 'default' | 'warning' | 'success'> = {
  pending:   'warning',
  generated: 'success',
  sent:      'default',
  accepted:  'success',
  declined:  'default',
}

// Peek the next number for DISPLAY only — the atomic next_quote_number() rpc
// consumes it at save time (EquipmentSelector), so page views never burn numbers.
async function getNextQuoteNumber(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const year = new Date().getFullYear()
  const [{ data: seq }, { data: settings }] = await Promise.all([
    supabase.from('quote_sequences').select('next_number').eq('year', year).maybeSingle(),
    supabase.from('company_settings').select('quote_prefix').eq('id', true).maybeSingle(),
  ])
  const prefix = settings?.quote_prefix ?? 'QUO'
  const next = seq?.next_number ?? 1
  return `${prefix}-${year}-${String(next).padStart(3, '0')}`
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user!.id).single()

  const role      = profile?.role ?? 'field_worker'
  const isAdmin   = role === 'admin'
  const isManager = role === 'manager' || isAdmin

  const { data: req } = await supabase
    .from('quote_requests')
    .select('*, submitter:user_profiles!submitted_by(full_name)')
    .eq('id', id)
    .single()

  if (!req) notFound()
  if (!isManager && req.submitted_by !== user!.id) redirect('/portal/employee/quotes')

  const submitterName = (req.submitter as { full_name: string } | null)?.full_name ?? 'Unknown'
  const photoUrls     = (req.photo_urls ?? []) as string[]
  const nextQuoteNum  = isAdmin ? await getNextQuoteNumber(supabase) : ''

  const { data: linkedJob } = await supabase
    .from('jobs').select('id').eq('quote_request_id', id).maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqObj = req as Record<string, any>

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 max-w-3xl">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/portal/employee/quotes">
              <ArrowLeft className="h-4 w-4" /> Quotes
            </Link>
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-primary">{req.customer_name}</h1>
            <Link
              href={`/portal/employee/quotes/new?from=${req.id}`}
              title="New quote option for this customer"
              className="inline-flex"
            >
              <Badge variant="default" className="cursor-pointer hover:opacity-75 transition-opacity gap-1">
                Site {req.site_number ?? 1}
                <Plus className="h-3 w-3" />
              </Badge>
            </Link>
            {req.is_amendment && <Badge variant="warning">Amendment</Badge>}
            {req.quote_number && (
              <span className="text-sm font-mono text-muted-foreground">{req.quote_number}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {new Date(req.created_at).toLocaleDateString('en-ZA', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {submitterName}
            </span>
          </div>
        </div>
        {/* Status bar — admin only; shows badge + action buttons */}
        {isAdmin ? (
          <QuoteStatusBar
            requestId={req.id}
            initialStatus={req.status as QuoteRequestStatus}
            initialJobId={linkedJob?.id ?? null}
            shareToken={req.share_token}
            customerEmail={req.customer_email ?? null}
            customerPhone={req.customer_phone ?? null}
            customerName={req.customer_name}
            quoteNumber={req.quote_number ?? null}
            viewedAt={req.viewed_at ?? null}
          />
        ) : (
          <Badge variant={statusVariant[req.status as QuoteRequestStatus]} className="mt-1 shrink-0">
            {req.status}
          </Badge>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────────── */}
      <QuoteDetailTabs
        req={reqObj}
        isAdmin={isAdmin}
        canEditSurvey={isAdmin || req.submitted_by === user!.id}
        photoUrls={photoUrls}
        nextQuoteNum={nextQuoteNum}
      />
    </div>
  )
}
