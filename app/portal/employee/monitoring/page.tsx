import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AlertTriangle, Activity, Zap, BatteryCharging, Map, Bell, Settings2, ChevronRight, Clock, Plus } from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SystemStatusBadge } from '@/components/monitoring/SystemStatusBadge'
import type { DeviceState } from '@/lib/monitoring/types'

export const metadata: Metadata = { title: 'Monitoring — Fleet Overview' }

const BRAND_LABELS: Record<string, string> = {
  sunsynk: 'Sunsynk', sigenergy: 'Sigenergy', foxess: 'FoxESS',
  deye: 'Deye', growatt: 'Growatt', victron: 'Victron',
  goodwe: 'GoodWe', solax: 'SolaX', solis: 'Solis',
  huawei: 'Huawei', luxpower: 'LuxPower', local: 'Local',
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'Never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.floor(diffMs / 60000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function isStale(lastPolledAt: string | null | undefined): boolean {
  if (!lastPolledAt) return true
  return Date.now() - new Date(lastPolledAt).getTime() > 20 * 60 * 1000 // > 20 min = stale
}

type SystemRow = {
  id: string
  brand: string
  label: string | null
  capacity_kw: number | null
  battery_kwh: number | null
  enabled: boolean
  last_polled_at: string | null
  poll_error: string | null
  site_id: string | null
  site_name: string | null
  customer_name: string | null
  latest_state: DeviceState | null
  latest_pv_w: number | null
  latest_soc: number | null
}

export default async function MonitoringFleetPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  // Fetch all monitoring systems with their latest reading
  const { data: systems } = await supabase
    .from('monitoring_systems')
    .select(`
      id, brand, label, capacity_kw, battery_kwh, enabled,
      last_polled_at, poll_error, site_id,
      sites (
        name,
        customer:customers ( full_name )
      )
    `)
    .order('created_at')

  // Fetch latest reading per system
  const systemIds = (systems ?? []).map((s) => s.id)
  type LatestReading = { device_state: string | null; pv_power_w: number | null; battery_soc_pct: number | null }
  const latestReadings: Record<string, LatestReading> = {}

  if (systemIds.length > 0) {
    for (const sysId of systemIds) {
      const { data: reading } = await supabase
        .from('monitoring_readings')
        .select('device_state, pv_power_w, battery_soc_pct')
        .eq('system_id', sysId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()
      if (reading) latestReadings[sysId] = reading as LatestReading
    }
  }

  // Fetch open alert count
  const { count: openAlerts } = await supabase
    .from('monitoring_alert_events')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null)

  const rows: SystemRow[] = (systems ?? []).map((s) => {
    const siteArr = s.sites as unknown as Array<{ name: string; customer: Array<{ full_name: string }> | { full_name: string } | null }> | null
    const site = Array.isArray(siteArr) ? siteArr[0] : siteArr
    const customerArr = site?.customer
    const customer = Array.isArray(customerArr) ? customerArr[0] : customerArr
    const reading = latestReadings[s.id]
    return {
      id: s.id,
      brand: s.brand,
      label: s.label,
      capacity_kw: s.capacity_kw,
      battery_kwh: s.battery_kwh,
      enabled: s.enabled,
      last_polled_at: s.last_polled_at,
      poll_error: s.poll_error,
      site_id: s.site_id,
      site_name: site?.name ?? null,
      customer_name: customer?.full_name ?? null,
      latest_state: (reading?.device_state as DeviceState) ?? null,
      latest_pv_w: reading?.pv_power_w ?? null,
      latest_soc: reading?.battery_soc_pct ?? null,
    }
  })

  const totalSystems = rows.length
  const onlineSystems = rows.filter((r) => r.latest_state === 'online').length
  const faultSystems  = rows.filter((r) => r.latest_state === 'fault' || r.poll_error).length
  const totalKw = rows.reduce((sum, r) => sum + (r.capacity_kw ?? 0), 0)
  const currentPvKw = rows.reduce((sum, r) => sum + ((r.latest_pv_w ?? 0) / 1000), 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monitoring — Fleet Overview</h1>
          <p className="text-sm text-muted-foreground">All inverter systems across all sites</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/portal/employee/monitoring/map"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Map className="h-4 w-4" /> Map view
          </Link>
          <Link
            href="/portal/employee/monitoring/alerts"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Bell className="h-4 w-4" />
            Alerts
            {(openAlerts ?? 0) > 0 && (
              <span className="rounded-full bg-destructive px-1.5 py-0.5 text-xs font-bold text-white">
                {openAlerts}
              </span>
            )}
          </Link>
          <Link
            href="/portal/employee/monitoring/new"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add system
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Total systems
              <Activity className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalSystems}</p>
            <p className="mt-1 text-xs text-muted-foreground">{onlineSystems} online right now</p>
          </CardContent>
        </Card>

        <Card className={faultSystems > 0 ? 'border-destructive/40' : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Faults / errors
              <AlertTriangle className={`h-4 w-4 ${faultSystems > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${faultSystems > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {faultSystems}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">systems need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Total capacity
              <Zap className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalKw.toFixed(1)} kW</p>
            <p className="mt-1 text-xs text-muted-foreground">installed across all sites</p>
          </CardContent>
        </Card>

        <Card className="border-accent/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Generating now
              <BatteryCharging className="h-4 w-4 text-accent" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-accent">{currentPvKw.toFixed(2)} kW</p>
            <p className="mt-1 text-xs text-muted-foreground">live PV output across fleet</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {totalSystems === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Settings2 className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-semibold">No monitoring systems added yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect an installed inverter to its cloud platform to see live performance, alerts and customer dashboards.
              </p>
            </div>
            <Link
              href="/portal/employee/monitoring/new"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add your first system
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Systems table */}
      {totalSystems > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All systems</CardTitle>
            <CardDescription>Click a row to open the site detail and live readings.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Site / System</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Brand</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">PV now</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">SOC</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last poll</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const stale = isStale(row.last_polled_at)
                    const hasError = !!row.poll_error
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border transition-colors hover:bg-muted/30 ${hasError ? 'bg-destructive/5' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.site_name ?? '—'}</p>
                          {row.label && <p className="text-xs text-muted-foreground">{row.label}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{BRAND_LABELS[row.brand] ?? row.brand}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {hasError ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                              <span className="h-2 w-2 rounded-full bg-destructive" />
                              Poll error
                            </span>
                          ) : (
                            <SystemStatusBadge state={stale ? 'offline' : row.latest_state} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {row.latest_pv_w != null
                            ? `${(row.latest_pv_w / 1000).toFixed(2)} kW`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {row.latest_soc != null
                            ? `${row.latest_soc.toFixed(0)}%`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs ${stale ? 'text-destructive' : 'text-muted-foreground'}`}>
                            <Clock className="h-3 w-3" />
                            {timeAgo(row.last_polled_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {row.customer_name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/portal/employee/monitoring/${row.id}`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
