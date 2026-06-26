'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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

/** An existing system being edited. Credentials are intentionally absent — they
 *  are never sent to the client; blank credential fields keep the saved value. */
export interface ExistingSystem {
  id: string
  site_id: string | null
  brand: MonitoringBrand
  label: string | null
  capacity_kw: number | null
  battery_kwh: number | null
  plant_id: string | null
  device_sn: string | null
  brand_account_id: string | null
}

/** A saved, reusable per-brand credential set the form can attach instead of
 *  asking for a key again. */
export interface BrandAccountOption {
  id: string
  brand: MonitoringBrand
  name: string
}

/** Sentinel for "enter a one-off key for just this site" in the connection picker. */
const OWN_KEY = '__own__'

/** Pre-fill the field map for edit mode: only the non-secret locator fields
 *  (plant_id / device_sn) carry over; credential fields stay blank. */
function initialValues(
  schema: { fields: BrandField[] },
  existing: ExistingSystem | undefined,
): Record<string, string> {
  const v: Record<string, string> = {}
  if (!existing) return v
  for (const f of schema.fields) {
    if (f.target === 'plant_id' && existing.plant_id) v[f.key] = existing.plant_id
    else if (f.target === 'device_sn' && existing.device_sn) v[f.key] = existing.device_sn
  }
  return v
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

const accessBadgeVariant: Record<string, 'default' | 'outline'> = {
  easy: 'outline', 'self-serve': 'outline', application: 'default', 'local-only': 'default',
}

export function AddSystemForm({
  sites,
  existing,
  initialSiteId,
  accounts = [],
}: {
  sites: SiteOption[]
  existing?: ExistingSystem
  /** Preselect this site when arriving from a customer's site card (new-system mode only). */
  initialSiteId?: string
  /** Saved per-brand connections available to attach instead of a one-off key. */
  accounts?: BrandAccountOption[]
}) {
  const router = useRouter()
  const editMode = !!existing

  const [siteId, setSiteId] = useState(
    existing?.site_id ??
      (initialSiteId && sites.some((s) => s.id === initialSiteId) ? initialSiteId : ''),
  )
  const [brand, setBrand] = useState<MonitoringBrand>(existing?.brand ?? 'victron')
  const [label, setLabel] = useState(existing?.label ?? '')
  const [capacityKw, setCapacityKw] = useState(existing?.capacity_kw != null ? String(existing.capacity_kw) : '')
  const [batteryKwh, setBatteryKwh] = useState(existing?.battery_kwh != null ? String(existing.battery_kwh) : '')
  // Field values keyed by BrandField.key (covers credentials + plant_id + device_sn)
  const [values, setValues] = useState<Record<string, string>>(
    () => initialValues(BRAND_CONNECT[existing?.brand ?? 'victron'], existing),
  )

  const accountsFor = (b: MonitoringBrand) => accounts.filter((a) => a.brand === b)
  /** Default connection: keep the system's own account, else first saved account, else a one-off key. */
  function defaultConnection(b: MonitoringBrand): string {
    if (editMode && existing!.brand === b && existing!.brand_account_id) return existing!.brand_account_id
    if (editMode && existing!.brand === b) return OWN_KEY  // existing one-off key
    return accountsFor(b)[0]?.id ?? OWN_KEY
  }
  // Which credential source this system uses: a brand-account id, or OWN_KEY.
  const [connection, setConnection] = useState<string>(() => defaultConnection(existing?.brand ?? 'victron'))

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const schema = BRAND_CONNECT[brand]
  const brandAccounts = accountsFor(brand)
  const usingAccount = connection !== OWN_KEY
  // Blank-credentials-keep-saved only applies when editing the SAME brand with a
  // one-off key that already exists on the system (nothing to "keep" for accounts).
  const brandChanged = editMode && existing!.brand !== brand
  const credsOptional = editMode && !brandChanged && !usingAccount && !existing!.brand_account_id

  function changeBrand(next: MonitoringBrand) {
    setBrand(next)
    // Switching back to the original brand re-fills its saved locators.
    setValues(initialValues(BRAND_CONNECT[next], editMode && existing!.brand === next ? existing : undefined))
    setConnection(defaultConnection(next))
    setTestResult(null)
    setError('')
  }

  function changeConnection(next: string) {
    setConnection(next)
    setTestResult(null)
    setError('')
  }

  function setField(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setTestResult(null)
  }

  /** Split the flat values map into the API payload shape. Credentials are
   *  omitted entirely when a saved account supplies the key. */
  const buildConnection = useMemo(
    () => () => {
      const credentials: BrandCredentials = {}
      let plant_id: string | null = null
      let device_sn: string | null = null
      for (const f of schema.fields) {
        const v = (values[f.key] ?? '').trim()
        if (!v) continue
        if (f.target === 'credential') { if (!usingAccount) credentials[f.key] = v }
        else if (f.target === 'plant_id') plant_id = v
        else if (f.target === 'device_sn') device_sn = v
      }
      return { credentials, plant_id, device_sn }
    },
    [schema, values, usingAccount],
  )

  /** Returns an error string if the form is incomplete, else null. */
  function validate(needSite: boolean): string | null {
    if (needSite && !siteId) return 'Choose which site this system belongs to.'
    for (const f of schema.fields) {
      // Credential fields are hidden (account supplies the key) or optional
      // (editing the same brand, blank = keep saved value).
      if (f.target === 'credential' && (usingAccount || credsOptional)) continue
      if (f.required && !(values[f.key] ?? '').trim()) return `${f.label} is required.`
    }
    // Growatt: needs a token OR a username+password pair — only when a one-off
    // key must actually be supplied here.
    if (brand === 'growatt' && !usingAccount && !credsOptional) {
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
        body: JSON.stringify({
          brand,
          ...conn,
          ...(editMode ? { systemId: existing!.id } : {}),
          ...(usingAccount ? { brand_account_id: connection } : {}),
        }),
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
      const payload = {
        site_id: siteId,
        brand,
        label: label.trim() || null,
        capacity_kw: capacityKw ? Number(capacityKw) : null,
        battery_kwh: batteryKwh ? Number(batteryKwh) : null,
        brand_account_id: usingAccount ? connection : null,
        ...conn,
      }
      const res = await fetch('/api/monitoring/systems', {
        method: editMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editMode ? { id: existing!.id, ...payload } : payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Save failed (${res.status})`)
        setSaving(false)
        return
      }
      router.push(editMode ? `/portal/employee/monitoring/${existing!.id}` : '/portal/employee/monitoring')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex max-w-2xl flex-col gap-5">
      {/* Site + brand */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="system-site">Site *</Label>
            <Select id="system-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Select a site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.customer_name ? ` — ${s.customer_name}` : ''}
                </option>
              ))}
            </Select>
            {sites.length === 0 && (
              <span className="text-xs text-destructive">
                No sites yet. Open a customer and use <strong>Add site</strong> first —{' '}
                <Link href="/portal/employee/customers" className="underline hover:text-foreground">go to Customers</Link>.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="system-brand">Inverter brand *</Label>
            <Select id="system-brand" value={brand} onChange={(e) => changeBrand(e.target.value as MonitoringBrand)}>
              {BRAND_ORDER.map((b) => (
                <option key={b} value={b}>{BRAND_CONNECT[b].label}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="system-capacity">System size (kWp)</Label>
              <Input id="system-capacity" value={capacityKw} onChange={(e) => setCapacityKw(e.target.value)} type="number" min={0} inputMode="decimal" trailingText="kWp" placeholder="e.g. 8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="system-battery">Battery (kWh)</Label>
              <Input id="system-battery" value={batteryKwh} onChange={(e) => setBatteryKwh(e.target.value)} type="number" min={0} inputMode="decimal" trailingText="kWh" placeholder="e.g. 12" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="system-label">Label (optional)</Label>
            <Input id="system-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Roof inverter, Garage" />
          </div>
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
          {/* Connection: reuse a saved brand key, or enter a one-off key. */}
          {brandAccounts.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-3 pt-5">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="system-connection">{schema.label} connection *</Label>
                  <Select id="system-connection" value={connection} onChange={(e) => changeConnection(e.target.value)}>
                    {brandAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} (saved key)</option>
                    ))}
                    <option value={OWN_KEY}>Enter a one-off key for just this site…</option>
                  </Select>
                  {usingAccount ? (
                    <span className="text-xs text-muted-foreground/80">
                      Using your saved {schema.label} key — you only need this site&apos;s ID below.
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/80">This key is stored on this site only.</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-col gap-4 pt-5">
              {credsOptional && (
                <p className="text-xs text-muted-foreground">
                  Leave a credential blank to keep its saved value. Change the Plant/Station ID or
                  serial below to fix a wrong locator, or re-enter a credential to replace it.
                </p>
              )}
              {schema.fields
                // Hide credential fields when a saved account supplies the key.
                .filter((f) => !(usingAccount && f.target === 'credential'))
                .map((f: BrandField) => {
                  // A blank credential keeps the stored secret when editing the same brand.
                  const optional = credsOptional && f.target === 'credential'
                  return (
                    <div key={f.key} className="flex flex-col gap-1">
                      <Label htmlFor={`system-field-${f.key}`}>
                        {f.label}{f.required && !optional ? ' *' : ''}
                      </Label>
                      <Input
                        id={`system-field-${f.key}`}
                        type={f.type === 'password' ? 'password' : 'text'}
                        autoComplete="off"
                        value={values[f.key] ?? ''}
                        placeholder={optional ? 'Saved — leave blank to keep' : f.placeholder}
                        onChange={(e) => setField(f.key, e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground/80">{f.help}</span>
                    </div>
                  )
                })}
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
            <Button type="button" variant="outline" onClick={testConnection} disabled={testing || saving}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Test connection
            </Button>
            <Button type="submit" variant="accent" disabled={saving || testing}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editMode ? 'Save changes' : 'Save system'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: run <strong>Test connection</strong> first — once it shows live data, save it. Polling then keeps it updated automatically.
          </p>
        </>
      )}
    </form>
  )
}
