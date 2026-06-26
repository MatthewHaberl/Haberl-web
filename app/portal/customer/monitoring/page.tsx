import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight, Sun, BatteryCharging, AlertTriangle, Activity } from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SystemStatusBadge } from '@/components/monitoring/SystemStatusBadge'
import type { DeviceState } from '@/lib/monitoring/types'

export const metadata: Metadata = { title: 'My Solar Systems' }

const BRAND_LABELS: Record<string, string> = {
  sunsynk: 'Sunsynk', sigenergy: 'Sigenergy', foxess: 'FoxESS',
  deye: 'Deye', growatt: 'Growatt', victron: 'Victron',
  goodwe: 'GoodWe', solax: 'SolaX', solis: 'Solis',
  huawei: 'Huawei', dessmonitor: 'SmartESS', luxpower: 'LuxPower', local: 'Local',
}

export default async function CustomerMonitoringPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  // Get customer's monitoring systems via their sites
  const { data: systems } = await supabase
    .from('monitoring_systems')
    .select(`
      id, brand, label, capacity_kw, battery_kwh,
      last_polled_at, poll_error,
      sites ( id, name, address )
    `)
    .eq('enabled', true)
    .order('created_at')

  const systemIds = (systems ?? []).map((s) => s.id)
  type LatestReading = { device_state: string | null; pv_power_w: number | null; battery_soc_pct: number | null }
  const latestReadings: Record<string, LatestReading> = {}

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

  // Get open alerts for customer's systems
  const openAlertCounts: Record<string, number> = {}
  if (systemIds.length > 0) {
    const { data: alertCounts } = await supabase
      .from('monitoring_alert_events')
      .select('system_id')
      .in('system_id', systemIds)
      .is('resolved_at', null)
    for (const a of alertCounts ?? []) {
      openAlertCounts[a.system_id] = (openAlertCounts[a.system_id] ?? 0) + 1
    }
  }

  if (!systems?.length) {
    return (
      <PageShell width="content">
        <PageHeader icon={Activity} title="My Solar Systems" />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sun className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-semibold">No systems connected yet</p>
            <p className="text-sm text-muted-foreground">
              Once your system is live, Haberl will link it to your account and you&apos;ll see real-time data here.
            </p>
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell width="content">
      <PageHeader
        icon={Activity}
        title="My Solar Systems"
        description="Live monitoring for all your installations"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(systems ?? []).map((system) => {
          const siteArr = system.sites as unknown as Array<{ id: string; name: string; address: string }>
          const site = Array.isArray(siteArr) ? siteArr[0] : (siteArr as unknown as typeof siteArr[0])
          const reading = latestReadings[system.id]
          const alertCount = openAlertCounts[system.id] ?? 0
          const hasError = !!system.poll_error
          const state = (reading?.device_state as DeviceState) ?? 'unknown'

          return (
            <Link key={system.id} href={`/portal/customer/monitoring/${system.id}`}>
              <Card className="h-full transition-colors hover:border-accent">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{site?.name ?? 'My System'}</CardTitle>
                      {site?.address && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{site.address}</p>
                      )}
                    </div>
                    <SystemStatusBadge state={hasError ? 'fault' : state} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border p-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-yellow-500">
                        <Sun className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Solar</span>
                      </div>
                      <p className="mt-1 text-lg font-bold tabular-nums">
                        {reading?.pv_power_w != null
                          ? `${(reading.pv_power_w / 1000).toFixed(2)} kW`
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-green-500">
                        <BatteryCharging className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Battery</span>
                      </div>
                      <p className="mt-1 text-lg font-bold tabular-nums">
                        {reading?.battery_soc_pct != null
                          ? `${reading.battery_soc_pct.toFixed(0)}%`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{BRAND_LABELS[system.brand] ?? system.brand}</Badge>
                    {alertCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {alertCount} alert{alertCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </PageShell>
  )
}
