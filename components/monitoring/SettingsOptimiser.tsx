'use client'

import { useState } from 'react'
import {
  RefreshCw, Pencil, CloudDownload, Save, X, Lightbulb, Check, Ban,
  TrendingUp, Calculator, Info, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import {
  SETTINGS_FIELDS, WORK_MODE_LABELS, formatSettingValue, emptySettings, parseSettings,
  type InverterSettings, type WorkMode,
} from '@/lib/monitoring/settings/types'
import type { BrandSettingsCapability } from '@/lib/monitoring/settings/capabilities'
import type { MonitoringBrand } from '@/lib/monitoring/types'

interface Snapshot {
  id: string
  captured_at: string
  source: string
  note: string | null
  settings: InverterSettings
}

interface RecRow {
  id: string
  code: string
  category: string
  severity: 'info' | 'opportunity' | 'high'
  title: string
  rationale: string
  current_value: string | null
  suggested_value: string | null
  projected_annual_saving_r: number | null
  projected_self_consumption_delta_pct: number | null
  status: 'open' | 'applied' | 'dismissed' | 'snoozed'
}

interface Baseline {
  annualSavingR: number
  selfConsumptionPct: number
  gridIndependencePct: number
  importedKwh: number
  exportedKwh: number
  curtailedKwh: number
}

const rand = (n: number | null | undefined) =>
  n == null ? '—' : 'R' + Math.round(n).toLocaleString('en-ZA')

const SEVERITY_BADGE: Record<RecRow['severity'], 'destructive' | 'warning' | 'outline'> = {
  high: 'destructive', opportunity: 'warning', info: 'outline',
}

export function SettingsOptimiser({
  systemId, brand, brandLabel, capability, batteryKwh, capacityKw,
  initialSnapshot, initialRecommendations,
}: {
  systemId: string
  brand: MonitoringBrand
  brandLabel: string
  capability: BrandSettingsCapability
  batteryKwh: number | null
  capacityKw: number | null
  initialSnapshot: Snapshot | null
  initialRecommendations: RecRow[]
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(initialSnapshot)
  const [recs, setRecs] = useState<RecRow[]>(initialRecommendations)
  const [baseline, setBaseline] = useState<Baseline | null>(null)
  const [profileNote, setProfileNote] = useState<string | null>(null)

  // Shared modelling assumptions (also passed to the what-if panel).
  const [tariffRate, setTariffRate] = useState('3.50')
  const [feedInRate, setFeedInRate] = useState('1.20')
  const [feedInAvailable, setFeedInAvailable] = useState(false)

  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const settings = snapshot?.settings ?? emptySettings()
  const assumptions = () => ({
    tariffRate: Number(tariffRate) || 0,
    feedInRate: Number(feedInRate) || 0,
    feedInAvailable,
  })

  // ── Settings read ──────────────────────────────────────────────────────────
  async function refreshFromCloud() {
    setBusy('cloud'); setMsg(null)
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'cloud' }),
      })
      const data = await res.json()
      if (data.ok) {
        setSnapshot(data.snapshot)
        setMsg({ kind: 'ok', text: 'Settings read from the cloud.' })
      } else {
        setMsg({ kind: 'err', text: data.error || 'Could not read from the cloud — capture manually instead.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error reading settings.' })
    } finally { setBusy(null) }
  }

  async function saveManual(next: InverterSettings, note: string) {
    setBusy('manual'); setMsg(null)
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual', settings: next, note }),
      })
      const data = await res.json()
      if (data.ok) {
        setSnapshot(data.snapshot)
        setEditing(false)
        setMsg({ kind: 'ok', text: 'Settings saved.' })
      } else {
        setMsg({ kind: 'err', text: data.error || 'Could not save.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error saving settings.' })
    } finally { setBusy(null) }
  }

  // ── Recommendations ──────────────────────────────────────────────────────────
  async function recalc() {
    setBusy('recalc'); setMsg(null)
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/recommendations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assumptions()),
      })
      const data = await res.json()
      if (data.ok) {
        setRecs(data.recommendations)
        setBaseline(data.baseline)
        setProfileNote(
          data.profileBasis === 'measured'
            ? `Modelled on ${data.measuredDays} days of measured data.`
            : 'Modelled on a capacity-based estimate — capture more monitoring data or enter the customer’s actual usage in What-if for sharper numbers.',
        )
      } else {
        setMsg({ kind: 'err', text: data.error || 'Could not calculate.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error calculating recommendations.' })
    } finally { setBusy(null) }
  }

  async function setRecStatus(id: string, status: RecRow['status']) {
    setBusy(id)
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/recommendations`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (data.ok) setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    } finally { setBusy(null) }
  }

  const openRecs = recs.filter((r) => r.status === 'open')
  const actedRecs = recs.filter((r) => r.status !== 'open')
  const totalUpside = openRecs.reduce((s, r) => s + (r.projected_annual_saving_r ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <div className={`rounded-lg border p-3 text-sm ${msg.kind === 'ok' ? 'border-success/30 bg-success/5 text-success' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
          {msg.text}
        </div>
      )}

      {/* Capability banner */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="space-y-2">
          <p className="text-sm">{capability.note}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={capability.readImplemented ? 'success' : 'outline'}>
              {capability.readImplemented ? 'Auto-read available' : 'Read: manual capture'}
            </Badge>
            <Badge variant={capability.writeImplemented ? 'success' : 'outline'}>
              {capability.writeImplemented ? 'Remote change available' : 'Change: on the platform'}
            </Badge>
            {capability.localModbusOnly && <Badge variant="outline">Local Modbus for full control</Badge>}
            {capability.cloudWriteGated && <Badge variant="outline">Cloud write needs brand approval</Badge>}
          </div>
        </div>
      </div>

      {/* Current settings */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Current settings</CardTitle>
              <CardDescription>
                {snapshot
                  ? <>Captured {new Date(snapshot.captured_at).toLocaleString('en-ZA')} · {snapshot.source === 'cloud' ? 'read from cloud' : 'entered manually'}</>
                  : 'No settings captured yet — read from the cloud or enter what you see on the brand app.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {capability.readImplemented && (
                <Button variant="outline" size="sm" onClick={refreshFromCloud} disabled={busy === 'cloud'} type="button">
                  <CloudDownload className="h-4 w-4" /> {busy === 'cloud' ? 'Reading…' : 'Refresh from cloud'}
                </Button>
              )}
              <Button variant={editing ? 'ghost' : 'outline'} size="sm" onClick={() => setEditing((e) => !e)} type="button">
                {editing ? <><X className="h-4 w-4" /> Cancel</> : <><Pencil className="h-4 w-4" /> {snapshot ? 'Edit' : 'Capture'} manually</>}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <ManualSettingsForm
              initial={settings}
              note={snapshot?.note ?? ''}
              saving={busy === 'manual'}
              onSave={saveManual}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SETTINGS_FIELDS.map((f) => (
                <div key={f.key} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className="mt-1 font-semibold">{formatSettingValue(f.key, settings)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-accent" /> Optimisation recommendations</CardTitle>
              <CardDescription>Modelled setting changes that should save more. Figures are estimates from the energy model, not guarantees.</CardDescription>
            </div>
            <Button variant="accent" size="sm" onClick={recalc} disabled={busy === 'recalc'} type="button">
              <RefreshCw className={`h-4 w-4 ${busy === 'recalc' ? 'animate-spin' : ''}`} /> {busy === 'recalc' ? 'Calculating…' : 'Recalculate'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Assumptions */}
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Import tariff" htmlFor="tariff" hint="R/kWh paid to the grid">
              <Input id="tariff" type="number" step="0.01" leadingText="R" value={tariffRate} onChange={(e) => setTariffRate(e.target.value)} />
            </FormField>
            <FormField label="Feed-in tariff" htmlFor="feedin" hint="R/kWh earned for export">
              <Input id="feedin" type="number" step="0.01" leadingText="R" value={feedInRate} onChange={(e) => setFeedInRate(e.target.value)} />
            </FormField>
            <FormField label="Feed-in agreement" htmlFor="feedinavail" hint="Can this site export for credit?">
              <Select id="feedinavail" value={feedInAvailable ? 'yes' : 'no'} onChange={(e) => setFeedInAvailable(e.target.value === 'yes')}>
                <option value="no">No / not allowed</option>
                <option value="yes">Yes, available</option>
              </Select>
            </FormField>
          </div>

          {profileNote && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" /> {profileNote}</p>
          )}

          {baseline && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Modelled saving / yr" value={rand(baseline.annualSavingR)} />
              <Stat label="Self-consumption" value={`${baseline.selfConsumptionPct}%`} />
              <Stat label="Grid independence" value={`${baseline.gridIndependencePct}%`} />
              <Stat label="Wasted solar / yr" value={`${baseline.curtailedKwh} kWh`} />
            </div>
          )}

          {openRecs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {openRecs.length} open recommendation{openRecs.length > 1 ? 's' : ''}
              {totalUpside > 0 && <> · up to <span className="font-semibold text-foreground">{rand(totalUpside)}/yr</span> of modelled upside</>}
            </p>
          )}

          {recs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No recommendations yet. Capture the current settings, then hit Recalculate.
            </p>
          ) : (
            <div className="space-y-3">
              {openRecs.map((r) => (
                <RecCard key={r.id} rec={r} busy={busy === r.id} canWrite={capability.writeImplemented}
                  onApply={() => setRecStatus(r.id, 'applied')} onDismiss={() => setRecStatus(r.id, 'dismissed')} />
              ))}
              {actedRecs.length > 0 && (
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                    {actedRecs.length} handled (applied / dismissed)
                  </summary>
                  <div className="mt-3 space-y-2">
                    {actedRecs.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground line-through">{r.title}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={r.status === 'applied' ? 'success' : 'outline'}>{r.status}</Badge>
                          <Button variant="ghost" size="sm" type="button" onClick={() => setRecStatus(r.id, 'open')}>Reopen</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* What-if */}
      <WhatIfPanel systemId={systemId} batteryKwh={batteryKwh} settings={settings} getAssumptions={assumptions} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-primary">{value}</p>
    </div>
  )
}

function RecCard({ rec, busy, canWrite, onApply, onDismiss }: {
  rec: RecRow; busy: boolean; canWrite: boolean; onApply: () => void; onDismiss: () => void
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={SEVERITY_BADGE[rec.severity]}>{rec.severity}</Badge>
            <Badge variant="outline">{rec.category}</Badge>
            <h3 className="font-semibold">{rec.title}</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{rec.rationale}</p>
          {(rec.current_value || rec.suggested_value) && (
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">{rec.current_value ?? '—'}</span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="font-medium text-foreground">{rec.suggested_value ?? '—'}</span>
            </p>
          )}
        </div>
        {rec.projected_annual_saving_r != null && (
          <div className="shrink-0 text-right">
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> est. saving</p>
            <p className="text-lg font-bold text-success">{rand(rec.projected_annual_saving_r)}/yr</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="accent" size="sm" type="button" disabled={busy} onClick={onApply}>
          <Check className="h-4 w-4" /> {canWrite ? 'Apply remotely' : 'Mark done (changed on platform)'}
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={onDismiss}>
          <Ban className="h-4 w-4" /> Dismiss
        </Button>
      </div>
    </div>
  )
}

// ── Manual capture form ────────────────────────────────────────────────────────
function ManualSettingsForm({ initial, note, saving, onSave }: {
  initial: InverterSettings; note: string; saving: boolean
  onSave: (s: InverterSettings, note: string) => void
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const f of SETTINGS_FIELDS) {
      const v = initial[f.key]
      o[f.key] = v == null ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)
    }
    return o
  })
  const [noteVal, setNoteVal] = useState(note)

  function build(): InverterSettings {
    // Assemble a loose blob and let parseSettings coerce/validate it.
    const next: Record<string, unknown> = { touWindows: initial.touWindows ?? null }
    for (const f of SETTINGS_FIELDS) {
      const raw = form[f.key]
      if (raw === '' || raw == null) continue
      if (f.kind === 'workmode') next.workMode = raw
      else if (f.kind === 'boolean') next[f.key] = raw === 'true'
      else {
        const n = Number(raw)
        if (Number.isFinite(n)) next[f.key] = n
      }
    }
    return parseSettings(next)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_FIELDS.map((f) => (
          <FormField key={f.key} label={f.label} htmlFor={f.key} hint={f.help}>
            {f.kind === 'workmode' ? (
              <Select id={f.key} value={form[f.key]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}>
                <option value="">Unknown</option>
                {(Object.keys(WORK_MODE_LABELS) as WorkMode[]).filter((m) => m !== 'unknown').map((m) => (
                  <option key={m} value={m}>{WORK_MODE_LABELS[m]}</option>
                ))}
              </Select>
            ) : f.kind === 'boolean' ? (
              <Select id={f.key} value={form[f.key]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}>
                <option value="">Unknown</option>
                <option value="true">On</option>
                <option value="false">Off</option>
              </Select>
            ) : (
              <Input id={f.key} type="number" inputMode="decimal" trailingText={f.unit}
                value={form[f.key]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} />
            )}
          </FormField>
        ))}
      </div>
      <FormField label="Note (optional)" htmlFor="note" hint="e.g. read off the Sunsynk app on 2026-06-26">
        <Textarea id="note" rows={2} value={noteVal} onChange={(e) => setNoteVal(e.target.value)} />
      </FormField>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" /> Time-of-use windows aren’t edited here — record them in the note for now.
      </p>
      <Button variant="default" type="button" disabled={saving} onClick={() => onSave(build(), noteVal)}>
        <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  )
}

// ── What-if simulator ──────────────────────────────────────────────────────────
function WhatIfPanel({ systemId, batteryKwh, settings, getAssumptions }: {
  systemId: string
  batteryKwh: number | null
  settings: InverterSettings
  getAssumptions: () => { tariffRate: number; feedInRate: number; feedInAvailable: boolean }
}) {
  const [exportEnabled, setExportEnabled] = useState(settings.exportEnabled === true)
  const [minSoc, setMinSoc] = useState(String(settings.batteryMinSocPct ?? 10))
  const [maxSoc, setMaxSoc] = useState(String(settings.batteryMaxSocPct ?? 100))
  const [battery, setBattery] = useState(String(batteryKwh ?? 0))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ current: { savingR: number; selfConsumptionPct: number }; proposed: { savingR: number; selfConsumptionPct: number }; deltaSavingR: number } | null>(null)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getAssumptions(),
          override: {
            exportEnabled,
            batteryMinSocPct: Number(minSoc) || 0,
            batteryMaxSocPct: Number(maxSoc) || 100,
            batteryKwh: Number(battery) || null,
          },
        }),
      })
      setResult(await res.json())
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-accent" /> What-if simulator</CardTitle>
        <CardDescription>Try a setting change and see the modelled effect on annual savings before touching the inverter.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Export to grid" htmlFor="wi-export">
            <Select id="wi-export" value={exportEnabled ? 'on' : 'off'} onChange={(e) => setExportEnabled(e.target.value === 'on')}>
              <option value="off">Off</option>
              <option value="on">On</option>
            </Select>
          </FormField>
          <FormField label="Reserve floor" htmlFor="wi-min">
            <Input id="wi-min" type="number" trailingText="%" value={minSoc} onChange={(e) => setMinSoc(e.target.value)} />
          </FormField>
          <FormField label="Charge ceiling" htmlFor="wi-max">
            <Input id="wi-max" type="number" trailingText="%" value={maxSoc} onChange={(e) => setMaxSoc(e.target.value)} />
          </FormField>
          <FormField label="Battery size" htmlFor="wi-bat" hint="Model an upgrade">
            <Input id="wi-bat" type="number" trailingText="kWh" value={battery} onChange={(e) => setBattery(e.target.value)} />
          </FormField>
        </div>
        <Button variant="outline" type="button" onClick={run} disabled={busy}>
          <Calculator className="h-4 w-4" /> {busy ? 'Modelling…' : 'Run simulation'}
        </Button>

        {result && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Now (modelled saving/yr)" value={rand(result.current.savingR)} />
            <Stat label="With this change" value={rand(result.proposed.savingR)} />
            <div className={`rounded-lg border p-3 ${result.deltaSavingR >= 0 ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'}`}>
              <p className="text-xs text-muted-foreground">Difference</p>
              <p className={`mt-1 text-lg font-bold ${result.deltaSavingR >= 0 ? 'text-success' : 'text-destructive'}`}>
                {result.deltaSavingR >= 0 ? '+' : ''}{rand(result.deltaSavingR)}/yr
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
