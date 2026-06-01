import { notFound, redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, Clock, User } from 'lucide-react'
import { GenerateButton } from './GenerateButton'
import type { QuoteRequestStatus } from '@/types/database'

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const statusVariant: Record<QuoteRequestStatus, 'default' | 'warning' | 'success'> = {
  pending:   'warning',
  generated: 'success',
  sent:      'default',
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground w-48 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user!.id).single()

  const role     = profile?.role ?? 'field_worker'
  const isAdmin  = role === 'admin'
  const isManager = role === 'manager' || isAdmin

  const { data: req } = await supabase
    .from('quote_requests')
    .select('*, submitter:user_profiles!submitted_by(full_name)')
    .eq('id', id)
    .single()

  if (!req) notFound()
  if (!isManager && req.submitted_by !== user!.id) redirect('/portal/employee/quotes')

  const submitterName = (req.submitter as { full_name: string } | null)?.full_name ?? 'Unknown'
  const photoUrls     = (req.photo_urls ?? []) as string[]

  // Build the full request object for the prompt builder
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestObj = req as Record<string, any>

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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-primary">{req.customer_name}</h1>
            {req.is_amendment && <Badge variant="warning">Amendment</Badge>}
          </div>
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

      {/* Existing system — amendment only */}
      {req.is_amendment && (
        <Card className="border-warning">
          <CardContent className="pt-5 pb-5 flex flex-col gap-0">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Existing System</h2>
            <Row label="Current Inverter"           value={req.existing_inverter} />
            <Row label="Current Batteries"          value={req.existing_batteries} />
            <Row label="Current Panels"             value={req.existing_panels} />
            <Row label="Monthly Usage"              value={req.existing_monthly_usage ? `${req.existing_monthly_usage} kWh` : null} />
            <Row label="Monthly Generation"         value={req.existing_monthly_gen   ? `${req.existing_monthly_gen} kWh`   : null} />
            <Row label="Monthly Saving"             value={req.existing_monthly_saving ? `R${req.existing_monthly_saving}`  : null} />
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
          <Row label="Name"         value={req.customer_name} />
          <Row label="Phone"        value={req.customer_phone} />
          <Row label="Email"        value={req.customer_email} />
          <Row label="Address"      value={req.address} />
          <Row label="Municipality" value={req.municipality} />
        </CardContent>
      </Card>

      {/* Site + Usage */}
      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-0">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Site &amp; Usage</h2>
          <Row label="Grid Supply" value={req.grid_supply} />
          <Row label="Roof Type"   value={req.roof_type} />
          <Row label="Storeys"     value={req.storeys} />

          {req.usage_mode === 'advanced' ? (
            <div className="py-2 border-b border-border">
              <span className="text-muted-foreground text-sm w-48 inline-block">Monthly Breakdown</span>
              <div className="grid grid-cols-6 gap-x-4 gap-y-1 mt-2 text-sm">
                {MONTHS.map((m, i) => req[`monthly_kwh_${m}`] ? (
                  <span key={m}><span className="text-muted-foreground text-xs">{MONTH_LABELS[i]}: </span>{req[`monthly_kwh_${m}`]}</span>
                ) : null)}
              </div>
              {req.monthly_kwh && <p className="text-xs text-muted-foreground mt-1">Avg: {req.monthly_kwh} kWh/mo</p>}
            </div>
          ) : (
            <Row label="Monthly Usage" value={req.monthly_kwh ? `${req.monthly_kwh} kWh` : null} />
          )}
        </CardContent>
      </Card>

      {/* System requirements */}
      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-0">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Requirements</h2>
          <Row label="System Type"             value={req.system_type} />
          <Row label="Battery Backup"          value={req.battery_hours} />
          <Row label="Essential Load"          value={req.essential_load ? `${req.essential_load} kW` : null} />
          <Row label="Target Off-grid"         value={req.target_offgrid_pct != null ? `${req.target_offgrid_pct}%` : null} />
          <Row label="EV Charger"              value={req.ev_charger} />
          <Row label="Inverter Preference"     value={req.inverter_brand} />
          <Row label="Battery Preference"      value={req.battery_brand} />
          <Row label="Panel Preference"        value={req.panel_brand} />
          {req.notes && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{req.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photos */}
      {photoUrls.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Site Photos ({photoUrls.length})
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photoUrls.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                  className="aspect-square rounded-md overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Site photo ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate section */}
      {isAdmin ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-primary">
            {req.generated_quote ? 'Generated Quote' : 'Generate Quote'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {req.generated_quote
              ? 'Quote already generated. You can regenerate to refresh with latest pricing.'
              : 'Review the details above, then copy the prompt and generate via Claude.'}
          </p>
          <GenerateButton
            requestId={req.id}
            request={requestObj}
            existingQuote={req.generated_quote}
          />
        </div>
      ) : (
        <>
          {req.generated_quote && (
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
          )}
          {req.status === 'pending' && (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                Quote is being reviewed. Matthew will generate it shortly.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
