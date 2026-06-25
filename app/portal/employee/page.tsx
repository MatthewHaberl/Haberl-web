import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { ComponentType } from 'react'
import {
  ArrowRight,
  Briefcase,
  Eye,
  FileText,
  Flag,
  Landmark,
  ListChecks,
  Package,
  PhoneCall,
  Send,
  Sunrise,
  UserRound,
  Wallet,
  AlertTriangle,
} from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildDailyBriefing } from '@/lib/quotes/daily-briefing'
import { formatCurrency } from '@/lib/utils'
import type { JobPriority, JobStatus, Role } from '@/types/database'
import { PlanList, type PlanListItem } from './PlanList'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

// ── Helpers ──────────────────────────────────────────────────────────────────

type NeedRow = {
  id: string
  icon: ComponentType<{ className?: string }>
  label: string
  sub?: string
  age?: string
  urgent: boolean
  href: string
  sortAge: number
}

function days(n: number | undefined): string {
  if (n == null) return ''
  return `${n} day${n === 1 ? '' : 's'}`
}

const resolvedRank: Record<string, number> = { done: 1, parked: 1 }

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: string
  sub: string
  icon: ComponentType<{ className?: string }>
  accent?: boolean
}) {
  return (
    <Card className={accent ? 'border-accent/40' : undefined}>
      <CardHeader className="pb-1.5">
        <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          {label}
          <Icon className={`h-4 w-4 shrink-0 ${accent ? 'text-accent' : 'text-muted-foreground'}`} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${accent ? 'text-accent' : 'text-foreground'}`}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

function NeedsList({ rows }: { rows: NeedRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-success">
        All clear — nothing needs you right now. 🎉
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <Link
            key={row.id}
            href={row.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3 transition-colors hover:border-accent"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.label}</p>
              {row.sub && <p className="truncate text-xs text-muted-foreground">{row.sub}</p>}
            </div>
            {row.age && (
              <Badge variant={row.urgent ? 'destructive' : 'warning'} className="shrink-0 whitespace-nowrap">
                {row.age}
              </Badge>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function EmployeePortalRoot() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'field_worker') as Role
  if (role === 'customer') redirect('/portal/customer')

  const isManager = role === 'manager' || role === 'admin'
  const isAdmin = role === 'admin'
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there'
  const now = new Date()
  const dateLabel = now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  let needs: NeedRow[] = []
  let planItems: PlanListItem[] = []
  let openQuotes = 0
  let activeJobs = 0
  let proofs = 0
  let revenueThisMonth = 0

  if (isManager) {
    const [briefing, openQuotesRes, activeJobsRes, proofsRes, revenueRes, planRes] = await Promise.all([
      buildDailyBriefing(supabase, now.getTime()),
      supabase.from('quote_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'generated', 'sent']),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).not('deposit_proof_url', 'is', null).is('deposit_confirmed_at', null),
      supabase.from('orders').select('total').eq('status', 'paid').gte('created_at', thisMonthStart),
      supabase
        .from('plan_items')
        .select('id, code, track, title, priority, priority_rank, status, response, user_status, responded_at')
        .eq('is_published', true)
        .in('status', ['pending', 'in_progress'])
        .order('priority_rank', { ascending: true })
        .order('track', { ascending: true })
        .order('code', { ascending: true }),
    ])

    openQuotes = openQuotesRes.count ?? 0
    activeJobs = activeJobsRes.count ?? 0
    proofs = proofsRes.count ?? 0
    revenueThisMonth = (revenueRes.data ?? []).reduce((sum, r) => sum + (r.total ?? 0), 0)

    // The Leads page (/portal/employee/leads) is live, so lead shortcuts surface
    // here on the command center too — new leads to call + follow-ups due.
    const LEADS_PAGE_LIVE: boolean = true
    const leadRows: NeedRow[] = LEADS_PAGE_LIVE
      ? [
          ...briefing.newLeads.map((l) => ({
            id: `lead-${l.id}`,
            icon: PhoneCall,
            label: `Lead not called — ${l.label}`,
            sub: l.sub,
            age: l.ageDays && l.ageDays >= 1 ? `waiting ${days(l.ageDays)}` : 'new today',
            urgent: !!l.urgent,
            href: l.href,
            sortAge: l.ageDays ?? 0,
          })),
          ...briefing.followupLeads.map((l) => ({
            id: `flead-${l.id}`,
            icon: PhoneCall,
            label: `Follow up — ${l.label}`,
            sub: l.sub,
            age: l.ageDays != null && l.ageDays >= 1 ? `called ${days(l.ageDays)} ago` : 'called today',
            urgent: !!l.urgent,
            href: l.href,
            sortAge: l.ageDays ?? 0,
          })),
        ]
      : []

    const rows: NeedRow[] = [
      ...leadRows,
      ...briefing.personalFollowups.map((q) => ({
        id: `pf-${q.id}`,
        icon: PhoneCall,
        label: `${q.customerName}${q.quoteNumber ? ` · ${q.quoteNumber}` : ''}`,
        sub: q.detail,
        age: q.ageDays != null ? `sent ${days(q.ageDays)} ago` : undefined,
        urgent: !!q.urgent,
        href: q.href,
        sortAge: q.ageDays ?? 0,
      })),
      ...briefing.awaitingResponse.map((q) => ({
        id: `aw-${q.id}`,
        icon: Eye,
        label: `${q.label}`,
        sub: 'quote opened, no reply yet',
        age: q.ageDays != null ? `sent ${days(q.ageDays)} ago` : undefined,
        urgent: !!q.urgent,
        href: q.href,
        sortAge: q.ageDays ?? 0,
      })),
      ...briefing.depositsToConfirm.map((j) => ({
        id: `dep-${j.id}`,
        icon: Wallet,
        label: `Deposit to confirm — ${j.label}`,
        sub: j.sub,
        age: j.ageDays != null ? `waiting ${days(j.ageDays)}` : undefined,
        urgent: !!j.urgent,
        href: j.href,
        sortAge: j.ageDays ?? 0,
      })),
      ...briefing.overduePOs.map((po) => ({
        id: `po-${po.id}`,
        icon: Package,
        label: `Overdue order — ${po.label}`,
        sub: po.sub,
        age: po.ageDays != null ? `due ${days(po.ageDays)} ago` : 'overdue',
        urgent: true,
        href: po.href,
        sortAge: (po.ageDays ?? 0) + 1000,
      })),
      ...briefing.drafts.map((q) => ({
        id: `dr-${q.id}`,
        icon: Send,
        label: `Quote ready to send — ${q.label}`,
        sub: q.sub,
        age: q.ageDays != null ? `ready ${days(q.ageDays)}` : undefined,
        urgent: !!q.urgent,
        href: q.href,
        sortAge: q.ageDays ?? 0,
      })),
    ]
    // Urgent first, then longest-waiting first.
    needs = rows.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.sortAge - a.sortAge)

    // Active first (sort the operator's own done/parked items to the bottom).
    planItems = ((planRes.data ?? []) as PlanListItem[]).sort((a, b) => {
      const ra = resolvedRank[a.user_status ?? ''] ?? 0
      const rb = resolvedRank[b.user_status ?? ''] ?? 0
      return ra - rb
    })
  } else {
    // Field worker: their own active jobs are the "needs you" list.
    const [activeJobsRes, openQuotesRes, proofsRes, myJobsRes] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).in('status', ['pending', 'in_progress']),
      supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('submitted_by', user.id).in('status', ['pending', 'generated', 'sent']),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).not('deposit_proof_url', 'is', null).is('deposit_confirmed_at', null),
      supabase
        .from('jobs')
        .select('id, title, status, priority, scheduled_date, site:sites(name)')
        .eq('assigned_to', user.id)
        .in('status', ['pending', 'in_progress'])
        .order('priority', { ascending: false })
        .limit(10),
    ])

    activeJobs = activeJobsRes.count ?? 0
    openQuotes = openQuotesRes.count ?? 0
    proofs = proofsRes.count ?? 0

    type JobRow = {
      id: string
      title: string
      status: JobStatus
      priority: JobPriority
      scheduled_date: string | null
      site: Array<{ name: string }> | { name: string } | null
    }
    needs = ((myJobsRes.data ?? []) as JobRow[]).map((j) => {
      const site = Array.isArray(j.site) ? j.site[0] : j.site
      return {
        id: `job-${j.id}`,
        icon: Briefcase,
        label: j.title,
        sub: site?.name ?? (j.status === 'in_progress' ? 'in progress' : 'pending'),
        age: j.priority === 'urgent' ? 'urgent' : j.priority === 'high' ? 'high' : undefined,
        urgent: j.priority === 'urgent',
        href: `/portal/employee/jobs/${j.id}`,
        sortAge: j.priority === 'urgent' ? 2 : j.priority === 'high' ? 1 : 0,
      }
    }).sort((a, b) => b.sortAge - a.sortAge)
  }

  const needCount = needs.length
  const urgentCount = needs.filter((n) => n.urgent).length

  const metrics = isManager
    ? [
        { label: 'Open quotes', value: String(openQuotes), sub: 'in the pipeline', icon: FileText },
        { label: 'Active jobs', value: String(activeJobs), sub: 'on the board', icon: Briefcase },
        { label: 'Proofs to confirm', value: String(proofs), sub: 'POPs awaiting you', icon: Landmark },
        { label: 'Revenue this month', value: formatCurrency(revenueThisMonth), sub: 'paid store orders', icon: Wallet, accent: true },
      ]
    : [
        { label: 'My active jobs', value: String(activeJobs), sub: 'assigned to you', icon: Briefcase, accent: true },
        { label: 'My open quotes', value: String(openQuotes), sub: 'still in progress', icon: FileText },
        { label: 'Uploaded proofs', value: String(proofs), sub: 'awaiting deposit confirm', icon: Landmark },
      ]

  return (
    <div className="flex flex-col gap-6">
      {/* Slim header */}
      <Card className="border-accent/30 bg-gradient-to-br from-primary to-primary/85 text-white">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-accent" />
              <h1 className="text-2xl font-bold">What&apos;s next</h1>
            </div>
            <p className="mt-1 text-sm text-white/80">
              Good day, {firstName}. {dateLabel}.
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-center">
            <p className="text-3xl font-bold">{needCount}</p>
            <p className="text-xs text-white/75">
              need{needCount === 1 ? 's' : ''} you{urgentCount ? ` · ${urgentCount} urgent` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Compact KPIs */}
      <div className={`grid gap-3 ${isManager ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
        {metrics.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Needs you now */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Needs you now
            {needCount > 0 && <Badge variant={urgentCount ? 'destructive' : 'warning'}>{needCount}</Badge>}
          </CardTitle>
          <CardDescription>
            {isManager
              ? 'Quotes gone quiet, deposits and orders waiting — with how long each has waited.'
              : 'Your assigned jobs that need action, most urgent first.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NeedsList rows={needs} />
        </CardContent>
      </Card>

      {/* What's next — the plan */}
      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-accent" />
              What&apos;s next — your plan
              {planItems.length > 0 && <Badge variant="outline">{planItems.length} open</Badge>}
            </CardTitle>
            <CardDescription>
              Pulled live from the second brain. Open any item for the full detail
              {isAdmin ? ', leave a reply, and set your own status — your replies come back to Claude next session.' : '.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanList items={planItems} canRespond={isAdmin} />
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/portal/employee/jobs">
          <Card className="h-full transition-colors hover:border-accent">
            <CardContent className="flex h-full items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold">Jobs</p>
                <p className="text-xs text-muted-foreground">Scheduling & execution</p>
              </div>
              <Briefcase className="h-5 w-5 text-accent" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/employee/quotes-v2">
          <Card className="h-full transition-colors hover:border-accent">
            <CardContent className="flex h-full items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold">Quotes</p>
                <p className="text-xs text-muted-foreground">Pipeline & surveys</p>
              </div>
              <FileText className="h-5 w-5 text-accent" />
            </CardContent>
          </Card>
        </Link>
        {isManager ? (
          <Link href="/portal/employee/briefing">
            <Card className="h-full transition-colors hover:border-accent">
              <CardContent className="flex h-full items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold">Today</p>
                  <p className="text-xs text-muted-foreground">Full morning briefing</p>
                </div>
                <Sunrise className="h-5 w-5 text-accent" />
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Link href="/portal/employee/profile">
            <Card className="h-full transition-colors hover:border-accent">
              <CardContent className="flex h-full items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold">My profile</p>
                  <p className="text-xs text-muted-foreground">Account details</p>
                </div>
                <UserRound className="h-5 w-5 text-accent" />
              </CardContent>
            </Card>
          </Link>
        )}
        <Link href={isManager ? '/portal/employee/metrics' : '/portal/employee/jobs'}>
          <Card className="h-full transition-colors hover:border-accent">
            <CardContent className="flex h-full items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold">{isManager ? 'Metrics' : 'All my jobs'}</p>
                <p className="text-xs text-muted-foreground">{isManager ? 'Detailed numbers' : 'Full job list'}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-accent" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
