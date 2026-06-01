import { notFound, redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, Clock, User } from 'lucide-react'
import { GenerateButton } from './GenerateButton'
import type { QuoteRequestStatus } from '@/types/database'

const statusVariant: Record<QuoteRequestStatus, 'default' | 'warning' | 'success'> = {
  pending:   'warning',
  generated: 'success',
  sent:      'default',
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground w-44 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const role = profile?.role ?? 'field_worker'
  const isAdmin = role === 'admin'
  const isManager = role === 'manager' || isAdmin

  const { data: req } = await supabase
    .from('quote_requests')
    .select('*, submitter:user_profiles!submitted_by(full_name)')
    .eq('id', id)
    .single()

  if (!req) notFound()

  // Field workers can only see their own submissions
  if (!isManager && req.submitted_by !== user!.id) redirect('/portal/employee/quotes')

  // Build the survey object the API expects (camelCase keys)
  const survey = {
    customerName:        req.customer_name,
    customerPhone:       req.customer_phone ?? '',
    customerEmail:       req.customer_email ?? '',
    address:             req.address ?? '',
    municipality:        req.municipality ?? '',
    gridSupply:          req.grid_supply,
    roofType:            req.roof_type ?? '',
    storeys:             req.storeys,
    monthlyKwh:          req.monthly_kwh ?? '',
    systemType:          req.system_type,
    batteryHours:        req.battery_hours,
    essentialLoad:       req.essential_load,
    evCharger:           req.ev_charger,
    equipmentPreference: req.equipment_preference ?? '',
    notes:               req.notes ?? '',
  }

  const submitterName = (req.submitter as { full_name: string } | null)?.full_name ?? 'Unknown'

  return (
    <div className="flex flex-col gap-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/portal/employee/quotes">
              <ArrowLeft className="h-4 w-4" /> Quotes
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-primary">{req.customer_name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {new Date(req.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {submitterName}
            </span>
          </div>
        </div>
        <Badge variant={statusVariant[req.status as QuoteRequestStatus]} className="mt-1 shrink-0">
          {req.status}
        </Badge>
      </div>

      {/* Survey details */}
      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-0">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Customer Details
          </h2>
          <Row label="Name"         value={req.customer_name} />
          <Row label="Phone"        value={req.customer_phone} />
          <Row label="Email"        value={req.customer_email} />
          <Row label="Address"      value={req.address} />
          <Row label="Municipality" value={req.municipality} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-0">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Site & System
          </h2>
          <Row label="Grid Supply"          value={req.grid_supply} />
          <Row label="Roof Type"            value={req.roof_type} />
          <Row label="Storeys"              value={req.storeys} />
          <Row label="Monthly Usage"        value={req.monthly_kwh ? `${req.monthly_kwh} kWh` : null} />
          <Row label="System Type"          value={req.system_type} />
          <Row label="Battery Backup"       value={`${req.battery_hours} hours`} />
          <Row label="Essential Load"       value={`${req.essential_load} kW`} />
          <Row label="EV Charger"           value={req.ev_charger} />
          <Row label="Equipment Preference" value={req.equipment_preference} />
          {req.notes && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{req.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate section — admin only */}
      {isAdmin ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-primary">
            {req.generated_quote ? 'Generated Quote' : 'Generate Quote'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {req.generated_quote
              ? 'Quote already generated. You can regenerate to refresh with latest pricing.'
              : 'Review the details above, then generate the AI quote.'}
          </p>
          <GenerateButton
            requestId={req.id}
            survey={survey}
            existingQuote={req.generated_quote}
          />
        </div>
      ) : (
        req.generated_quote && (
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
        )
      )}

      {!isAdmin && req.status === 'pending' && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Quote is being reviewed. Matthew will generate it shortly.
          </CardContent>
        </Card>
      )}

    </div>
  )
}
