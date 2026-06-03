'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { extractQuoteJson, type AnyQuoteData } from '@/lib/solar/render-quote'
import { GenerateButton } from './GenerateButton'
import { FileText, Workflow, Image, ClipboardList, Sun, Pencil, Save, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MUNICIPALITIES } from '@/lib/solar/municipalities'

const RoofDesigner = dynamic(
  () => import('@/components/solar-design/RoofDesigner').then((m) => m.RoofDesigner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64 rounded-lg border border-border bg-muted text-sm text-muted-foreground">
        Loading roof designer…
      </div>
    ),
  },
)

const SLDDiagram = dynamic(
  () => import('@/components/sld/SLDDiagram').then((m) => m.SLDDiagram),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64 rounded-lg border border-border bg-muted text-sm text-muted-foreground">
        Loading diagram…
      </div>
    ),
  },
)

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type TabId = 'survey' | 'roof-design' | 'quote' | 'diagram' | 'photos'

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground w-48 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function EditSelect({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: Record<string, any>
  isAdmin: boolean
  canEditSurvey: boolean
  photoUrls: string[]
  nextQuoteNum: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuoteDetailTabs({ req, isAdmin, canEditSurvey, photoUrls, nextQuoteNum }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('survey')

  // Live quoteData — set by GenerateButton when JSON is pasted/parsed
  const [liveQuoteData, setLiveQuoteData] = useState<AnyQuoteData | null>(() => {
    if (req.generated_quote) {
      return extractQuoteJson(req.generated_quote)
    }
    return null
  })

  // ── Survey edit state ──────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [editErr,   setEditErr]   = useState('')

  const [eName,         setEName]         = useState<string>(req.customer_name  ?? '')
  const [eSiteNumber,   setESiteNumber]   = useState<string>(String(req.site_number ?? 1))
  const [ePhone,        setEPhone]        = useState<string>(req.customer_phone ?? '')
  const [eEmail,        setEEmail]        = useState<string>(req.customer_email ?? '')
  const [eAddress,      setEAddress]      = useState<string>(req.address        ?? '')
  const [eMunicipality, setEMunicipality] = useState<string>(req.municipality   ?? '')
  const [eGridSupply,   setEGridSupply]   = useState<string>(req.grid_supply    ?? '')
  const [eRoofType,     setERoofType]     = useState<string>(req.roof_type      ?? '')
  const [eStoreys,      setEStoreys]      = useState<string>(req.storeys        ?? '')
  const [eMonthlyKwh,   setEMonthlyKwh]   = useState<string>(String(req.monthly_kwh ?? ''))
  const [eSystemType,   setESystemType]   = useState<string>(req.system_type    ?? '')
  const [eBatteryHours, setEBatteryHours] = useState<string>(req.battery_hours  ?? '')
  const [eEssentialLoad,setEEssentialLoad]= useState<string>(String(req.essential_load ?? ''))
  const [eTargetOffgrid,setETargetOffgrid]= useState<string>(req.target_offgrid_pct != null ? String(req.target_offgrid_pct) : '')
  const [eEvCharger,    setEEvCharger]    = useState<string>(req.ev_charger     ?? '')
  const [eInverterBrand,setEInverterBrand]= useState<string>(req.inverter_brand ?? '')
  const [eBatteryBrand, setEBatteryBrand] = useState<string>(req.battery_brand  ?? '')
  const [ePanelBrand,   setEPanelBrand]   = useState<string>(req.panel_brand    ?? '')
  const [eNotes,        setENotes]        = useState<string>(req.notes          ?? '')

  function cancelEdit() {
    setEName(req.customer_name ?? '')
    setESiteNumber(String(req.site_number ?? 1))
    setEPhone(req.customer_phone ?? '')
    setEEmail(req.customer_email ?? '')
    setEAddress(req.address ?? '')
    setEMunicipality(req.municipality ?? '')
    setEGridSupply(req.grid_supply ?? '')
    setERoofType(req.roof_type ?? '')
    setEStoreys(req.storeys ?? '')
    setEMonthlyKwh(String(req.monthly_kwh ?? ''))
    setESystemType(req.system_type ?? '')
    setEBatteryHours(req.battery_hours ?? '')
    setEEssentialLoad(String(req.essential_load ?? ''))
    setETargetOffgrid(req.target_offgrid_pct != null ? String(req.target_offgrid_pct) : '')
    setEEvCharger(req.ev_charger ?? '')
    setEInverterBrand(req.inverter_brand ?? '')
    setEBatteryBrand(req.battery_brand ?? '')
    setEPanelBrand(req.panel_brand ?? '')
    setENotes(req.notes ?? '')
    setEditErr('')
    setIsEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    setEditErr('')
    try {
      const supabase = createClient()
      const payload = {
        customer_name:      eName,
        site_number:        parseInt(eSiteNumber, 10) || 1,
        customer_phone:     ePhone        || null,
        customer_email:     eEmail        || null,
        address:            eAddress      || null,
        municipality:       eMunicipality,
        grid_supply:        eGridSupply,
        roof_type:          eRoofType,
        storeys:            eStoreys,
        monthly_kwh:        eMonthlyKwh   || null,
        system_type:        eSystemType,
        battery_hours:      eBatteryHours,
        essential_load:     eEssentialLoad || null,
        target_offgrid_pct: eTargetOffgrid ? parseInt(eTargetOffgrid) : null,
        ev_charger:         eEvCharger,
        inverter_brand:     eInverterBrand,
        battery_brand:      eBatteryBrand,
        panel_brand:        ePanelBrand,
        notes:              eNotes        || null,
      }

      let { error } = await supabase
        .from('quote_requests')
        .update(payload)
        .eq('id', req.id)

      if (error?.message?.includes('site_number')) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { site_number: _removed, ...fallbackPayload } = payload as typeof payload & { site_number?: number }
        const retry = await supabase
          .from('quote_requests')
          .update(fallbackPayload)
          .eq('id', req.id)
        error = retry.error
      }

      if (error) { setEditErr(error.message); return }
      setIsEditing(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: TabId; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'survey',      label: 'Survey',      icon: ClipboardList },
    { id: 'roof-design', label: 'Roof Design', icon: Sun },
    { id: 'quote',       label: 'Quote',       icon: FileText },
    { id: 'diagram',     label: 'Diagram',     icon: Workflow },
    ...(photoUrls.length > 0
      ? [{ id: 'photos' as TabId, label: `Photos (${photoUrls.length})`, icon: Image }]
      : []),
  ]

  const diagramData = liveQuoteData

  return (
    <div className="flex flex-col gap-0">

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors
                ${active
                  ? 'border-b-2 border-accent text-accent -mb-px'
                  : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Survey tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'survey' && (
        <div className="flex flex-col gap-6 pt-6 max-w-3xl">

          {/* Edit toolbar */}
          {canEditSurvey && (
            <div className="flex justify-end gap-2">
              {isEditing ? (
                <>
                  <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <Button variant="accent" size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : <><Save className="h-3.5 w-3.5" /> Save changes</>}
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit survey
                </Button>
              )}
            </div>
          )}

          {/* Amendment — if applicable */}
          {req.is_amendment && (
            <Card className="border-warning">
              <CardContent className="pt-5 pb-5 flex flex-col gap-0">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Existing System</h2>
                <Row label="Current Inverter"   value={req.existing_inverter} />
                <Row label="Current Batteries"  value={req.existing_batteries} />
                <Row label="Current Panels"     value={req.existing_panels} />
                <Row label="Monthly Usage"      value={req.existing_monthly_usage ? `${req.existing_monthly_usage} kWh` : null} />
                <Row label="Monthly Generation" value={req.existing_monthly_gen ? `${req.existing_monthly_gen} kWh` : null} />
                <Row label="Monthly Saving"     value={req.existing_monthly_saving ? `R${req.existing_monthly_saving}` : null} />
                {req.amendment_scope && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Scope</p>
                    <p className="text-sm whitespace-pre-wrap">{req.amendment_scope}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Customer */}
          <Card>
            <CardContent className="pt-5 pb-5 flex flex-col gap-0">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Customer</h2>
              {isEditing ? (
                <div className="flex flex-col gap-3 pt-1">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Name *</span>
                      <Input value={eName} onChange={(e) => setEName(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Site Number</span>
                      <EditSelect value={eSiteNumber} onChange={setESiteNumber} options={['1', '2', '3', '4', '5']} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Phone</span>
                      <Input value={ePhone} onChange={(e) => setEPhone(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Email</span>
                      <Input value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Municipality</span>
                      <EditSelect value={eMunicipality} onChange={setEMunicipality} options={MUNICIPALITIES} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Address</span>
                    <Input
                      value={eAddress}
                      onChange={(e) => setEAddress(e.target.value)}
                      placeholder="12 Maple Street, Midrand, 1685"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <Row label="Name"         value={req.customer_name} />
                  <Row label="Site Number"  value={`Site ${req.site_number ?? 1}`} />
                  <Row label="Phone"        value={req.customer_phone} />
                  <Row label="Email"        value={req.customer_email} />
                  <Row label="Address"      value={req.address} />
                  <Row label="Municipality" value={req.municipality} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Site + Usage */}
          <Card>
            <CardContent className="pt-5 pb-5 flex flex-col gap-0">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Site &amp; Usage</h2>
              {isEditing ? (
                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Grid Supply</span>
                    <EditSelect value={eGridSupply} onChange={setEGridSupply} options={['Single Phase', 'Three Phase']} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Roof Type</span>
                    <EditSelect value={eRoofType} onChange={setERoofType}
                      options={['IBR', 'Corrugated Iron', 'Kliplok', 'Tile', 'Flat/Concrete', 'Other']} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Storeys</span>
                    <EditSelect value={eStoreys} onChange={setEStoreys} options={['1', '2', '3+']} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Monthly Usage (kWh avg)</span>
                    <Input value={eMonthlyKwh} onChange={(e) => setEMonthlyKwh(e.target.value)} type="number" min="0" />
                  </label>
                </div>
              ) : (
                <>
                  <Row label="Grid Supply" value={req.grid_supply} />
                  <Row label="Roof Type"   value={req.roof_type} />
                  <Row label="Storeys"     value={req.storeys} />
                  {req.usage_mode === 'advanced' ? (
                    <div className="py-2 border-b border-border">
                      <span className="text-muted-foreground text-sm w-48 inline-block">Monthly Breakdown</span>
                      <div className="grid grid-cols-6 gap-x-4 gap-y-1 mt-2 text-sm">
                        {MONTHS.map((m, i) =>
                          req[`monthly_kwh_${m}`] ? (
                            <span key={m}>
                              <span className="text-muted-foreground text-xs">{MONTH_LABELS[i]}: </span>
                              {req[`monthly_kwh_${m}`]}
                            </span>
                          ) : null,
                        )}
                      </div>
                      {req.monthly_kwh && (
                        <p className="text-xs text-muted-foreground mt-1">Avg: {req.monthly_kwh} kWh/mo</p>
                      )}
                    </div>
                  ) : (
                    <Row label="Monthly Usage" value={req.monthly_kwh ? `${req.monthly_kwh} kWh` : null} />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* System Requirements */}
          <Card>
            <CardContent className="pt-5 pb-5 flex flex-col gap-0">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Requirements</h2>
              {isEditing ? (
                <div className="flex flex-col gap-3 pt-1">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">System Type</span>
                      <EditSelect value={eSystemType} onChange={setESystemType}
                        options={['AI will determine', 'Hybrid', 'Off-grid', 'Grid-tie']} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Battery Backup</span>
                      <EditSelect value={eBatteryHours} onChange={setEBatteryHours}
                        options={['AI will determine', '2 hours', '4 hours', '6 hours', '8 hours', '12 hours']} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Essential Load (kW)</span>
                      <Input value={eEssentialLoad} onChange={(e) => setEEssentialLoad(e.target.value)} type="number" min="0" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Target Off-grid %</span>
                      <Input value={eTargetOffgrid} onChange={(e) => setETargetOffgrid(e.target.value)} type="number" min="0" max="100" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">EV Charger</span>
                      <EditSelect value={eEvCharger} onChange={setEEvCharger}
                        options={['No', 'Yes — 7kW', 'Yes — 11kW', 'Yes — 22kW']} />
                    </label>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Inverter Brand</span>
                      <Input value={eInverterBrand} onChange={(e) => setEInverterBrand(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Battery Brand</span>
                      <Input value={eBatteryBrand} onChange={(e) => setEBatteryBrand(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Panel Brand</span>
                      <Input value={ePanelBrand} onChange={(e) => setEPanelBrand(e.target.value)} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Notes</span>
                    <textarea
                      value={eNotes}
                      onChange={(e) => setENotes(e.target.value)}
                      rows={3}
                      className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <Row label="System Type"         value={req.system_type} />
                  <Row label="Battery Backup"      value={req.battery_hours} />
                  <Row label="Essential Load"      value={req.essential_load ? `${req.essential_load} kW` : null} />
                  <Row label="Target Off-grid"     value={req.target_offgrid_pct != null ? `${req.target_offgrid_pct}%` : null} />
                  <Row label="EV Charger"          value={req.ev_charger} />
                  <Row label="Inverter Preference" value={req.inverter_brand} />
                  <Row label="Battery Preference"  value={req.battery_brand} />
                  <Row label="Panel Preference"    value={req.panel_brand} />
                  {req.notes && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                      <p className="text-sm whitespace-pre-wrap">{req.notes}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {editErr && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-2">{editErr}</p>
          )}
        </div>
      )}

      {/* ── Roof Design tab ───────────────────────────────────────────────────── */}
      {activeTab === 'roof-design' && (
        <div className="flex flex-col gap-4 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-primary">Roof Design</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Load the roof from Google&apos;s satellite data. Toggle panels on/off, then click <strong>Use This Design</strong> — the panel count and kWp will lock into the quote.
            </p>
          </div>
          <RoofDesigner
            address={req.address ?? null}
            quoteRequestId={req.id}
            existingPanelCount={req.design_panel_count ?? null}
            existingKwp={req.design_kwp ?? null}
            existingConfirmedAt={req.design_confirmed_at ?? null}
          />
        </div>
      )}

      {/* ── Quote tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'quote' && (
        <div className="flex flex-col gap-4 pt-6 max-w-3xl">
          {isAdmin ? (
            <>
              <div>
                <h2 className="text-lg font-semibold text-primary">
                  {req.quote_html || req.generated_quote ? 'Generated Quote' : 'Generate Quote'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {req.quote_html || req.generated_quote
                    ? 'Quote generated. Regenerate to refresh, or adjust deposit items.'
                    : 'Copy the prompt, paste into Claude, then paste the JSON output back below.'}
                </p>
              </div>
              <GenerateButton
                requestId={req.id}
                request={req}
                existingQuote={req.generated_quote ?? null}
                existingHtml={req.quote_html ?? null}
                existingDepositItems={(req.deposit_items ?? []) as string[]}
                existingQuoteNumber={req.quote_number ?? null}
                existingQuoteVersion={(req.quote_version ?? 'simplified') as 'simplified' | 'detailed'}
                nextQuoteNumber={nextQuoteNum}
                onQuoteDataChange={setLiveQuoteData}
              />
            </>
          ) : (
            <>
              {req.quote_html ? (
                <div className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold text-primary">Your Quote</h2>
                  {req.quote_number && (
                    <p className="text-sm text-muted-foreground">{req.quote_number}</p>
                  )}
                  <iframe
                    srcDoc={req.quote_html}
                    title="Solar quote"
                    className="w-full rounded-lg border border-border"
                    style={{ height: '700px' }}
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : req.generated_quote ? (
                <div className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold text-primary">Generated Quote</h2>
                  <Card>
                    <CardContent className="pt-4 pb-4">
                      <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                        {req.generated_quote}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardContent className="py-6 text-center text-muted-foreground text-sm">
                    Quote is being reviewed. Matthew will generate it shortly.
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Diagram tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'diagram' && (
        <div className="flex flex-col gap-3 pt-6">
          {diagramData ? (
            <>
              <div className="flex items-center justify-between max-w-3xl">
                <div>
                  <h2 className="text-lg font-semibold text-primary">Wiring Diagram (SLD)</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Auto-generated from quoted equipment. Drag nodes to rearrange. Click Fullscreen for editing room.
                  </p>
                </div>
                {req.quote_number && (
                  <Badge variant="default" className="shrink-0">{req.quote_number}</Badge>
                )}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 text-xs max-w-3xl">
                {[
                  { color: '#f97316', label: 'DC / PV' },
                  { color: '#16a34a', label: 'Battery' },
                  { color: '#2563eb', label: 'AC' },
                  { color: '#65a30d', label: 'Earthing' },
                  { color: '#7c3aed', label: 'Grid' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ background: color }}
                    />
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>

              {/* Full-width diagram */}
              <SLDDiagram
                quoteData={diagramData}
                gridSupply={req.grid_supply as string | undefined}
                height={700}
                onSldChange={isAdmin ? setLiveQuoteData : undefined}
              />
            </>
          ) : (
            <Card className="max-w-3xl">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Workflow className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium text-foreground mb-1">No diagram yet</p>
                <p className="text-sm">
                  Generate and save a quote in the <button
                    type="button"
                    onClick={() => setActiveTab('quote')}
                    className="text-accent underline"
                  >Quote tab</button> — the diagram will appear here automatically.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Photos tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'photos' && photoUrls.length > 0 && (
        <div className="flex flex-col gap-4 pt-6 max-w-3xl">
          <h2 className="text-lg font-semibold text-primary">Site Photos ({photoUrls.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photoUrls.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square rounded-lg overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Site photo ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
