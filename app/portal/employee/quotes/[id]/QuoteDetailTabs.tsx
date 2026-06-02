'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { extractQuoteJson, type AnyQuoteData } from '@/lib/solar/render-quote'
import { GenerateButton } from './GenerateButton'
import type { QuoteRequestStatus } from '@/types/database'
import { FileText, Workflow, Image, ClipboardList } from 'lucide-react'

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

type TabId = 'survey' | 'quote' | 'diagram' | 'photos'

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: Record<string, any>
  isAdmin: boolean
  photoUrls: string[]
  nextQuoteNum: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuoteDetailTabs({ req, isAdmin, photoUrls, nextQuoteNum }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('survey')

  // Live quoteData — set by GenerateButton when JSON is pasted/parsed
  const [liveQuoteData, setLiveQuoteData] = useState<AnyQuoteData | null>(() => {
    // Pre-populate from saved JSON if it exists
    if (req.generated_quote) {
      return extractQuoteJson(req.generated_quote)
    }
    return null
  })

  const tabs: { id: TabId; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'survey',  label: 'Survey',  icon: ClipboardList },
    { id: 'quote',   label: 'Quote',   icon: FileText },
    { id: 'diagram', label: 'Diagram', icon: Workflow },
    ...(photoUrls.length > 0
      ? [{ id: 'photos' as TabId, label: `Photos (${photoUrls.length})`, icon: Image }]
      : []),
  ]

  // For diagram tab — use live data first, fall back to pre-populated from DB
  const diagramData = liveQuoteData

  return (
    <div className="flex flex-col gap-0">

      {/* Tab bar */}
      <div className="flex border-b border-border overflow-x-auto shrink-0">
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
            </CardContent>
          </Card>

          {/* System Requirements */}
          <Card>
            <CardContent className="pt-5 pb-5 flex flex-col gap-0">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Requirements</h2>
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
            </CardContent>
          </Card>
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
