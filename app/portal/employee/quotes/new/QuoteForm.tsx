'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { detectMunicipality, MUNICIPALITIES } from '@/lib/solar/municipalities'
import { FileText, Loader2, CheckCircle2, Upload, X, Image as ImageIcon } from 'lucide-react'
import type { EquipmentBrand } from '@/types/database'

// ── Constants ────────────────────────────────────────────────
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type MonthKey = typeof MONTHS[number]

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

// ── Main component ───────────────────────────────────────────
interface Props { brands: EquipmentBrand[] }

export function QuoteForm({ brands }: Props) {
  const router = useRouter()

  // Job type
  const [isAmendment, setIsAmendment] = useState(false)

  // Customer
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [address,       setAddress]       = useState('')
  const [municipality,  setMunicipality]  = useState('City of Johannesburg')
  const [siteNumber,    setSiteNumber]    = useState('1')

  // Existing system (amendment only)
  const [existingInverter,  setExistingInverter]  = useState('')
  const [existingBatteries, setExistingBatteries] = useState('')
  const [existingPanels,    setExistingPanels]    = useState('')
  const [existingUsage,     setExistingUsage]     = useState('')
  const [existingGen,       setExistingGen]       = useState('')
  const [existingSaving,    setExistingSaving]    = useState('')
  const [amendmentScope,    setAmendmentScope]    = useState('')

  // Site
  const [gridSupply, setGridSupply] = useState('Single Phase')
  const [roofType,   setRoofType]   = useState('IBR')
  const [storeys,    setStoreys]    = useState('1')

  // Usage
  const [usageMode,   setUsageMode]   = useState<'monthly' | 'advanced'>('monthly')
  const [monthlyKwh,  setMonthlyKwh]  = useState('')
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<Record<MonthKey, string>>(
    Object.fromEntries(MONTHS.map((m) => [m, ''])) as Record<MonthKey, string>
  )

  // System requirements
  const [systemType,       setSystemType]       = useState('AI will determine')
  const [batteryHours,     setBatteryHours]      = useState('AI will determine')
  const [essentialLoad,    setEssentialLoad]     = useState('')
  const [targetOffgrid,    setTargetOffgrid]     = useState('')
  const [evCharger,        setEvCharger]         = useState('No')

  // Equipment preferences
  const [inverterBrand, setInverterBrand] = useState('No preference — AI will recommend')
  const [batteryBrand,  setBatteryBrand]  = useState('No preference — AI will recommend')
  const [panelBrand,    setPanelBrand]    = useState('No preference — AI will recommend')

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
        grid_supply:     gridSupply,
        roof_type:       roofType,
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
        inverter_brand:  inverterBrand,
        battery_brand:   batteryBrand,
        panel_brand:     panelBrand,
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

      let { error: dbErr } = await supabase.from('quote_requests').insert(payload)
      if (dbErr?.message?.includes('site_number')) {
        const fallbackPayload = { ...payload }
        delete (fallbackPayload as typeof payload & { site_number?: number }).site_number
        const retry = await supabase.from('quote_requests').insert(fallbackPayload)
        dbErr = retry.error
      }

      if (dbErr) { setError(dbErr.message); return }
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
          Fill in the site survey — Matthew will review and generate the quote.
        </p>
      </div>

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
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={handleAddressBlur}
                placeholder="12 Maple Street, Midrand, 1685 — municipality auto-detects on exit"
              />
            </Field>
          </CardContent>
        </Card>

        {/* ── Existing system (amendment only) ─────────────── */}
        {isAmendment && (
          <Card className="border-warning">
            <CardContent className="pt-5 pb-5 flex flex-col gap-4">
              <SectionHead title="Existing System" />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Current Inverter (brand + model)">
                  <Input value={existingInverter} onChange={(e) => setExistingInverter(e.target.value)} placeholder="e.g. Deye 16kW SUN-16K-SG01LP1-EU" />
                </Field>
                <Field label="Current Batteries (qty × brand × kWh)">
                  <Input value={existingBatteries} onChange={(e) => setExistingBatteries(e.target.value)} placeholder="e.g. 2 × Deye SE-G5.3 (5.32kWh each)" />
                </Field>
                <Field label="Current Panels (qty × brand × W)">
                  <Input value={existingPanels} onChange={(e) => setExistingPanels(e.target.value)} placeholder="e.g. 8 × JA Solar 600W" />
                </Field>
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
                <Select value={roofType} onChange={setRoofType}
                  options={['IBR', 'Corrugated Iron', 'Kliplok', 'Tile', 'Flat/Concrete', 'Other']} />
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
                <Input
                  value={monthlyKwh}
                  onChange={(e) => setMonthlyKwh(e.target.value)}
                  placeholder="Average monthly usage in kWh (e.g. 850)"
                  type="number"
                  min="0"
                />
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

        {/* ── System requirements ───────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="System Requirements" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="System Type">
                <Select value={systemType} onChange={setSystemType}
                  options={['AI will determine', 'Hybrid', 'Off-grid', 'Grid-tie']} />
              </Field>
              <Field label="Battery Backup">
                <Select value={batteryHours} onChange={setBatteryHours}
                  options={['AI will determine', '2 hours', '4 hours', '6 hours', '8 hours', '12 hours']} />
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
                <Select value={inverterBrand} onChange={setInverterBrand}
                  options={inverterBrands.length ? inverterBrands : ['No preference — AI will recommend']} />
              </Field>
              <Field label="Battery Brand">
                <Select value={batteryBrand} onChange={setBatteryBrand}
                  options={batteryBrands.length ? batteryBrands : ['No preference — AI will recommend']} />
              </Field>
              <Field label="Panel Brand">
                <Select value={panelBrand} onChange={setPanelBrand}
                  options={panelBrands.length ? panelBrands : ['No preference — AI will recommend']} />
              </Field>
            </div>
          </CardContent>
        </Card>

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
