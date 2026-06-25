'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  BRAND_CONNECT, BRAND_ORDER, ACCESS_LABEL,
  type BrandField,
} from '@/lib/monitoring/brand-fields'
import type { BrandCredentials, MonitoringBrand } from '@/lib/monitoring/types'
import { CheckCircle2, ExternalLink, Info, Loader2, PlugZap, Save, XCircle } from 'lucide-react'

export interface SiteOption {
  id: string
  name: string
  customer_name: string | null
}

interface TestResult {
  ok: boolean
  error?: string
  sample?: {
    recorded_at: string
    device_state: string
    pv_power_w: number | null
    battery_soc_pct: number | null
    grid_power_w: number | null
    load_power_w: number | null
    pv_string_count: number
  }
}

const selectClass =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

const accessBadgeVariant: Record<string, 'default' | 'outline'> = {
  easy: 'outline', 'self-serve': 'outline', application: 'default', 'local-only': 'default',
}

export function AddSystemForm({ sites }: { sites: SiteOption[] }) {
  const router = useRouter()

  const [siteId, setSiteId] = useState('')
  const [brand, setBrand] = useState<MonitoringBrand>('victron')
  const [label, setLabel] = useState('')
  const [capacityKw, setCapacityKw] = useState('')
  const [batteryKwh, setBatteryKwh] = useState('')
  // Field values keyed by BrandField.key (covers credentials + plant_id + device_sn)
  const [values, setValues] = useState<Record<string, string>>({})

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const schema = BRAND_CONNECT[brand]

  function changeBrand(next: MonitoringBrand) {
    setBrand(next)
    setValues({})
    setTestResult(null)
    setError('')
  }

  function setField(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setTestResult(null)
  }

  /** Split the flat values map into the API payload shape. */
  const buildConnection = useMemo(
    () => () => {
      const credentials: BrandCredentials = {}
      let plant_id: string | null = null
      let device_sn: string | null = null
      for (const f of schema.fields) {
        const v = (values[f.key] ?? '').trim()
        if (!v) continue
        if (f.target === 'credential') credentials[f.key] = v
        else if (f.target === 'plant_id') plant_id = v
        else if (f.target === 'device_sn') device_sn = v
      }
      return { credentials, plant_id, device_sn }
    },
    [schema, values],
  )

  /** Returns an error string if the form is incomplete, else null. */
  function validate(needSite: boolean): string | null {
    if (needSite && !siteId) return 'Choose which site this system belongs to.'
    for (const f of schema.fields) {
      if (f.required && !(values[f.key] ?? '').trim()) return `${f.label} is required.`
    }
    // Growatt: needs a token OR a username+password pair.
    if (brand === 'growatt') {
      const hasToken = !!(values.api_token ?? '').trim()
      const hasLogin = !!(values.username ?? '').trim() && !!(values.password ?? '').trim()
      if (!hasToken && !hasLogin) return 'Provide an API token, or a username and password.'
    }
    return null
  }

  async function testConnection() {
    const v = validate(false)
    if (v) { setError(v); return }
    setError('')
    setTesting(true)
    setTestResult(null)
    try {
      const conn = buildConnection()
      const res = await fetch('/api/monitoring/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, ...conn }),
      })
      const data = (await res.json()) as TestResult
      setTestResult(data)
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    const v = validate(true)
    if (v) { setError(v); return }
    setError('')
    setSaving(true)
    try {
      const conn = buildConnection()
      const res = await fetch('/api/monitoring/systems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          brand,
          label: label.trim() || null,
          capacity_kw: capacityKw ? Number(capacityKw) : null,
          battery_kwh: batteryKwh ? Number(batteryKwh) : null,
          ...conn,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Save failed (${res.status})`)
        setSaving(false)
        return
      }
      router.push('/portal/employee/monitoring')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {/* Site + brand */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Site *</span>
            <select className={selectClass} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Select a site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.customer_name ? ` — ${s.customer_name}` : ''}
                </option>
              ))}
            </select>
            {sites.length === 0 && (
              <span className="text-xs text-destructive">
                No sites yet. Open a customer and use <strong>Add site</strong> first —{' '}
                <Link href="/portal/employee/customers" className="underline hover:text-foreground">go to Customers</Link>.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Inverter brand *</span>
            <select className={selectClass} value={brand} onChange={(e) => changeBrand(e.target.value as MonitoringBrand)}>
              {BRAND_ORDER.map((b) => (
                <option key={b} value={b}>{BRAND_CONNECT[b].label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">System size (kWp)</span>
              <Input value={capacityKw} onChange={(e) => setCapacityKw(e.target.value)} inputMode="decimal" placeholder="e.g. 8" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Battery (kWh)</span>
              <Input value={batteryKwh} onChange={(e) => setBatteryKwh(e.target.value)} inputMode="decimal" placeholder="e.g. 12" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Label (optional)</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Roof inverter, Garage" />
          </label>
        </CardContent>
      </Card>

      {/* Access guidance */}
      <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{schema.label}</span>
            <Badge variant={accessBadgeVariant[schema.access]}>{ACCESS_LABEL[schema.access]}</Badge>
          </div>
          <p className="text-muted-foreground">{schema.accessHelp}</p>
          {schema.docsUrl && (
            <a href={schema.docsUrl} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              API docs <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Credential / locator fields, or cloudless note */}
      {schema.cloudless ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            This brand can&apos;t be connected from here — it needs an on-site collector.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 pt-5">
              {schema.fields.map((f: BrandField) => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {f.label}{f.required ? ' *' : ''}
                  </span>
                  <Input
                    type={f.type === 'password' ? 'password' : 'text'}
                    autoComplete="off"
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground/80">{f.help}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
              testResult.ok ? 'border-accent/40 bg-accent/5' : 'border-destructive/40 bg-destructive/5'
            }`}>
              {testResult.ok
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
              {testResult.ok && testResult.sample ? (
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-accent">Connected — live data received.</span>
                  <span className="text-muted-foreground">
                    State: <strong>{testResult.sample.device_state}</strong>
                    {testResult.sample.pv_power_w != null && <> · PV {(testResult.sample.pv_power_w / 1000).toFixed(2)} kW</>}
                    {testResult.sample.battery_soc_pct != null && <> · SOC {testResult.sample.battery_soc_pct.toFixed(0)}%</>}
                    {testResult.sample.pv_string_count > 0 && <> · {testResult.sample.pv_string_count} string(s)</>}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-destructive">Couldn&apos;t connect.</span>
                  <span className="text-muted-foreground">{testResult.error}</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={testConnection} disabled={testing || saving}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Test connection
            </Button>
            <Button variant="accent" onClick={save} disabled={saving || testing}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save system
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: run <strong>Test connection</strong> first — once it shows live data, save it. Polling then keeps it updated automatically.
          </p>
        </>
      )}
    </div>
  )
}
