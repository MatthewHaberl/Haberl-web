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
import { ExistingArrayBuilder, type ArrayString } from './ExistingArrayBuilder'

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
type MonthKey = typeof MONTHS[number]

const AUTO = 'Auto — sized from usage'
const NO_PREF = 'No preference'
const DAYS_PER_MONTH = 30.4 // 365 ÷ 12 — derive monthly usage from a daily figure

const LOAD_PROFILES = [
  { id: '',             label: 'Not sure / skip' },
  { id: 'office',       label: 'Office · 8–5 (battery: low)' },
  { id: '24-7',         label: '24/7 business (battery: high)' },
  { id: 'evening-home', label: 'Evening home (battery: high)' },
  { id: 'daytime-home', label: 'Daytime home (battery: medium)' },
  { id: 'family',       label: 'Family home (battery: med–high)' },
  { id: 'flat',         label: 'Flat baseload (battery: high)' },
]

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
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

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[] | string[] }) {
  const opts = options.map((o) => (typeof o === 'string' ? { id: o, label: o } : o))
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-accent' : 'bg-border'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export interface PrefillV2 {
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  customer_address?: string | null
  is_business?: boolean | null
  contact_name?: string | null
  contact_email?: string | null
  address?: string | null
  site_label?: string | null
  municipality?: string | null
  site_number?: number | null
  grid_supply?: string | null
  roof_type?: string | null
  storeys?: string | null
  monthly_kwh?: string | null
  load_profile?: string | null
  inverter_brand?: string | null
  battery_brand?: string | null
  panel_brand?: string | null
}

interface Props {
  brands: EquipmentBrand[]
  prefill?: PrefillV2 | null
  leadId?: string | null
}

export function QuoteFormV2({ brands, prefill, leadId }: Props) {
  const router = useRouter()

  const [isAmendment, setIsAmendment] = useState(false)

  // Customer
  const [customerName, setCustomerName]       = useState(prefill?.customer_name ?? '')
  const [customerPhone, setCustomerPhone]     = useState(prefill?.customer_phone ?? '')
  const [customerEmail, setCustomerEmail]     = useState(prefill?.customer_email ?? '')
  const [customerAddress, setCustomerAddress] = useState(prefill?.customer_address ?? '')
  const [isBusiness, setIsBusiness]           = useState(prefill?.is_business ?? false)
  const [contactName, setContactName]         = useState(prefill?.contact_name ?? '')
  const [contactEmail, setContactEmail]       = useState(prefill?.contact_email ?? '')

  // Site
  const [siteLabel, setSiteLabel]       = useState(prefill?.site_label ?? '')
  const [siteAddress, setSiteAddress]   = useState(prefill?.address ?? '')
  const [municipality, setMunicipality] = useState(prefill?.municipality ?? 'City of Johannesburg')
  const [gridSupply, setGridSupply]     = useState(prefill?.grid_supply ?? 'Single Phase')
  const [roofType, setRoofType]         = useState(prefill?.roof_type ?? 'IBR')
  const [storeys, setStoreys]           = useState(prefill?.storeys ?? '1')

  // Usage (optional)
  const [usageMode, setUsageMode]   = useState<'monthly' | 'advanced'>('monthly')
  const [monthlyKwh, setMonthlyKwh] = useState(prefill?.monthly_kwh ?? '')
  const [monthlyBill, setMonthlyBill] = useState('')
  const [dailyKwh, setDailyKwh] = useState('')
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<Record<MonthKey, string>>(
    Object.fromEntries(MONTHS.map((m) => [m, ''])) as Record<MonthKey, string>,
  )
  const [loadProfile, setLoadProfile] = useState(prefill?.load_profile ?? '')
  const [upgradeReason, setUpgradeReason] = useState('')

  // Brand preference
  const [inverterBrand, setInverterBrand] = useState(prefill?.inverter_brand ?? NO_PREF)
  const [batteryBrand, setBatteryBrand]   = useState(prefill?.battery_brand ?? NO_PREF)
  const [panelBrand, setPanelBrand]       = useState(prefill?.panel_brand ?? NO_PREF)

  // Existing system
  const [existingInverter, setExistingInverter]   = useState('')
  const [existingBatteries, setExistingBatteries] = useState('')
  const [existingPanels, setExistingPanels]       = useState('')
  const [amendmentScope, setAmendmentScope]       = useState('')
  const [existingArray, setExistingArray]         = useState<ArrayString[]>([])

  // Photos + notes
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes]         = useState('')

  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [submitted, setSubmitted] = useState(false)

  const inverterBrands = brands.filter((b) => b.category === 'inverter').map((b) => b.brand)
  const batteryBrands  = brands.filter((b) => b.category === 'battery').map((b) => b.brand)
  const panelBrands    = brands.filter((b) => b.category === 'panel').map((b) => b.brand)

  const tariffRate = getTariffRateForMunicipality(municipality)

  function handleAddressBlur() {
    const detected = detectMunicipality(siteAddress)
    if (detected) setMunicipality(detected)
  }
  function handleBillChange(value: string) {
    setMonthlyBill(value)
    setDailyKwh('')
    const bill = parseFloat(value)
    if (Number.isFinite(bill) && bill > 0 && tariffRate > 0) setMonthlyKwh(String(Math.round(bill / tariffRate)))
    else if (!value) setMonthlyKwh('')
  }
  function handleDailyChange(value: string) {
    setDailyKwh(value)
    setMonthlyBill('')
    const daily = parseFloat(value)
    if (Number.isFinite(daily) && daily > 0) setMonthlyKwh(String(Math.round(daily * DAYS_PER_MONTH)))
    else if (!value) setMonthlyKwh('')
  }
  function avgKwh(): string {
    const vals = MONTHS.map((m) => parseFloat(monthlyBreakdown[m])).filter((v) => !isNaN(v))
    if (!vals.length) return ''
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(0)
  }

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
        const ext = file.name.split('.').pop()
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('quote-photos').upload(path, file)
        if (!upErr) urls.push(supabase.storage.from('quote-photos').getPublicUrl(path).data.publicUrl)
      }
      setPhotoUrls((prev) => [...prev, ...urls])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not signed in.'); return }

      const usage = usageMode === 'advanced' ? avgKwh() : monthlyKwh

      const payload = {
        submitted_by:    user.id,
        site_number:     prefill?.site_number ?? 1,
        // Customer
        customer_name:    customerName,
        customer_phone:   customerPhone || null,
        customer_email:   customerEmail || null,
        customer_address: customerAddress || null,
        is_business:      isBusiness,
        contact_name:     isBusiness ? contactName || null : null,
        contact_email:    isBusiness ? contactEmail || null : null,
        // Site
        site_label:   siteLabel || null,
        address:      siteAddress || null,
        municipality,
        grid_supply:  gridSupply,
        roof_type:    roofType,
        storeys,
        // Usage (optional)
        usage_mode:   usageMode,
        monthly_kwh:  usage || null,
        ...(usageMode === 'advanced' && Object.fromEntries(MONTHS.map((m) => [`monthly_kwh_${m}`, monthlyBreakdown[m] || null]))),
        load_profile:   loadProfile || null,
        upgrade_reason: isAmendment ? upgradeReason || null : null,
        // System auto-sized
        system_type:   AUTO,
        battery_hours: AUTO,
        essential_load: '0',
        // Brand preference
        inverter_brand: inverterBrand === NO_PREF ? NO_PREF : inverterBrand,
        battery_brand:  batteryBrand === NO_PREF ? NO_PREF : batteryBrand,
        panel_brand:    panelBrand === NO_PREF ? NO_PREF : panelBrand,
        // Existing
        is_amendment:       isAmendment,
        existing_inverter:  isAmendment ? existingInverter || null : null,
        existing_batteries: isAmendment ? existingBatteries || null : null,
        existing_panels:    isAmendment ? existingPanels || null : null,
        existing_array:     isAmendment && existingArray.length ? existingArray : null,
        amendment_scope:    isAmendment ? amendmentScope || null : null,
        // Photos + notes
        photo_urls: photoUrls,
        notes:      notes || null,
      }

      const { data: inserted, error: dbErr } = await supabase
        .from('quote_requests').insert(payload).select('id').single()
      if (dbErr) { setError(dbErr.message); return }

      if (leadId && inserted?.id) {
        await supabase.from('leads').update({ status: 'converted', quote_request_id: inserted.id }).eq('id', leadId)
      }
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <Card className="max-w-lg">
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <div>
            <h2 className="text-xl font-bold text-primary">Request submitted</h2>
            <p className="text-muted-foreground mt-1">It now shows under the customer in Quotes.</p>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" onClick={() => router.push('/portal/employee/quotes-v2')}>View all quotes</Button>
            <Button variant="accent" onClick={() => router.push('/portal/employee/quotes-v2/new')}>New request</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">New quote</h1>
        <p className="text-muted-foreground mt-1">Only the customer name is required — the calculator auto-sizes from usage. Everything else refines it.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* 1 · Customer */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="1 · Customer" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Customer Name" required>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="John Smith" />
              </Field>
              <Field label="Email">
                <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="john@example.com" />
              </Field>
              <Field label="Phone">
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="082 000 0000" />
              </Field>
              <Field label="Customer Address">
                <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Billing / home address" />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Toggle value={isBusiness} onChange={setIsBusiness} />
              <span className="text-sm font-medium">This customer is a business</span>
            </div>
            {isBusiness && (
              <div className="grid sm:grid-cols-2 gap-4 rounded-lg border border-dashed border-border p-4">
                <Field label="Contact Person">
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" />
                </Field>
                <Field label="Contact Email">
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@business.co.za" />
                </Field>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2 · Site */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="2 · Site" hint="A customer can have more than one site — give it a name." />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Site Label">
                <Input value={siteLabel} onChange={(e) => setSiteLabel(e.target.value)} placeholder="Home, Business, Boksburg branch…" />
              </Field>
              <Field label="Municipality">
                <Select value={municipality} onChange={setMunicipality} options={MUNICIPALITIES} />
              </Field>
            </div>
            <Field label="Site Address">
              <AddressAutocomplete value={siteAddress} onChange={setSiteAddress} onBlur={handleAddressBlur} placeholder="The site's own address" />
            </Field>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Grid Supply" required>
                <Select value={gridSupply} onChange={setGridSupply} options={['Single Phase', 'Three Phase']} />
              </Field>
              <Field label="Roof Type">
                <Select value={roofType} onChange={setRoofType} options={['IBR', 'Corrugated Iron', 'Kliplok', 'Tile', 'Flat/Concrete', 'Other']} />
              </Field>
              <Field label="Storeys">
                <Select value={storeys} onChange={setStoreys} options={['1', '2', '3+']} />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* 3 · Job type */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="3 · Job type" />
            <div className="flex items-center gap-4">
              <Toggle value={isAmendment} onChange={setIsAmendment} />
              <div>
                <p className="text-sm font-medium">{isAmendment ? 'Existing system — upgrade / amendment' : 'New installation'}</p>
                <p className="text-xs text-muted-foreground">{isAmendment ? 'We capture what exists and what must change' : 'Brand new solar installation'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing system (conditional) */}
        {isAmendment && (
          <Card className="border-warning">
            <CardContent className="pt-5 pb-5 flex flex-col gap-4">
              <SectionHead title="Existing system" hint="Once monitoring is integrated, usage auto-fills from the inverter." />
              <Field label="Reason for upgrade">
                <Select value={upgradeReason} onChange={setUpgradeReason} options={[
                  { id: '', label: 'Select…' },
                  { id: 'higher-usage', label: 'Higher usage — needs more capacity' },
                  { id: 'fault', label: 'Fault / replacement' },
                  { id: 'other', label: 'Other' },
                ]} />
              </Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Current Inverter"><Input value={existingInverter} onChange={(e) => setExistingInverter(e.target.value)} placeholder="Brand + model" /></Field>
                <Field label="Current Batteries"><Input value={existingBatteries} onChange={(e) => setExistingBatteries(e.target.value)} placeholder="Brand + kWh" /></Field>
                <Field label="Current Panels"><Input value={existingPanels} onChange={(e) => setExistingPanels(e.target.value)} placeholder="Count × watt" /></Field>
              </div>
              <Field label="Scope — what needs to change?">
                <textarea value={amendmentScope} onChange={(e) => setAmendmentScope(e.target.value)} rows={3}
                  className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
              </Field>
              <ExistingArrayBuilder value={existingArray} onChange={setExistingArray} />
            </CardContent>
          </Card>
        )}

        {/* 4 · Usage (optional) */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="4 · Usage" hint="Optional. Leave blank and we forecast generation; fill it in to compare against the old bill." />
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
                <button type="button" onClick={() => setUsageMode('monthly')}
                  className={`px-2.5 py-1 rounded ${usageMode === 'monthly' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>Monthly avg</button>
                <button type="button" onClick={() => setUsageMode('advanced')}
                  className={`px-2.5 py-1 rounded ${usageMode === 'advanced' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>12-month</button>
              </div>
            </div>
            {usageMode === 'monthly' ? (
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Average monthly usage (kWh)">
                  <Input value={monthlyKwh} onChange={(e) => { setMonthlyKwh(e.target.value); setMonthlyBill(''); setDailyKwh('') }} type="number" min="0" placeholder="e.g. 850" />
                </Field>
                <Field label="…or average daily usage (kWh)">
                  <Input value={dailyKwh} onChange={(e) => handleDailyChange(e.target.value)} type="number" min="0" placeholder="e.g. 28" />
                </Field>
                <Field label="…or average monthly bill (R)">
                  <Input value={monthlyBill} onChange={(e) => handleBillChange(e.target.value)} type="number" min="0" placeholder="e.g. 2 400" />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {MONTHS.map((m, i) => (
                  <label key={m} className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{MONTH_LABELS[i]}</span>
                    <Input value={monthlyBreakdown[m]} onChange={(e) => setMonthlyBreakdown((p) => ({ ...p, [m]: e.target.value }))} type="number" min="0" className="h-8 text-xs px-2" />
                  </label>
                ))}
              </div>
            )}
            <Field label="Load profile (guides battery sizing)">
              <Select value={loadProfile} onChange={setLoadProfile} options={LOAD_PROFILES} />
            </Field>
          </CardContent>
        </Card>

        {/* 5 · Brand preference */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="5 · Brand preference" hint="Optional." />
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Inverter"><Select value={inverterBrand} onChange={setInverterBrand} options={[NO_PREF, ...inverterBrands]} /></Field>
              <Field label="Battery"><Select value={batteryBrand} onChange={setBatteryBrand} options={[NO_PREF, ...batteryBrands]} /></Field>
              <Field label="Panel"><Select value={panelBrand} onChange={setPanelBrand} options={[NO_PREF, ...panelBrands]} /></Field>
            </div>
          </CardContent>
        </Card>

        {/* 6 · Photos + notes */}
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <SectionHead title="6 · Photos & notes" />
            <label className="flex items-center gap-2 cursor-pointer self-start">
              <input type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="sr-only" />
              <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                <span>{uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</> : <><Upload className="h-3.5 w-3.5" />Add photos</>}</span>
              </Button>
            </label>
            {photoUrls.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photoUrls.map((url) => (
                  <div key={url} className="relative group aspect-square rounded-md overflow-hidden border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Site photo" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setPhotoUrls((p) => p.filter((u) => u !== url))}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground text-sm border border-dashed border-border rounded-md px-4 py-6 justify-center">
                <ImageIcon className="h-4 w-4" /> No photos added yet
              </div>
            )}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Conduit route, shade, DB layout, special requirements…"
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-2">{error}</p>}

        <Button type="submit" variant="accent" size="lg" disabled={loading || !customerName} className="self-start">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : <><FileText className="h-4 w-4" />Submit</>}
        </Button>
      </form>
    </div>
  )
}
