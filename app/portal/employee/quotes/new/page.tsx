'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { FileText, Loader2, CheckCircle2 } from 'lucide-react'

type FormData = Record<string, string>

const INITIAL: FormData = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  address: '',
  municipality: 'City of Johannesburg',
  gridSupply: 'Single Phase',
  roofType: 'IBR/Corrugated',
  storeys: '1',
  monthlyKwh: '',
  systemType: 'Hybrid',
  batteryHours: '4',
  essentialLoad: '3',
  evCharger: 'No',
  equipmentPreference: 'Any — recommend best value',
  notes: '',
}

function SelectField({
  label, name, options, value, onChange, required,
}: {
  label: string; name: string; options: string[]
  value: string; onChange: (v: string) => void; required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

export default function NewQuotePage() {
  const router = useRouter()
  const [form, setForm] = useState<FormData>(INITIAL)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function set(key: string) {
    return (value: string) => setForm((f) => ({ ...f, [key]: value }))
  }

  function field(label: string, key: string, placeholder?: string, required?: boolean) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </span>
        <Input
          value={form[key]}
          onChange={(e) => set(key)(e.target.value)}
          placeholder={placeholder}
        />
      </label>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not signed in.'); return }

      const { error: dbError } = await supabase.from('quote_requests').insert({
        submitted_by:         user.id,
        customer_name:        form.customerName,
        customer_phone:       form.customerPhone || null,
        customer_email:       form.customerEmail || null,
        address:              form.address || null,
        municipality:         form.municipality,
        grid_supply:          form.gridSupply,
        roof_type:            form.roofType,
        storeys:              form.storeys,
        monthly_kwh:          form.monthlyKwh || null,
        system_type:          form.systemType,
        battery_hours:        form.batteryHours,
        essential_load:       form.essentialLoad,
        ev_charger:           form.evCharger,
        equipment_preference: form.equipmentPreference,
        notes:                form.notes || null,
      })

      if (dbError) { setError(dbError.message); return }

      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-6 max-w-lg">
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <div>
              <h2 className="text-xl font-bold text-primary">Quote request submitted</h2>
              <p className="text-muted-foreground mt-1">
                Matthew will review the details and generate the quote. You&apos;ll be able to view it under <strong>Quotes</strong>.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={() => router.push('/portal/employee/quotes')}>
                View all quotes
              </Button>
              <Button variant="accent" onClick={() => { setForm(INITIAL); setSubmitted(false) }}>
                New quote
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">New Quote Request</h1>
        <p className="text-muted-foreground mt-1">
          Fill in the site survey. Once submitted, Matthew will review and generate the quote.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Customer Details
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {field('Customer Name', 'customerName', 'John Smith', true)}
              {field('Phone', 'customerPhone', '082 000 0000')}
              {field('Email', 'customerEmail', 'john@example.com')}
              {field('Address', 'address', '12 Maple Street, Midrand')}
              <SelectField
                label="Municipality" name="municipality"
                options={['City of Johannesburg', 'Ekurhuleni', 'Tshwane', 'Rand West', 'Other']}
                value={form.municipality} onChange={set('municipality')}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Site Information
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <SelectField
                label="Grid Supply" name="gridSupply" required
                options={['Single Phase', 'Three Phase']}
                value={form.gridSupply} onChange={set('gridSupply')}
              />
              <SelectField
                label="Roof Type" name="roofType"
                options={['IBR/Corrugated', 'Kliplok', 'Tile', 'Flat/Concrete', 'Other']}
                value={form.roofType} onChange={set('roofType')}
              />
              <SelectField
                label="Storeys" name="storeys"
                options={['1', '2', '3+']}
                value={form.storeys} onChange={set('storeys')}
              />
              {field('Monthly kWh Usage', 'monthlyKwh', 'e.g. 850', true)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              System Requirements
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <SelectField
                label="System Type" name="systemType" required
                options={['Hybrid', 'Off-grid', 'Grid-tie']}
                value={form.systemType} onChange={set('systemType')}
              />
              <SelectField
                label="Battery Backup Required" name="batteryHours"
                options={['2', '4', '6', '8', '12']}
                value={form.batteryHours} onChange={set('batteryHours')}
              />
              {field('Essential Load During Backup (kW)', 'essentialLoad', 'e.g. 3')}
              <SelectField
                label="EV Charger Required" name="evCharger"
                options={['No', 'Yes — 7kW', 'Yes — 11kW', 'Yes — 22kW']}
                value={form.evCharger} onChange={set('evCharger')}
              />
            </div>
            <SelectField
              label="Equipment Preference" name="equipmentPreference"
              options={['Any — recommend best value', 'Sigenergy (preferred)', 'Deye (budget)', 'Sunsynk', 'Sungrow']}
              value={form.equipmentPreference} onChange={set('equipmentPreference')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Additional Notes
            </h2>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes')(e.target.value)}
              placeholder="Conduit route length, shade issues, existing DB layout, special requirements…"
              rows={4}
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
            />
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-2">{error}</p>
        )}

        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={loading || !form.customerName || !form.monthlyKwh}
          className="self-start"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
          ) : (
            <><FileText className="h-4 w-4" />Submit for Review</>
          )}
        </Button>

      </form>
    </div>
  )
}
