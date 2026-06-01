import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, Users, Briefcase, MapPin, FileText, ArrowUpRight } from 'lucide-react'

export default async function MetricsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (!['manager', 'admin'].includes(profile?.role ?? '')) redirect('/portal/employee/jobs')

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString()

  const [
    { data: thisMonthOrders },
    { data: lastMonthOrders },
    { count: activeJobsCount },
    { count: completedJobsCount },
    { count: activeCustomersCount },
    { count: activeSitesCount },
    { count: openQuotesCount },
  ] = await Promise.all([
    supabase.from('orders').select('total').eq('status', 'paid').gte('created_at', thisMonthStart),
    supabase.from('orders').select('total').eq('status', 'paid').gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('completed_at', thisMonthStart),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('sites').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('quotes').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent']),
  ])

  const thisRevenue = (thisMonthOrders ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0)
  const lastRevenue = (lastMonthOrders ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0)
  const revGrowth = lastRevenue > 0 ? Math.round(((thisRevenue - lastRevenue) / lastRevenue) * 100) : null

  const tiles = [
    {
      label:  'Revenue this month',
      value:  formatCurrency(thisRevenue),
      sub:    revGrowth !== null ? `${revGrowth > 0 ? '+' : ''}${revGrowth}% vs last month` : 'First month of data',
      icon:   TrendingUp,
      accent: true,
    },
    {
      label:  'Active jobs',
      value:  String(activeJobsCount ?? 0),
      sub:    'pending + in progress',
      icon:   Briefcase,
    },
    {
      label:  'Jobs completed this month',
      value:  String(completedJobsCount ?? 0),
      sub:    'completed this calendar month',
      icon:   ArrowUpRight,
    },
    {
      label:  'Active customers',
      value:  String(activeCustomersCount ?? 0),
      sub:    'registered customer accounts',
      icon:   Users,
    },
    {
      label:  'Active sites',
      value:  String(activeSitesCount ?? 0),
      sub:    'registered + active installations',
      icon:   MapPin,
    },
    {
      label:  'Open quotes',
      value:  String(openQuotesCount ?? 0),
      sub:    'draft or sent, not yet accepted',
      icon:   FileText,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Company Metrics</h1>
        <p className="text-muted-foreground mt-1">Business performance at a glance</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label} className={accent ? 'border-accent' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                {label}
                <Icon className={`h-4 w-4 shrink-0 ${accent ? 'text-accent' : 'text-muted-foreground'}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${accent ? 'text-accent' : 'text-foreground'}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
