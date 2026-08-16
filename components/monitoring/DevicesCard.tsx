'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2, Cpu, Sun, Zap, BatteryCharging, Router, Gauge, Boxes } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { InventoryDevice, DeviceRole } from '@/lib/monitoring/devices'

/**
 * What is physically installed on site, read back from the brand cloud.
 * The headline numbers are bank totals, not one unit's nameplate — three
 * Quattro 48/15000 in parallel reads 45 kVA / 36 kW here.
 */

const ROLE_META: Record<DeviceRole, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  inverter:    { label: 'Inverter',        icon: Zap,             color: 'text-accent' },
  mppt:        { label: 'MPPT',            icon: Sun,             color: 'text-yellow-500' },
  pv_inverter: { label: 'PV inverter',     icon: Sun,             color: 'text-yellow-500' },
  battery:     { label: 'Battery',         icon: BatteryCharging, color: 'text-green-500' },
  gateway:     { label: 'Gateway',         icon: Router,          color: 'text-muted-foreground' },
  meter:       { label: 'Meter',           icon: Gauge,           color: 'text-muted-foreground' },
  other:       { label: 'Other',           icon: Boxes,           color: 'text-muted-foreground' },
}

// Inverters first, ancillaries last — the order an installer would read them.
const ROLE_ORDER: DeviceRole[] = ['inverter', 'mppt', 'pv_inverter', 'battery', 'meter', 'gateway', 'other']

interface Props {
  systemId: string
  canRefresh: boolean
  devices: InventoryDevice[] | null
  inverterKva: number | null
  inverterKw: number | null
  inverterCount: number | null
  mpptKw: number | null
  pvInverterCount: number | null
  batteryKwh: number | null
  syncedAt: string | null
}

function num(n: number | null | undefined, unit: string, decimals = 1) {
  if (n == null) return '—'
  return `${n.toLocaleString('en-ZA', { maximumFractionDigits: decimals })} ${unit}`
}

export function DevicesCard({
  systemId, canRefresh, devices, inverterKva, inverterKw, inverterCount,
  mpptKw, pvInverterCount, batteryKwh, syncedAt,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/devices`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `Refresh failed (${res.status})`)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const sorted = [...(devices ?? [])].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Cpu className="h-4 w-4" /> Installed equipment</CardTitle>
            <CardDescription>
              Read from the brand portal — totals are for the whole bank, not one unit.
              {syncedAt && ` Last read ${new Date(syncedAt).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}.`}
            </CardDescription>
          </div>
          {canRefresh && (
            <button
              type="button" onClick={refresh} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {busy ? 'Reading…' : 'Refresh devices'}
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Inverter capacity</p>
            <p className="mt-1 font-semibold tabular-nums">{num(inverterKw, 'kW')}</p>
            <p className="text-xs text-muted-foreground">
              {inverterKva != null ? `${inverterKva} kVA` : '—'}
              {inverterCount && inverterCount > 1 ? ` · ${inverterCount} units` : ''}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">MPPT capacity</p>
            <p className="mt-1 font-semibold tabular-nums">{num(mpptKw, 'kW')}</p>
            <p className="text-xs text-muted-foreground">max DC array the chargers carry</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">AC-coupled PV</p>
            <p className="mt-1 font-semibold tabular-nums">{pvInverterCount ? `${pvInverterCount} inverters` : '—'}</p>
            <p className="text-xs text-muted-foreground">PV on the AC side</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Battery</p>
            <p className="mt-1 font-semibold tabular-nums">{num(batteryKwh, 'kWh')}</p>
            <p className="text-xs text-muted-foreground">from the BMS</p>
          </div>
        </div>

        {sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Device</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Role</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rating</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d, i) => {
                  const meta = ROLE_META[d.role] ?? ROLE_META.other
                  const Icon = meta.icon
                  const rating = d.kva != null
                    ? `${d.kva} kVA${d.kw != null ? ` / ${d.kw} kW` : ''}`
                    : d.pv_kw != null ? `${d.pv_kw} kW PV`
                    : d.kwh != null ? `${d.kwh} kWh`
                    : '—'
                  return (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium">{d.model}</p>
                        {d.detail && <p className="text-xs text-muted-foreground">{d.detail}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon className={`h-3.5 w-3.5 ${meta.color}`} /> {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.count}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {rating}
                        {d.count > 1 && (d.kva != null || d.pv_kw != null) && (
                          <span className="ml-1 text-xs text-muted-foreground">each</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No device list read yet{canRefresh ? ' — hit “Refresh devices”.' : '.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
