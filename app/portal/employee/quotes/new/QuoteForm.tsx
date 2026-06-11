'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { detectMunicipality, MUNICIPALITIES } from '@/lib/solar/municipalities'
import { getTariffRateForMunicipality } from '@/lib/solar/quote-calculator'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { FileText, Loader2, CheckCircle2, Upload, X, Image as ImageIcon } from 'lucide-react'
import type { EquipmentBrand } from '@/types/database'

// ── Constants ────────────────────────────────────────────────
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type MonthKey = typeof MONTHS[number]

const AUTO_SIZE = 'Auto — sized from usage'
const NO_PREFERENCE = 'No preference'

// Older quote requests stored AI-era labels — normalize so prefilled selects still match
function normalizeAuto(value: string | null | undefined) {
  if (!value || value === 'AI will determine') return AUTO_SIZE
  return value
}
function normalizePreference(value: string | null | undefined) {
  if (!value || value.startsWith('No preference')) return NO_PREFERENCE
  return value
}

// ── Sub-components ───────────────────────────────────────────
function SectionHead({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
      {title}
    </h2>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

function Select({ value, onChange, options, disabled }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${value ? 'bg-accent' : 'bg-border'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      <span className="sr-only">{label}</span>
    </button>
  )
}

// ── Existing-equipment row (dropdown + qty + model text) ─────
function ExistingEquipmentRow({
  label,
  brands,
  withQty,
  modelPlaceholder,
  onChange,
}: {
  label: string
  brands: string[]
  withQty: boolean
  modelPlaceholder: string
  onChange: (v: string) => void
}) {
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [qty,   setQty]   = useState('1')

  function emit(b: string, m: string, q: string) {
    const desc = b === 'Other' || !b
      ? m
      : [b, m].filter(Boolean).join(' ')
    if (!desc) { onChange(''); return }
    onChange(withQty ? `${q} × ${desc}` : desc)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex gap-2">
        {withQty && (
          <Input
            value={qty}
            onChange={(e) => { setQty(e.target.value); emit(brand, model, e.target.value) }}
            type="number" min="1"
            className="w-16 shrink-0"
            placeholder="Qty"
          />
        )}
        <select
          value={brand}
          onChange={(e) => { setBrand(e.target.value); emit(e.target.value, model, qty) }}
          className="flex h-10 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">Brand…</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          <option value="Other">Other</option>
        </select>
        <Input
          value={model}
          onChange={(e) => { setModel(e.target.value); emit(brand, e.target.value, qty) }}
          placeholder={brand === 'Other' ? 'Describe fully (brand + model + size)…' : modelPlaceholder}
          className="flex-1"
        />
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────
interface Prefill {
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  address: string | null
  municipality: string
  site_number: number | null
  grid_supply: string
  roof_type: string
  storeys: string
  monthly_kwh: string | null
  system_type: string
  battery_hours: string
  essential_load: string | null
  ev_charger: string
  inverter_brand: string
  battery_brand: string
  panel_brand: string
}

interface Props {
  brands: EquipmentBrand[]
  prefill?: Partial<Prefill> | null
  /** When converting a website lead — marks it converted after submit. */
  leadId?: string | null
}

export function QuoteForm({ brands, prefill, leadId }: Props) {
  const router = useRouter()

  // Job type
  const [isAmendment, setIsAmendment] = useState(false)

  // Customer
  const [customerName,  setCustomerName]  = useState(prefill?.customer_name  ?? '')
  const [customerPhone, setCustomerPhone] = useState(prefill?.customer_phone ?? '')
  const [customerEmail, setCustomerEmail] = useState(prefill?.customer_email ?? '')
  const [address,       setAddress]       = useState(prefill?.address        ?? '')
  const [municipality,  setMunicipality]  = useState(prefill?.municipality   ?? 'City of Johannesburg')
  const [siteNumber,    setSiteNumber]    = useState(String(prefill?.site_number ?? 1))

  // Existing system (amendment only)
  const [existingInverter,  setExistingInverter]  = useState('')
  const [existingBatteries, setExistingBatteries] = useState('')
  const [existingPanels,    setExistingPanels]    = useState('')
  const [existingUsage,     setExistingUsage]     = useState('')
  const [existingGen,       setExistingGen]       = useState('')
  const [existingSaving,    setExistingSaving]    = useState('')
  const [amendmentScope,    setAmendmentScope]    = useState('')

  // Site
  const [gridSupply,    setGridSupply]    = useState(prefill?.grid_supply ?? 'Single Phase')
  const [roofType,      setRoofType]      = useState(prefill?.roof_type   ?? 'IBR')
  const [roofTypeOther, setRoofTypeOther] = useState('')
  const [storeys,       setStoreys]       = useState(prefill?.storeys      ?? '1')

  // Usage
  const [usageMode,   setUsageMode]   = useState<'monthly' | 'advanced'>('monthly')
  const [monthlyKwh,  setMonthlyKwh]  = useState(prefill?.monthly_kwh ?? '')
  const [monthlyBill, setMonthlyBill] = useState('')
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<Record<MonthKey, string>>(
    Object.fromEntries(MONTHS.map((m) => [m, ''])) as Record<MonthKey, string>
  )

  // System requirements
  const [systemType,       setSystemType]       = useState(normalizeAuto(prefill?.system_type))
  const [batteryHours,     setBatteryHours]      = useState(normalizeAuto(prefill?.battery_hours))
  const [essentialLoad,    setEssentialLoad]     = useState(prefill?.essential_load ?? '')
  const [targetOffgrid,    setTargetOffgrid]     = useState('')
  const [evCharger,        setEvCharger]         = useState(prefill?.ev_charger     ?? 'No')

  // Equipment preferences
  const [inverterBrand, setInverterBrand] = useState(normalizePreference(prefill?.inverter_brand))
  const [inverterModel, setInverterModel] = useState('')
  const [batteryBrand,  setBatteryBrand]  = useState(normalizePreference(prefill?.battery_brand))
  const [batteryModel,  setBatteryModel]  = useState('')
  const [panelBrand,    setPanelBrand]    = useState(normalizePreference(prefill?.panel_brand))
  const [panelModel,    setPanelModel]    = useState('')

  // Photos
  const [photoUrls,   setPhotoUrls]   = useState<string[]>([])
  const [uploading,   setUploading]   = useState(false)

  // Notes
  const [notes, setNotes] = useState('')

  // Form state
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Derived brand lists
  const inverterBrands = brands.filter((b) => b.category === 'inverter').map((b) => b.brand)
  const batteryBrands  = brands.filter((b) => b.category === 'battery').map((b) => b.brand)
  const panelBrands    = brands.filter((b) => b.category === 'panel').map((b) => b.brand)

  // ── Municipality auto-detect ─────────────────────────────
  function handleAddressBlur() {
    const detected = detectMunicipality(address)
    if (detected) setMunicipality(detected)
  }

  // ── Bill (R) ↔ kWh conversion via municipality tariff ────
  const tariffRate = getTariffRateForMunicipality(municipality)

  function handleBillChange(value: string) {
    setMonthlyBill(value)
    const bill = parseFloat(value)
    if (Number.isFinite(bill) && bill > 0 && tariffRate > 0) {
      setMonthlyKwh(String(Math.round(bill / tariffRate)))
    } else if (!value) {
      setMonthlyKwh('')
    }
  }

  function handleKwhChange(value: string) {
    setMonthlyKwh(value)
    setMonthlyBill('')
  }

  // ── Computed average kWh for advanced mode ────────────────
  function computeAverageKwh(): string {
    const vals = MONTHS.map((m) => parseFloat(monthlyBreakdown[m])).filter((v) => !isNaN(v))
    if (!vals.length) return ''
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(0)
  }

  // ── Photo upload ──────────────────────────────────────────
  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const urls: string[] = []
      for (const file of Array.from(files)) {
        const ext  = file.name.split('.').pop()
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('quote-photos').upload(path, file)
        if (!upErr) {
          const { data } = supabase.storage.from('quote-photos').getPublicUrl(path)
          urls.push(data.publicUrl)
        }
      }
      setPhotoUrls((prev) => [...prev, ...urls])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url))
  }

  // ── Submit ────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not signed in.'); return }

      const avgKwh = usageMode === 'advanced' ? computeAverageKwh() : monthlyKwh

      const payload = {
        submitted_by:    user.id,
        // Customer
        site_number:     parseInt(siteNumber, 10) || 1,
        customer_name:   customerName,
        customer_phone:  customerPhone  || null,
        customer_email:  customerEmail  || null,
        address:         address        || null,
        municipality,
        // Site
        grid_supply: gridSupply,
        roof_type:   roofType === 'Other' && roofTypeOther ? `Other — ${roofTypeOther}` : roofType,
        storeys,
        // Usage
        usage_mode:      usageMode,
        monthly_kwh:     avgKwh         || null,
        ...(usageMode === 'advanced' && Object.fromEntries(
          MONTHS.map((m) => [`monthly_kwh_${m}`, monthlyBreakdown[m] || null])
        )),
        // System
        system_type:         systemType,
        battery_hours:       batteryHours,
        essential_load:      essentialLoad || '0',
        ev_charger:          evCharger,
        target_offgrid_pct:  targetOffgrid ? parseInt(targetOffgrid) : null,
        // Equipment
        inverter_brand: [inverterBrand, inverterModel].filter(s => s && s !== NO_PREFERENCE).join(' ') || inverterBrand,
        battery_brand:  [batteryBrand,  batteryModel ].filter(s => s && s !== NO_PREFERENCE).join(' ') || batteryBrand,
        panel_brand:    [panelBrand,    panelModel   ].filter(s => s && s !== NO_PREFERENCE).join(' ') || panelBrand,
        // Amendment
        is_amendment:          isAmendment,
        existing_inverter:     isAmendment ? existingInverter  || null : null,
        existing_batteries:    isAmendment ? existingBatteries || null : null,
        existing_panels:       isAmendment ? existingPanels    || null : null,
        existing_monthly_usage:isAmendment ? existingUsage     || null : null,
        existing_monthly_gen:  isAmendment ? existingGen       || null : null,
        existing_monthly_saving:isAmendment? existingSaving    || null : null,
        amendment_scope:       isAmendment ? amendmentScope    || null : null,
        // Photos + notes
        photo_urls: photoUrls,
        notes:      notes || null,
      }

      let { data: inserted, error: dbErr } = await supabase
        .from('quote_requests').insert(payload).select('id').single()
      if (dbErr?.message?.includes('site_number')) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { site_number: _removed, ...fallbackPayload } = payload as typeof payload & { site_number?: number }
        const retry = await supabase.from('quote_requests').insert(fallbackPayload).select('id').single()
        dbErr = retry.error
        inserted = retry.data
      }

      if (dbErr) { setError(dbErr.message); return }

      // Originating website lead → mark converted (best effort)
      if (leadId && inserted?.id) {
        await supabase
          .from('leads')
          .update({ status: 'converted', quote_request_id: inserted.id })
          .eq('id', leadId)
      }

      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex flex-col gap-6 max-w-lg">
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <div>
              <h2 className="text-xl font-bold text-primary">Request submitted</h2>
              <p className="text-muted-foreground mt-1">
                Matthew will review and generate the quote. Check <strong>Quotes</strong> for updates.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={() => router.push('/portal/employee/quotes')}>
                View all quotes
              </Button>
              <Button variant="accent" onClick={() => router.push('/portal/employee/quotes/new')}>
                New request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const canSubmit = !!customerName && (usageMode === 'monthly' ? !!monthlyKwh : MONTHS.some((m) => !!monthlyBreakdown[m]))

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">New Quote Request</h1>
        <p className="text-muted-foreground mt-1">
          Only the customer name and energy usage are required — the calculator
          auto-sizes the system, BOM, and pricing from those. Everything else refines the result.
        </p>
      </div>

      {prefill && (
        <div className="rounded-md bg-accent/10 border border-accent/30 px-4 py-2.5 text-sm text-accent">
          Pre-filled from an existing quote — review and adjust before submitting.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        {/* ── Job type ─────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <SectionHead title="Job Type" />
            <div className="flex items-center gap-4">
              <Toggle label="Amendment" value={isAmendment} onChange={setIsAmendment} />
              <div>
                <p className="text-sm font-medium">{isAmendment ? 'Upgrade / Amendment' : 'New Installation'}</p>
                <p className="text-xs text-muted-foreground">
                  {isAmendment ? 'Adding to or modifying an existing system' : 'Brand new solar installation'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Customer details ──────────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="Customer Details" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Customer Name" required>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="John Smith" />
              </Field>
              <Field label="Site Number">
                <Select value={siteNumber} onChange={setSiteNumber} options={['1', '2', '3', '4', '5']} />
              </Field>
              <Field label="Phone">
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="082 000 0000" />
              </Field>
              <Field label="Email">
                <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="john@example.com" />
              </Field>
              <Field label="Municipality">
                <Select value={municipality} onChange={setMunicipality} options={MUNICIPALITIES} />
              </Field>
            </div>
            <Field label="Address">
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onBlur={handleAddressBlur}
                placeholder="Start typing an address — select from Google suggestions"
              />
            </Field>
          </CardContent>
        </Card>

        {/* ── Existing system (amendment only) ─────────────── */}
        {isAmendment && (
          <Card className="border-warning">
            <CardContent className="pt-5 pb-5 flex flex-col gap-4">
              <SectionHead title="Existing System" />
              <div className="flex flex-col gap-4">
                <ExistingEquipmentRow
                  label="Current Inverter"
                  brands={inverterBrands}
                  withQty={false}
                  modelPlaceholder="Model (e.g. SUN-16K-SG01LP1-EU)"
                  onChange={setExistingInverter}
                />
                <ExistingEquipmentRow
                  label="Current Batteries"
                  brands={batteryBrands}
                  withQty={true}
                  modelPlaceholder="Model + capacity (e.g. SE-G5.3 5.32kWh)"
                  onChange={setExistingBatteries}
                />
                <ExistingEquipmentRow
                  label="Current Panels"
                  brands={panelBrands}
                  withQty={true}
                  modelPlaceholder="Wattage (e.g. 600W)"
                  onChange={setExistingPanels}
                />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Monthly Usage (kWh)">
                  <Input value={existingUsage} onChange={(e) => setExistingUsage(e.target.value)} placeholder="e.g. 850" />
                </Field>
                <Field label="Monthly Generation (kWh)">
                  <Input value={existingGen} onChange={(e) => setExistingGen(e.target.value)} placeholder="e.g. 620" />
                </Field>
                <Field label="Monthly Saving (R)">
                  <Input value={existingSaving} onChange={(e) => setExistingSaving(e.target.value)} placeholder="e.g. 1 450" />
                </Field>
              </div>
              <Field label="Scope of amendment — what needs to change?">
                <textarea
                  value={amendmentScope}
                  onChange={(e) => setAmendmentScope(e.target.value)}
                  placeholder="e.g. Customer wants to add 2 more batteries and 4 extra panels to increase backup time"
                  rows={3}
                  className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
                />
              </Field>
            </CardContent>
          </Card>
        )}

        {/* ── Site information ──────────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="Site Information" />
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Grid Supply" required>
                <Select value={gridSupply} onChange={setGridSupply} options={['Single Phase', 'Three Phase']} />
              </Field>
              <Field label="Roof Type">
                <Select value={roofType} onChange={(v) => { setRoofType(v); if (v !== 'Other') setRoofTypeOther('') }}
                  options={['IBR', 'Corrugated Iron', 'Kliplok', 'Tile', 'Flat/Concrete', 'Other']} />
                {roofType === 'Other' && (
                  <Input
                    value={roofTypeOther}
                    onChange={(e) => setRoofTypeOther(e.target.value)}
                    placeholder="Describe (e.g. Box profile, Zincalume…)"
                    className="mt-1"
                  />
                )}
              </Field>
              <Field label="Storeys">
                <Select value={storeys} onChange={setStoreys} options={['1', '2', '3+']} />
              </Field>
            </div>

            {/* Usage mode toggle */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Energy Usage{usageMode === 'monthly' && <span className="text-destructive ml-0.5">*</span>}
                </p>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
                  <button type="button"
                    onClick={() => setUsageMode('monthly')}
                    className={`px-2.5 py-1 rounded transition-colors ${usageMode === 'monthly' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                    Monthly avg
                  </button>
                  <button type="button"
                    onClick={() => setUsageMode('advanced')}
                    className={`px-2.5 py-1 rounded transition-colors ${usageMode === 'advanced' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                    12-month breakdown
                  </button>
                </div>
              </div>

              {usageMode === 'monthly' ? (
                <div className="flex flex-col gap-1.5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Average monthly usage (kWh)</span>
                      <Input
                        value={monthlyKwh}
                        onChange={(e) => handleKwhChange(e.target.value)}
                        placeholder="e.g. 850"
                        type="number"
                        min="0"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">…or average monthly bill (R)</span>
                      <Input
                        value={monthlyBill}
                        onChange={(e) => handleBillChange(e.target.value)}
                        placeholder="e.g. 2 400"
                        type="number"
                        min="0"
                      />
                    </label>
                  </div>
                  {monthlyBill && monthlyKwh && (
                    <p className="text-xs text-muted-foreground">
                      ≈ <span className="font-medium text-foreground">{monthlyKwh} kWh/month</span> at
                      R{tariffRate.toFixed(2)}/kWh ({municipality})
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {MONTHS.map((m, i) => (
                      <label key={m} className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">{MONTH_LABELS[i]}</span>
                        <Input
                          value={monthlyBreakdown[m]}
                          onChange={(e) => setMonthlyBreakdown((prev) => ({ ...prev, [m]: e.target.value }))}
                          placeholder="kWh"
                          type="number"
                          min="0"
                          className="h-8 text-xs px-2"
                        />
                      </label>
                    ))}
                  </div>
                  {computeAverageKwh() && (
                    <p className="text-xs text-muted-foreground">
                      Average: <span className="font-medium text-foreground">{computeAverageKwh()} kWh/month</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Design preferences (optional — calculator auto-sizes) ── */}
        <details className="group rounded-xl border border-border">
          <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Design Preferences</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Optional — leave closed and the calculator sizes the system from usage alone.
              </p>
            </div>
            <span className="text-xs text-muted-foreground group-open:hidden">Expand</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">Collapse</span>
          </summary>
          <div className="flex flex-col gap-5 px-5 pb-5">

        {/* ── System requirements ───────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="System Requirements" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="System Type">
                <Select value={systemType} onChange={setSystemType}
                  options={[AUTO_SIZE, 'Hybrid', 'Off-grid', 'Grid-tie']} />
              </Field>
              <Field label="Battery Backup">
                <Select value={batteryHours} onChange={setBatteryHours}
                  options={[AUTO_SIZE, '2 hours', '4 hours', '6 hours', '8 hours', '12 hours']} />
              </Field>
              <Field label="Essential Load During Backup (kW)">
                <Input value={essentialLoad} onChange={(e) => setEssentialLoad(e.target.value)}
                  placeholder="e.g. 3  (leave blank if unknown)" type="number" min="0" />
              </Field>
              <Field label="Target Off-grid %">
                <div className="relative">
                  <Input value={targetOffgrid} onChange={(e) => setTargetOffgrid(e.target.value)}
                    placeholder="e.g. 80  (blank = full backup)" type="number" min="0" max="100"
                    className="pr-8" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </Field>
              <Field label="EV Charger Required">
                <Select value={evCharger} onChange={setEvCharger}
                  options={['No', 'Yes — 7kW', 'Yes — 11kW', 'Yes — 22kW']} />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* ── Equipment preference ──────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="Equipment Preference" />
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Inverter Brand">
                <Select value={inverterBrand} onChange={(v) => { setInverterBrand(v); if (!v || v === NO_PREFERENCE) setInverterModel('') }}
                  options={[NO_PREFERENCE, ...inverterBrands]} />
                {inverterBrand && inverterBrand !== NO_PREFERENCE && (
                  <Input value={inverterModel} onChange={(e) => setInverterModel(e.target.value)}
                    placeholder="Specific model (optional)" className="mt-1" />
                )}
              </Field>
              <Field label="Battery Brand">
                <Select value={batteryBrand} onChange={(v) => { setBatteryBrand(v); if (!v || v === NO_PREFERENCE) setBatteryModel('') }}
                  options={[NO_PREFERENCE, ...batteryBrands]} />
                {batteryBrand && batteryBrand !== NO_PREFERENCE && (
                  <Input value={batteryModel} onChange={(e) => setBatteryModel(e.target.value)}
                    placeholder="Specific model (optional)" className="mt-1" />
                )}
              </Field>
              <Field label="Panel Brand">
                <Select value={panelBrand} onChange={(v) => { setPanelBrand(v); if (!v || v === NO_PREFERENCE) setPanelModel('') }}
                  options={[NO_PREFERENCE, ...panelBrands]} />
                {panelBrand && panelBrand !== NO_PREFERENCE && (
                  <Input value={panelModel} onChange={(e) => setPanelModel(e.target.value)}
                    placeholder="Specific model (optional)" className="mt-1" />
                )}
              </Field>
            </div>
          </CardContent>
        </Card>

          </div>
        </details>

        {/* ── Site photos ───────────────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="Site Photos" />
            <p className="text-sm text-muted-foreground -mt-2">
              Upload photos of the DB board, roof, cable routes, and inverter location. These help generate accurate quotes.
            </p>

            {/* Upload button */}
            <label className="flex items-center gap-2 cursor-pointer self-start">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                className="sr-only"
              />
              <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                <span>
                  {uploading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</>
                    : <><Upload className="h-3.5 w-3.5" />Add photos</>}
                </span>
              </Button>
            </label>

            {/* Thumbnails */}
            {photoUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photoUrls.map((url) => (
                  <div key={url} className="relative group aspect-square rounded-md overflow-hidden border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Site photo" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!photoUrls.length && !uploading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm border border-dashed border-border rounded-md px-4 py-6 justify-center">
                <ImageIcon className="h-4 w-4" />
                No photos added yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Notes ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-3">
            <SectionHead title="Additional Notes" />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conduit route length, shade issues, existing DB layout, trench required, special requirements…"
              rows={4}
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
            />
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-2">{error}</p>
        )}

        <Button type="submit" variant="accent" size="lg" disabled={loading || !canSubmit} className="self-start">
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
            : <><FileText className="h-4 w-4" />Submit for Review</>}
        </Button>

      </form>
    </div>
  )
}
