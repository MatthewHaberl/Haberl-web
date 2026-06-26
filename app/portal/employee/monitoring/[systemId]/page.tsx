import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, AlertTriangle, Info, RefreshCw, Activity, Settings2 } from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SystemStatusBadge } from '@/components/monitoring/SystemStatusBadge'
import { PageShell, PageHeader } from '@/components/layout/page'
import { PowerGauges } from '@/components/monitoring/PowerGauges'
import { EnergyChart } from '@/components/monitoring/EnergyChart'
import { SystemActions } from '@/components/monitoring/SystemActions'
import type { DeviceState } from '@/lib/monitoring/types'

export const metadata: Metadata = { title: 'Site Monitoring Detail' }

const BRAND_LABELS: Record<string, string> = {
  sunsynk: 'Sunsynk', sigenergy: 'Sigenergy', foxess: 'FoxESS',
  deye: 'Deye', growatt: 'Growatt', victron: 'Victron',
  goodwe: 'GoodWe', solax: 'SolaX', solis: 'Solis',
  huawei: 'Huawei', luxpower: 'LuxPower', local: 'Local',
}

function fmt(n: number | null, decimals = 1) {
  return n != null ? n.toFixed(decimals) : '—'
}

export default async function SystemDetailPage({ params }: { params: { systemId: string } }) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  // Fetch the monitoring system
  const { data: system } = await supabase
    .from('monitoring_systems')
    .select(`
      id, brand, label, plant_id, device_sn,
      capacity_kw, battery_kwh, enabled,
      last_polled_at, poll_error,
      sites ( id, name, address, customer:customers ( full_name, email, phone ) )
    `)
    .eq('id', params.systemId)
    .single()

  if (!system) notFound()

  const siteArr = system.sites as unknown as Array<{
    id: string; name: string; address: string
    customer: Array<{ full_name: string; email: string; phone: string | null }> | null
  }>
  const site     = Array.isArray(siteArr) ? siteArr[0] : (siteArr as unknown as typeof siteArr[0])
  const custArr  = site?.customer
  const customer = Array.isArray(custArr) ? custArr[0] : custArr

  // Latest reading
  const { data: latest } = await supabase
    .from('monitoring_readings')
    .select('*')
    .eq('system_id', system.id)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()

  // Open alert events
  const { data: openAlerts } = await supabase
    .from('monitoring_alert_events')
    .select('id, message, severity, triggered_at')
    .eq('system_id', system.id)
    .is('resolved_at', null)
    .order('triggered_at', { ascending: false })
    .limit(10)

  const pvStrings = (latest?.pv_strings as Array<{ string: number; voltage_v: number | null; current_a: number | null; power_w: number | null }> | null) ?? []
  const faultCodes: string[] = latest?.fault_codes ?? []

  const lastPollAge = latest?.recorded_at
    ? Math.floor((Date.now() - new Date(latest.recorded_at).getTime()) / 60000)
    : null

  return (
    <PageShell width="wide">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/portal/employee/monitoring"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Fleet overview
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{site?.name ?? 'System detail'}</span>
      </div>

      {/* Header */}
      <PageHeader
        icon={Activity}
        title={
          <span className="flex items-center gap-2">
            {site?.name ?? '—'}
            <SystemStatusBadge state={(latest?.device_state as DeviceState) ?? 'unknown'} />
            {!system.enabled && <Badge variant="outline">Polling paused</Badge>}
          </span>
        }
        description={
          <>
            {BRAND_LABELS[system.brand] ?? system.brand}
            {system.label && ` · ${system.label}`}
            {site?.address && ` · ${site.address}`}
          </>
        }
        actions={
          <>
            <Badge variant="outline">{BRAND_LABELS[system.brand] ?? system.brand}</Badge>
            {lastPollAge != null && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3" />
                {lastPollAge < 1 ? 'just now' : `${lastPollAge}m ago`}
              </span>
            )}
            <Link
              href={`/portal/employee/monitoring/${system.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Settings2 className="h-4 w-4" /> Edit connection
            </Link>
          </>
        }
      />

      {/* Poll error banner */}
      {system.poll_error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Polling error</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{system.poll_error}</p>
            <Link
              href={`/portal/employee/monitoring/${system.id}/edit`}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-destructive hover:underline"
            >
              <Settings2 className="h-3.5 w-3.5" /> Check the ID &amp; API key
            </Link>
          </div>
        </div>
      )}

      {/* Open alerts */}
      {(openAlerts?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          {(openAlerts ?? []).map((alert) => (
            <div key={alert.id} className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-sm">{alert.message}</p>
              <Badge variant="outline" className="ml-auto shrink-0">{alert.severity}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Power gauges */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Live power flow</h2>
        <PowerGauges
          pvPowerW={latest?.pv_power_w ?? null}
          batteryPowerW={latest?.battery_power_w ?? null}
          gridPowerW={latest?.grid_power_w ?? null}
          loadPowerW={latest?.load_power_w ?? null}
          batterySocPct={latest?.battery_soc_pct ?? null}
          capacityKw={system.capacity_kw}
        />
      </div>

      {/* Energy chart */}
      <Card>
        <CardHeader>
          <CardTitle>Power history — last 24 hours</CardTitle>
          <CardDescription>Polled every 5 minutes. Solar, load, battery, and grid.</CardDescription>
        </CardHeader>
        <CardContent>
          <EnergyChart systemId={system.id} hours={24} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* String data */}
        <Card>
          <CardHeader>
            <CardTitle>PV strings</CardTitle>
            <CardDescription>Per-string voltage, current, and power from latest reading.</CardDescription>
          </CardHeader>
          <CardContent>
            {pvStrings.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">String</th>
                    <th className="pb-2 font-medium text-right">Voltage (V)</th>
                    <th className="pb-2 font-medium text-right">Current (A)</th>
                    <th className="pb-2 font-medium text-right">Power (W)</th>
                  </tr>
                </thead>
                <tbody>
                  {pvStrings.map((s) => (
                    <tr key={s.string} className="border-b border-border last:border-0">
                      <td className="py-2 font-medium">String {s.string}</td>
                      <td className="py-2 text-right font-mono">{fmt(s.voltage_v)}</td>
                      <td className="py-2 text-right font-mono">{fmt(s.current_a, 2)}</td>
                      <td className="py-2 text-right font-mono">{fmt(s.power_w, 0)} W</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">No string data in latest reading.</p>
            )}
          </CardContent>
        </Card>

        {/* System info */}
        <Card>
          <CardHeader>
            <CardTitle>System info</CardTitle>
            <CardDescription>Installation and monitoring configuration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Inverter capacity</p>
                <p className="mt-1 font-semibold">{system.capacity_kw ? `${system.capacity_kw} kW` : '—'}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Battery capacity</p>
                <p className="mt-1 font-semibold">{system.battery_kwh ? `${system.battery_kwh} kWh` : '—'}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Grid frequency</p>
                <p className="mt-1 font-mono">{latest?.grid_frequency_hz ? `${latest.grid_frequency_hz.toFixed(2)} Hz` : '—'}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Inverter temp</p>
                <p className="mt-1 font-mono">{latest?.inverter_temp_c ? `${latest.inverter_temp_c.toFixed(1)} °C` : '—'}</p>
              </div>
            </div>

            {faultCodes.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-xs font-medium text-destructive">Active fault codes</p>
                  <p className="mt-1 font-mono text-xs">{faultCodes.join(', ')}</p>
                </div>
              </div>
            )}

            {customer && (
              <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{customer.full_name}</p>
                  <p className="text-xs text-muted-foreground">{customer.email}</p>
                  {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Plant ID / Device SN</p>
              <p className="mt-1 font-mono text-xs">{system.plant_id ?? '—'} / {system.device_sn ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manage system */}
      <Card>
        <CardHeader>
          <CardTitle>Manage system</CardTitle>
          <CardDescription>
            Disable to stop polling while keeping history, or delete to remove it permanently.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/portal/employee/monitoring/${system.id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Settings2 className="h-4 w-4" /> Edit connection
          </Link>
          <SystemActions systemId={system.id} enabled={system.enabled} systemName={site?.name ?? 'this system'} />
        </CardContent>
      </Card>
    </PageShell>
  )
}
