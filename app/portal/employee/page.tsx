import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { ComponentType } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  Globe,
  Flag,
  Landmark,
  MapPin,
  ShoppingCart,
  Target,
  TrendingUp,
  UserRound,
  Users,
  Zap,
} from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { dashboardContent, type DashboardBadgeVariant } from '@/lib/dashboard-content'
import { formatCurrency, formatDate } from '@/lib/utils'
import type {
  JobPriority,
  JobStatus,
  OrderStatus,
  PlanItem,
  PlanItemPriority,
  PlanItemStatus,
  QuoteRequestStatus,
  Role,
} from '@/types/database'

export const metadata: Metadata = { title: 'Dashboard' }

type BadgeVariant = DashboardBadgeVariant

type RecentQuote = {
  id: string
  customer_name: string
  status: QuoteRequestStatus
  created_at: string
  quote_number: string | null
  total_amount: number | null
  system_type: string
}

type RecentJobRow = {
  id: string
  title: string
  status: JobStatus
  priority: JobPriority
  scheduled_date: string | null
  created_at: string
  deposit_proof_url: string | null
  deposit_proof_uploaded_at: string | null
  deposit_confirmed_at: string | null
  site: Array<{ name: string }> | null
  assignee: Array<{ full_name: string }> | null
}

type RecentJob = {
  id: string
  title: string
  status: JobStatus
  priority: JobPriority
  scheduled_date: string | null
  created_at: string
  deposit_proof_url: string | null
  deposit_proof_uploaded_at: string | null
  deposit_confirmed_at: string | null
  site?: { name: string } | null
  assignee?: { full_name: string } | null
}

type RecentCustomer = {
  id: string
  full_name: string
  email: string
  created_at: string
  sites?: Array<{ id: string; status: string }> | null
}

type RecentOrderRow = {
  id: string
  total: number | null
  status: OrderStatus
  created_at: string
  customer: Array<{ full_name: string }> | null
}

type RecentOrder = {
  id: string
  total: number | null
  status: OrderStatus
  created_at: string
  customer?: { full_name: string } | null
}

const quoteBadgeVariant: Record<QuoteRequestStatus, BadgeVariant> = {
  pending: 'warning',
  generated: 'accent',
  sent: 'default',
  accepted: 'success',
  declined: 'destructive',
}

const jobStatusVariant: Record<JobStatus, BadgeVariant> = {
  pending: 'default',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
}

const priorityVariant: Record<JobPriority, BadgeVariant> = {
  low: 'outline',
  medium: 'default',
  high: 'warning',
  urgent: 'destructive',
}

type PlanRow = Pick<
  PlanItem,
  'code' | 'track' | 'title' | 'priority' | 'priority_rank' | 'status' | 'synced_at'
>

const planPriorityVariant: Record<PlanItemPriority, BadgeVariant> = {
  urgent: 'destructive',
  highest: 'warning',
  high: 'accent',
  medium: 'default',
  low: 'outline',
}

const planStatusVariant: Record<PlanItemStatus, BadgeVariant> = {
  pending: 'outline',
  in_progress: 'warning',
  done: 'success',
}

const planStatusLabel: Record<PlanItemStatus, string> = {
  pending: 'to do',
  in_progress: 'in progress',
  done: 'done',
}

const PLAN_LIMIT = 8

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.floor(diffMs / 60000))

  if (mins < 60) return `${mins}m ago`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function sumMoney(rows: Array<{ total: number | null }> | null | undefined) {
  return (rows ?? []).reduce((sum, row) => sum + (row.total ?? 0), 0)
}

function normalizeRecentJobs(rows: RecentJobRow[] | null | undefined): RecentJob[] {
  return (rows ?? []).map((job) => ({
    ...job,
    site: Array.isArray(job.site) ? (job.site[0] ?? null) : job.site,
    assignee: Array.isArray(job.assignee) ? (job.assignee[0] ?? null) : job.assignee,
  }))
}

function normalizeRecentOrders(rows: RecentOrderRow[] | null | undefined): RecentOrder[] {
  return (rows ?? []).map((order) => ({
    ...order,
    customer: Array.isArray(order.customer) ? (order.customer[0] ?? null) : order.customer,
  }))
}

function DashboardMetric({
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
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          {label}
          <Icon className={`h-4 w-4 shrink-0 ${accent ? 'text-accent' : 'text-muted-foreground'}`} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${accent ? 'text-accent' : 'text-foreground'}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

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
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

  let jobsActiveCount = 0
  let jobsCompletedThisMonth = 0
  let urgentJobsCount = 0
  let depositProofsCount = 0
  let recentJobs: RecentJob[] = []
  let recentProofJobs: RecentJob[] = []
  let openQuotesCount = 0
  let pendingQuotesCount = 0
  let acceptedQuotesCount = 0
  let recentQuotes: RecentQuote[] = []
  let revenueThisMonth = 0
  let revenueLastMonth = 0
  let paidOrdersThisMonth = 0
  let recentOrders: RecentOrder[] = []
  let activeCustomersCount = 0
  let newCustomersThisMonth = 0
  let recentCustomers: RecentCustomer[] = []
  let activeSitesCount = 0
  let pendingSitesCount = 0
  let activeProductsCount = 0

  const [
    activeJobsResult,
    completedJobsResult,
    urgentJobsResult,
    recentJobsResult,
    depositProofsResult,
    recentProofJobsResult,
    openQuotesResult,
    pendingQuotesResult,
    acceptedQuotesResult,
    recentQuotesResult,
    planItemsResult,
  ] = await Promise.all([
    isManager
      ? supabase.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress'])
      : supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).in('status', ['pending', 'in_progress']),
    isManager
      ? supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('completed_at', thisMonthStart)
      : supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).eq('status', 'completed').gte('completed_at', thisMonthStart),
    isManager
      ? supabase.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']).eq('priority', 'urgent')
      : supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).in('status', ['pending', 'in_progress']).eq('priority', 'urgent'),
    isManager
      ? supabase
          .from('jobs')
          .select('id, title, status, priority, scheduled_date, created_at, deposit_proof_url, deposit_proof_uploaded_at, deposit_confirmed_at, site:sites(name), assignee:user_profiles!jobs_assigned_to_fkey(full_name)')
          .order('created_at', { ascending: false })
          .limit(5)
      : supabase
          .from('jobs')
          .select('id, title, status, priority, scheduled_date, created_at, deposit_proof_url, deposit_proof_uploaded_at, deposit_confirmed_at, site:sites(name), assignee:user_profiles!jobs_assigned_to_fkey(full_name)')
          .eq('assigned_to', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
    isManager
      ? supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .not('deposit_proof_url', 'is', null)
          .is('deposit_confirmed_at', null)
      : supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .not('deposit_proof_url', 'is', null)
          .is('deposit_confirmed_at', null),
    isManager
      ? supabase
          .from('jobs')
          .select('id, title, status, priority, scheduled_date, created_at, deposit_proof_url, deposit_proof_uploaded_at, deposit_confirmed_at, site:sites(name), assignee:user_profiles!jobs_assigned_to_fkey(full_name)')
          .not('deposit_proof_url', 'is', null)
          .is('deposit_confirmed_at', null)
          .order('deposit_proof_uploaded_at', { ascending: false })
          .limit(5)
      : supabase
          .from('jobs')
          .select('id, title, status, priority, scheduled_date, created_at, deposit_proof_url, deposit_proof_uploaded_at, deposit_confirmed_at, site:sites(name), assignee:user_profiles!jobs_assigned_to_fkey(full_name)')
          .eq('assigned_to', user.id)
          .not('deposit_proof_url', 'is', null)
          .is('deposit_confirmed_at', null)
          .order('deposit_proof_uploaded_at', { ascending: false })
          .limit(5),
    isManager
      ? supabase.from('quote_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'generated', 'sent'])
      : supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('submitted_by', user.id).in('status', ['pending', 'generated', 'sent']),
    isManager
      ? supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      : supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('submitted_by', user.id).eq('status', 'pending'),
    isManager
      ? supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('status', 'accepted')
      : supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('submitted_by', user.id).eq('status', 'accepted'),
    isManager
      ? supabase
          .from('quote_requests')
          .select('id, customer_name, status, created_at, quote_number, total_amount, system_type')
          .order('created_at', { ascending: false })
          .limit(5)
      : supabase
          .from('quote_requests')
          .select('id, customer_name, status, created_at, quote_number, total_amount, system_type')
          .eq('submitted_by', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
    supabase
      .from('plan_items')
      .select('code, track, title, priority, priority_rank, status, synced_at')
      .eq('is_published', true)
      .in('status', ['pending', 'in_progress'])
      .order('priority_rank', { ascending: true })
      .order('track', { ascending: true })
      .order('code', { ascending: true }),
  ])

  jobsActiveCount = activeJobsResult.count ?? 0
  jobsCompletedThisMonth = completedJobsResult.count ?? 0
  urgentJobsCount = urgentJobsResult.count ?? 0
  depositProofsCount = depositProofsResult.count ?? 0
  recentJobs = normalizeRecentJobs((recentJobsResult.data ?? []) as RecentJobRow[])
  recentProofJobs = normalizeRecentJobs((recentProofJobsResult.data ?? []) as RecentJobRow[])
  openQuotesCount = openQuotesResult.count ?? 0
  pendingQuotesCount = pendingQuotesResult.count ?? 0
  acceptedQuotesCount = acceptedQuotesResult.count ?? 0
  recentQuotes = (recentQuotesResult.data ?? []) as RecentQuote[]
  const planItems = (planItemsResult.data ?? []) as PlanRow[]

  if (isManager) {
    const [
      thisMonthOrdersResult,
      lastMonthOrdersResult,
      paidOrdersResult,
      recentOrdersResult,
      customerCountResult,
      newCustomersResult,
      recentCustomersResult,
      activeSitesResult,
      pendingSitesResult,
      activeProductsResult,
    ] = await Promise.all([
      supabase.from('orders').select('total').eq('status', 'paid').gte('created_at', thisMonthStart),
      supabase.from('orders').select('total').eq('status', 'paid').gte('created_at', lastMonthStart).lt('created_at', thisMonthStart),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid').gte('created_at', thisMonthStart),
      supabase
        .from('orders')
        .select('id, total, status, created_at, customer:user_profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer').gte('created_at', thisMonthStart),
      supabase
        .from('user_profiles')
        .select('id, full_name, email, created_at, sites(id, status)')
        .eq('role', 'customer')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('sites').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('sites').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
    ])

    revenueThisMonth = sumMoney(thisMonthOrdersResult.data)
    revenueLastMonth = sumMoney(lastMonthOrdersResult.data)
    paidOrdersThisMonth = paidOrdersResult.count ?? 0
    recentOrders = normalizeRecentOrders((recentOrdersResult.data ?? []) as RecentOrderRow[])
    activeCustomersCount = customerCountResult.count ?? 0
    newCustomersThisMonth = newCustomersResult.count ?? 0
    recentCustomers = (recentCustomersResult.data ?? []) as RecentCustomer[]
    activeSitesCount = activeSitesResult.count ?? 0
    pendingSitesCount = pendingSitesResult.count ?? 0
    activeProductsCount = activeProductsResult.count ?? 0
  }

  const revenueGrowth =
    revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : null

  const latestQuote = recentQuotes[0]
  const latestCustomer = recentCustomers[0]
  const latestOrder = recentOrders[0]
  const { companyGoals } = dashboardContent
  const planUpdated = planItems[0]?.synced_at ?? null
  const topPlan = planItems.slice(0, PLAN_LIMIT)
  const planByTrack = planItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.track] = (acc[item.track] ?? 0) + 1
    return acc
  }, {})

  const dashboardMetrics = isManager
    ? [
        {
          label: 'Revenue this month',
          value: formatCurrency(revenueThisMonth),
          sub: revenueGrowth === null ? 'First month of paid-order data' : `${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}% vs last month`,
          icon: TrendingUp,
          accent: true,
        },
        {
          label: 'Paid store orders',
          value: String(paidOrdersThisMonth),
          sub: 'online orders paid this month',
          icon: ShoppingCart,
        },
        {
          label: 'Open quotes',
          value: String(openQuotesCount),
          sub: `${pendingQuotesCount} awaiting review`,
          icon: FileText,
        },
        {
          label: 'Active jobs',
          value: String(jobsActiveCount),
          sub: `${urgentJobsCount} urgent right now`,
          icon: Briefcase,
        },
        {
          label: 'Proofs to confirm',
          value: String(depositProofsCount),
          sub: 'uploaded POPs awaiting reconciliation',
          icon: Landmark,
        },
        {
          label: 'Customer accounts',
          value: String(activeCustomersCount),
          sub: `${newCustomersThisMonth} added this month`,
          icon: Users,
        },
        {
          label: 'Active sites',
          value: String(activeSitesCount),
          sub: `${pendingSitesCount} pending sites`,
          icon: MapPin,
        },
      ]
    : [
        {
          label: 'My active jobs',
          value: String(jobsActiveCount),
          sub: `${urgentJobsCount} urgent right now`,
          icon: Briefcase,
          accent: true,
        },
        {
          label: 'Jobs completed this month',
          value: String(jobsCompletedThisMonth),
          sub: 'your completed work this month',
          icon: CheckCircle2,
        },
        {
          label: 'My open quotes',
          value: String(openQuotesCount),
          sub: `${pendingQuotesCount} still pending`,
          icon: FileText,
        },
        {
          label: 'Uploaded proofs',
          value: String(depositProofsCount),
          sub: 'POPs waiting on deposit confirmation',
          icon: Landmark,
        },
        {
          label: 'Accepted quotes',
          value: String(acceptedQuotesCount),
          sub: 'quotes you submitted that converted',
          icon: TrendingUp,
        },
      ]

  const currentPulse = [
    `${pendingQuotesCount} ${isManager ? 'quote requests' : 'your quote requests'} waiting for review or next action.`,
    `${jobsActiveCount} ${isManager ? 'jobs are' : 'jobs are'} active in the portal right now, with ${urgentJobsCount} marked urgent.`,
    `${depositProofsCount} proof${depositProofsCount === 1 ? '' : 's'} of payment ${depositProofsCount === 1 ? 'is' : 'are'} uploaded and waiting for confirmation.`,
    isManager
      ? `${paidOrdersThisMonth} paid store orders have landed this month for ${formatCurrency(revenueThisMonth)} in revenue.`
      : 'Company-wide sales, customer, and site visibility unlocks automatically on manager and admin accounts.',
    isManager
      ? `Website click analytics is not wired into the portal yet, so sales and operational data are live but traffic is still a gap.`
      : 'Website click analytics is not wired into the portal yet, so this dashboard focuses on operational work already in the database.',
  ]

  if (isManager && latestCustomer) {
    currentPulse.push(`Newest customer account: ${latestCustomer.full_name} joined ${timeAgo(latestCustomer.created_at)}.`)
  }

  if (isManager && latestOrder) {
    currentPulse.push(
      `Latest store order: ${latestOrder.customer?.full_name ?? 'customer'} placed ${timeAgo(latestOrder.created_at)}${
        latestOrder.total != null ? ` for ${formatCurrency(latestOrder.total)}` : ''
      }.`
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden border-accent/30 bg-gradient-to-br from-primary via-primary to-primary/85 text-white">
        <CardContent className="grid gap-6 px-6 py-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent" className="bg-white/15 text-white">Employee Dashboard</Badge>
              <Badge variant="outline" className="border-white/20 text-white/90">
                {isManager ? 'Company view' : 'Personal view'}
              </Badge>
              {isAdmin && (
                <Badge variant="outline" className="border-white/20 text-white/90">Admin access</Badge>
              )}
            </div>

            <div>
              <h1 className="text-3xl font-bold">Haberl operating dashboard</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/80">
                Goals, leadership focus, live pipeline markers, and current operational numbers in one place.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/60">Track 1</p>
                <p className="mt-2 font-semibold">Solar automation</p>
                <p className="mt-1 text-sm text-white/75">Highest priority. Tighten the operating engine first.</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/60">Track 3</p>
                <p className="mt-2 font-semibold">Website + portal</p>
                <p className="mt-1 text-sm text-white/75">Live and expanding into a real control centre.</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/60">Track 2</p>
                <p className="mt-2 font-semibold">BMG investor pitch</p>
                <p className="mt-1 text-sm text-white/75">Keep warm, then move once Track 1 is stable.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/60">Right now</p>
              <p className="mt-2 text-3xl font-bold">{openQuotesCount}</p>
              <p className="text-sm text-white/75">open quotes in the pipeline</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/60">Operations</p>
              <p className="mt-2 text-3xl font-bold">{jobsActiveCount}</p>
              <p className="text-sm text-white/75">active jobs currently on the board</p>
            </div>
            {isManager && (
              <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/60">Store sales</p>
                <p className="mt-2 text-3xl font-bold">{formatCurrency(revenueThisMonth)}</p>
                <p className="text-sm text-white/75">paid online revenue this month</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className={`grid gap-4 ${isManager ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        {dashboardMetrics.map((metric) => (
          <DashboardMetric key={metric.label} {...metric} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-accent" />
              Goals of the company
            </CardTitle>
            <CardDescription>Use the dashboard to keep priorities visible while the portal grows.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {companyGoals.map((goal) => (
              <div key={goal.title} className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{goal.title}</p>
                  <Badge variant={goal.variant}>{goal.badge}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{goal.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-accent" />
                What&apos;s next
              </CardTitle>
              {planUpdated && (
                <Badge variant="outline" className="shrink-0 whitespace-nowrap">
                  Synced {formatDate(planUpdated)}
                </Badge>
              )}
            </div>
            <CardDescription>
              Top priorities pulled live from the second brain. Update the plan and re-sync to change this.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {topPlan.length ? (
              <>
                {topPlan.map((item) => (
                  <div key={item.code} className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={planPriorityVariant[item.priority]}>{item.priority}</Badge>
                        <Badge variant="outline">{item.track}</Badge>
                      </div>
                      <Badge variant={planStatusVariant[item.status]}>{planStatusLabel[item.status]}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-foreground" title={item.title}>
                      {item.title}
                    </p>
                  </div>
                ))}
                {planItems.length > PLAN_LIMIT && (
                  <p className="text-xs text-muted-foreground">
                    +{planItems.length - PLAN_LIMIT} more open ·{' '}
                    {Object.entries(planByTrack)
                      .map(([track, count]) => `${track} ${count}`)
                      .join(' · ')}
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No plan items synced yet. Run <code>npm run sync-plan</code> (or double-click sync-plan.bat) to
                pull your latest to-dos from the vault.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-accent" />
              Happening now
            </CardTitle>
            <CardDescription>Current pulse across the live portal and the operating plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentPulse.map((item) => (
              <div key={item} className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <p className="text-muted-foreground">{item}</p>
              </div>
            ))}
            {recentProofJobs.length > 0 && (
              <div className="space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Landmark className="h-4 w-4 text-accent" />
                  POPs needing confirmation
                </div>
                {recentProofJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/portal/employee/jobs/${job.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-accent"
                  >
                    <span className="min-w-0 truncate">{job.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {job.deposit_proof_uploaded_at ? timeAgo(job.deposit_proof_uploaded_at) : 'uploaded'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-accent" />
              Quotes summary
            </CardTitle>
            <CardDescription>Pipeline view from the quote request workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
                <p className="mt-2 text-2xl font-bold">{pendingQuotesCount}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Open</p>
                <p className="mt-2 text-2xl font-bold">{openQuotesCount}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Accepted</p>
                <p className="mt-2 text-2xl font-bold">{acceptedQuotesCount}</p>
              </div>
            </div>
            {latestQuote ? (
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{latestQuote.customer_name}</p>
                  <Badge variant={quoteBadgeVariant[latestQuote.status]}>{latestQuote.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{latestQuote.system_type}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Latest update {timeAgo(latestQuote.created_at)}
                  {latestQuote.total_amount != null ? ` · ${formatCurrency(latestQuote.total_amount)}` : ''}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No quote activity yet.
              </div>
            )}
            <Link href="/portal/employee/quotes" className="inline-flex items-center gap-1 text-sm font-medium text-accent">
              Open quotes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-accent" />
              Customers, sites, and store
            </CardTitle>
            <CardDescription>Live markers from registrations, installations, and online sales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isManager ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Customers</p>
                    <p className="mt-2 text-2xl font-bold">{activeCustomersCount}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Active products</p>
                    <p className="mt-2 text-2xl font-bold">{activeProductsCount}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Active sites</p>
                    <p className="mt-2 text-2xl font-bold">{activeSitesCount}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending sites</p>
                    <p className="mt-2 text-2xl font-bold">{pendingSitesCount}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div>
                      <p className="font-medium text-sm">Traffic analytics still missing</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Store sales are live from orders, but website clicks still need a proper analytics source before they can be shown honestly.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Customer, site, and store rollups are reserved for managers and admins. Your dashboard stays focused on jobs and quotes.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={`grid gap-4 ${isManager ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-accent" />
              Recent quote activity
            </CardTitle>
            <CardDescription>Most recent submissions in the pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentQuotes.length ? (
              recentQuotes.map((quote) => (
                <div key={quote.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{quote.customer_name}</p>
                    <Badge variant={quoteBadgeVariant[quote.status]}>{quote.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{quote.system_type}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {timeAgo(quote.created_at)}
                    {quote.quote_number ? ` · ${quote.quote_number}` : ''}
                    {quote.total_amount != null ? ` · ${formatCurrency(quote.total_amount)}` : ''}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No quote requests to show yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-accent" />
              Recent job activity
            </CardTitle>
            <CardDescription>{isManager ? 'Latest jobs across the team.' : 'Latest jobs assigned to you.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentJobs.length ? (
              recentJobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{job.title}</p>
                    <div className="flex items-center gap-2">
                      {job.deposit_proof_url && !job.deposit_confirmed_at && (
                        <Badge variant="accent">POP uploaded</Badge>
                      )}
                      <Badge variant={priorityVariant[job.priority]}>{job.priority}</Badge>
                      <Badge variant={jobStatusVariant[job.status]}>{job.status.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {(job.site?.name ?? 'No site linked')}
                    {job.scheduled_date ? ` · ${formatDate(job.scheduled_date)}` : ''}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {timeAgo(job.created_at)}
                    {isManager && job.assignee?.full_name ? ` · ${job.assignee.full_name}` : ''}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No jobs to show yet.
              </div>
            )}
          </CardContent>
        </Card>

        {isManager && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-accent" />
                Recent business activity
              </CardTitle>
              <CardDescription>Customers and store events currently visible in the portal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-accent" />
                  New customer accounts
                </div>
                {recentCustomers.length ? (
                  recentCustomers.map((customer) => {
                    const siteCount = customer.sites?.length ?? 0
                    return (
                      <div key={customer.id} className="rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{customer.full_name}</p>
                          <Badge variant="outline">{siteCount} site{siteCount === 1 ? '' : 's'}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{customer.email}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{timeAgo(customer.created_at)}</p>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No customers registered yet.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShoppingCart className="h-4 w-4 text-accent" />
                  Recent store orders
                </div>
                {recentOrders.length ? (
                  recentOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{order.customer?.full_name ?? 'Customer order'}</p>
                        <Badge variant={order.status === 'paid' ? 'success' : 'default'}>{order.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {order.total != null ? formatCurrency(order.total) : 'No total captured'}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">{timeAgo(order.created_at)}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No store orders yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/portal/employee/jobs">
          <Card className="h-full transition-colors hover:border-accent">
            <CardContent className="flex h-full items-center justify-between gap-3 p-5">
              <div>
                <p className="font-semibold">Jobs board</p>
                <p className="mt-1 text-sm text-muted-foreground">Open scheduling and execution</p>
              </div>
              <Briefcase className="h-5 w-5 text-accent" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/employee/quotes">
          <Card className="h-full transition-colors hover:border-accent">
            <CardContent className="flex h-full items-center justify-between gap-3 p-5">
              <div>
                <p className="font-semibold">Quotes pipeline</p>
                <p className="mt-1 text-sm text-muted-foreground">Review surveys and generated quotes</p>
              </div>
              <FileText className="h-5 w-5 text-accent" />
            </CardContent>
          </Card>
        </Link>
        <Link href={isManager ? '/portal/employee/metrics' : '/portal/employee/profile'}>
          <Card className="h-full transition-colors hover:border-accent">
            <CardContent className="flex h-full items-center justify-between gap-3 p-5">
              <div>
                <p className="font-semibold">{isManager ? 'Detailed metrics' : 'My profile'}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isManager ? 'Open the dedicated metrics page' : 'View your account details'}
                </p>
              </div>
              {isManager ? <Globe className="h-5 w-5 text-accent" /> : <UserRound className="h-5 w-5 text-accent" />}
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
