'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, type InputProps } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormField } from '@/components/ui/form-field'
import { Check, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { CIRCUIT_THEME, type CanvasColorOverrides, type CircuitLayer } from '@/lib/solar/canvas-theme'
import { OVERTIME_DAILY_HOURS } from '@/lib/staff/pay'

interface TariffRow {
  municipality: string
  rate: string
}

// One editable swatch row per circuit colour the canvas uses. `field` is the
// CircuitStyle key the colour writes to (Earth's stripe is a second row).
const CANVAS_COLOR_ROWS: Array<{ layer: CircuitLayer; field: 'stroke' | 'stripe'; label: string }> = [
  { layer: 'pv',      field: 'stroke', label: 'PV / DC' },
  { layer: 'battery', field: 'stroke', label: 'Battery' },
  { layer: 'ac',      field: 'stroke', label: 'AC' },
  { layer: 'earth',   field: 'stroke', label: 'Earth' },
  { layer: 'earth',   field: 'stripe', label: 'Earth stripe' },
  { layer: 'data',    field: 'stroke', label: 'Data' },
]

// Default for a (layer, field) cell from the brand theme — the fallback every
// unset override resolves to.
function canvasDefault(layer: CircuitLayer, field: 'stroke' | 'stripe'): string {
  return (CIRCUIT_THEME[layer][field] as string | undefined) ?? '#000000'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CompanySettingsForm({ initial }: { initial: Record<string, any> }) {
  const banking = (initial.banking ?? {}) as Record<string, string>

  const [companyName, setCompanyName] = useState(String(initial.company_name ?? 'Haberl Electrical & Solar'))
  const [contactEmail, setContactEmail] = useState(String(initial.contact_email ?? ''))
  const [contactPhone, setContactPhone] = useState(String(initial.contact_phone ?? ''))

  const [bank, setBank] = useState(banking.bank ?? '')
  const [accountName, setAccountName] = useState(banking.account_name ?? '')
  const [accountNumber, setAccountNumber] = useState(banking.account_number ?? '')
  const [branchCode, setBranchCode] = useState(banking.branch_code ?? '')
  const [accountType, setAccountType] = useState(banking.account_type ?? '')

  const [quotePrefix, setQuotePrefix] = useState(String(initial.quote_prefix ?? 'QUO'))
  const [expiryDays, setExpiryDays] = useState(String(initial.quote_expiry_days ?? 30))

  const [labourRate, setLabourRate] = useState(String(initial.labour_hourly_rate_rands ?? 750))
  const [dayRate, setDayRate] = useState(String(initial.labour_day_rate_rands ?? 5500))
  const [calloutFee, setCalloutFee] = useState(String(initial.callout_fee_rands ?? 750))
  const [crewDays, setCrewDays] = useState(String(initial.crew_days_default ?? 1))
  const [crewHours, setCrewHours] = useState(String(initial.crew_hours_per_day ?? 9))
  const [managementFee, setManagementFee] = useState(String(initial.management_fee_rands ?? 750))
  const [managementOn, setManagementOn] = useState(initial.management_fee_default !== false)

  const [markupPct, setMarkupPct] = useState(String(initial.markup_pct ?? 15))
  const [cocFee, setCocFee] = useState(String(initial.coc_fee_rands ?? 1500))
  const [labourInverter, setLabourInverter] = useState(String(initial.labour_inverter_per_w ?? 0.25))
  const [labourPanel, setLabourPanel] = useState(String(initial.labour_panel_per_w ?? 0.75))
  const [premium2, setPremium2] = useState(String(initial.storey_premium_2 ?? 2000))
  const [premium3, setPremium3] = useState(String(initial.storey_premium_3 ?? 5000))

  const [tariffs, setTariffs] = useState<TariffRow[]>(() => {
    const source = (initial.tariffs ?? {}) as Record<string, number>
    const rows = Object.entries(source).map(([municipality, rate]) => ({ municipality, rate: String(rate) }))
    return rows.length ? rows : [{ municipality: 'Eskom', rate: '2.65' }]
  })

  // Canvas colours — a partial override per circuit layer. The working state holds
  // the *effective* colour per row (override if set, else brand default); on save we
  // diff against the defaults and store only the changed cells.
  const [canvasColors, setCanvasColors] = useState<CanvasColorOverrides>(() => {
    const stored = (initial.canvas_colors ?? null) as CanvasColorOverrides | null
    return stored ?? {}
  })
  const canvasColorOf = (layer: CircuitLayer, field: 'stroke' | 'stripe'): string =>
    (canvasColors[layer]?.[field] as string | undefined) ?? canvasDefault(layer, field)
  const setCanvasColor = (layer: CircuitLayer, field: 'stroke' | 'stripe', value: string) =>
    setCanvasColors((prev) => ({ ...prev, [layer]: { ...(prev[layer] ?? {}), [field]: value } }))
  const resetCanvasColor = (layer: CircuitLayer, field: 'stroke' | 'stripe') =>
    setCanvasColors((prev) => {
      const layerPatch = { ...(prev[layer] ?? {}) }
      delete layerPatch[field]
      const next = { ...prev }
      if (Object.keys(layerPatch).length === 0) delete next[layer]
      else next[layer] = layerPatch
      return next
    })
  const isCanvasColorOverridden = (layer: CircuitLayer, field: 'stroke' | 'stripe'): boolean =>
    canvasColors[layer]?.[field] !== undefined

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function num(value: string, fallback: number) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError('')
    const supabase = createClient()
    const tariffMap: Record<string, number> = {}
    for (const row of tariffs) {
      const name = row.municipality.trim()
      const rate = Number(row.rate)
      if (name && Number.isFinite(rate) && rate > 0) tariffMap[name] = rate
    }
    const { error: dbError } = await supabase
      .from('company_settings')
      .update({
        company_name: companyName.trim() || 'Haberl Electrical & Solar',
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        banking: {
          bank: bank.trim(),
          account_name: accountName.trim(),
          account_number: accountNumber.trim(),
          branch_code: branchCode.trim(),
          account_type: accountType.trim(),
        },
        quote_prefix: (quotePrefix.trim() || 'QUO').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'QUO',
        quote_expiry_days: Math.max(1, Math.round(num(expiryDays, 30))),
        labour_hourly_rate_rands: num(labourRate, 750),
        labour_day_rate_rands: num(dayRate, 5500),
        callout_fee_rands: num(calloutFee, 750),
        crew_days_default: num(crewDays, 1),
        crew_hours_per_day: num(crewHours, 9),
        management_fee_rands: num(managementFee, 750),
        management_fee_default: managementOn,
        markup_pct: num(markupPct, 15),
        coc_fee_rands: num(cocFee, 1500),
        labour_inverter_per_w: num(labourInverter, 0.25),
        labour_panel_per_w: num(labourPanel, 0.75),
        storey_premium_2: num(premium2, 2000),
        storey_premium_3: num(premium3, 5000),
        tariffs: tariffMap,
        // Only the changed cells live in state; store null when nothing is overridden
        // so the canvas falls straight back to the brand defaults.
        canvas_colors: Object.keys(canvasColors).length ? canvasColors : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
    if (dbError) setError(dbError.message)
    else setSaved(true)
    setSaving(false)
  }

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    props: Partial<InputProps> = {},
    hint?: string,
  ) => (
    <FormField label={label} hint={hint}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} {...props} />
    </FormField>
  )

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Company & contact</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {field('Company name', companyName, setCompanyName)}
            {field('Contact email (admin notifications go here)', contactEmail, setContactEmail, { type: 'email' })}
            {field('Contact phone', contactPhone, setContactPhone)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">EFT banking details</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Shown to customers on the quote acceptance page and in deposit emails.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {field('Bank', bank, setBank, { placeholder: 'e.g. FNB' })}
            {field('Account name', accountName, setAccountName)}
            {field('Account number', accountNumber, setAccountNumber)}
            {field('Branch code', branchCode, setBranchCode)}
            {field('Account type', accountType, setAccountType, { placeholder: 'e.g. Cheque' })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Quote defaults</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {field('Quote number prefix', quotePrefix, setQuotePrefix, { placeholder: 'QUO' })}
            {field('Quote validity', expiryDays, setExpiryDays, { type: 'number', min: 1, trailingText: 'days' })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Labour defaults</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            What a new scope quote opens on. Every one of these stays editable on the quote
            itself, and saved quotes keep the figures they were priced at.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {field('Hourly rate', labourRate, setLabourRate, { type: 'number', step: '25', min: 0, leadingText: 'R', trailingText: '/hr' })}
            {field('Team day rate', dayRate, setDayRate, { type: 'number', step: '100', min: 0, leadingText: 'R', trailingText: '/day' }, 'Standard on-site team, full day.')}
            {field('Call-out fee', calloutFee, setCalloutFee, { type: 'number', step: '50', min: 0, leadingText: 'R' }, 'Also the one-hour minimum — the first hour is not billed twice.')}
            {field('Days on site', crewDays, setCrewDays, { type: 'number', step: '0.5', min: 0, trailingText: 'days' }, 'Opening figure on the crew shift block. Half-days allowed.')}
            {field('Hours per day', crewHours, setCrewHours, { type: 'number', step: '0.5', min: 0, trailingText: 'hrs' }, `Prices the crew and converts hours to days. Payroll still pays overtime past ${OVERTIME_DAILY_HOURS} hours a day, whatever you set here.`)}
            {field('Management fee', managementFee, setManagementFee, { type: 'number', step: '50', min: 0, leadingText: 'R' }, 'Flat per job, for supervising and running the work. Folded into the labour total — never a separate line to the customer.')}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={managementOn}
              onChange={(e) => setManagementOn(e.target.checked)}
            />
            Add the management fee to new quotes
          </label>
          <p className="text-xs text-muted-foreground -mt-1">
            Still removable on any quote — untick it on the jobs you work yourself, where
            your own hours are already being billed. Quotes already written keep what they say.
            Solar designs are opt-in instead: tick “Management fee” on the BOM panel, which
            pre-fills the amount above and bills it as its own labour line.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Pricing policy</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Used by the quote calculator from the next calculation onwards.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {field('Markup on cost', markupPct, setMarkupPct, { type: 'number', step: '0.5', min: 0, trailingText: '%' })}
            {field('COC fee', cocFee, setCocFee, { type: 'number', step: '50', min: 0, leadingText: 'R' })}
            {field('Labour — inverter', labourInverter, setLabourInverter, { type: 'number', step: '0.01', min: 0, leadingText: 'R', trailingText: '/W' })}
            {field('Labour — panels', labourPanel, setLabourPanel, { type: 'number', step: '0.01', min: 0, leadingText: 'R', trailingText: '/W' })}
            {field('2-storey access premium', premium2, setPremium2, { type: 'number', step: '100', min: 0, leadingText: 'R' })}
            {field('3+-storey access premium', premium3, setPremium3, { type: 'number', step: '100', min: 0, leadingText: 'R' })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Electricity tariffs (R/kWh)</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Default rate per municipality — pre-fills the tariff on new quotes (still editable per
            quote). Include an <strong>Eskom</strong> row as the fallback.
          </p>
          <div className="flex flex-col gap-2">
            {tariffs.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={row.municipality}
                  onChange={(e) => setTariffs((prev) => prev.map((r, i) => (i === index ? { ...r, municipality: e.target.value } : r)))}
                  placeholder="Municipality"
                  className="flex-1"
                />
                <Input
                  value={row.rate}
                  onChange={(e) => setTariffs((prev) => prev.map((r, i) => (i === index ? { ...r, rate: e.target.value } : r)))}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="R/kWh"
                  className="w-28"
                />
                <button
                  type="button"
                  onClick={() => setTariffs((prev) => prev.filter((_, i) => i !== index))}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setTariffs((prev) => [...prev, { municipality: '', rate: '' }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add municipality
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Diagram colours</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Circuit colours used by the design canvas / single-line diagram. Leave a row
            untouched to keep the Haberl default.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {CANVAS_COLOR_ROWS.map(({ layer, field, label }) => {
              const value = canvasColorOf(layer, field)
              const overridden = isCanvasColorOverridden(layer, field)
              return (
                <div key={`${layer}.${field}`} className="flex flex-col gap-1.5">
                  <Label>{label}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => setCanvasColor(layer, field, e.target.value)}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5"
                      title={`${label} colour`}
                    />
                    <Input
                      value={value}
                      onChange={(e) => setCanvasColor(layer, field, e.target.value)}
                      className="flex-1 font-mono text-xs"
                    />
                    {overridden && (
                      <button
                        type="button"
                        onClick={() => resetCanvasColor(layer, field)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        title="Reset to default"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="accent" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
        </Button>
        {saved && !saving && (
          <span className="flex items-center gap-1.5 text-sm text-success"><Check className="h-4 w-4" /> Saved</span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  )
}
