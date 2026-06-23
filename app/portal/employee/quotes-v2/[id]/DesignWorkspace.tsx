'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, MapPin, PackageCheck, X, Workflow } from 'lucide-react'
import { extractQuoteJson, type AnyQuoteData } from '@/lib/solar/render-quote'
import { EquipmentSelector } from '@/app/portal/employee/quotes/[id]/EquipmentSelector'
import { BomTab } from '@/app/portal/employee/quotes/[id]/BomTab'
import { QuoteStatusBar } from '@/app/portal/employee/quotes/[id]/QuoteStatusBar'
import type { QuoteRequestStatus } from '@/types/database'

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

// The physical build order — top-down through the signal chain.
const BUILD_STEPS = ['Panels', 'DC combiner', 'Inverter', 'Batteries', 'AC combiner', 'Earthing', 'Extras']

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: Record<string, any>
  isAdmin: boolean
  photoUrls: string[]
  nextQuoteNum: string
  linkedJobId: string | null
}

export function DesignWorkspace({ req, isAdmin, nextQuoteNum, linkedJobId }: Props) {
  const [liveQuoteData, setLiveQuoteData] = useState<AnyQuoteData | null>(() =>
    req.generated_quote ? extractQuoteJson(req.generated_quote) : null,
  )
  const [activeStep, setActiveStep] = useState(0)
  const [bomOpen, setBomOpen] = useState(false)

  const siteLabel = req.site_label?.trim() || req.address?.trim() || `Site ${req.site_number ?? 1}`
  const optionLabel = req.option_label?.trim() || req.quote_number || 'Option'

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/portal/employee/quotes-v2"><ArrowLeft className="h-4 w-4" /> Quotes</Link>
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-primary">{req.customer_name}</h1>
            <Badge variant="default" className="gap-1"><MapPin className="h-3 w-3" />{siteLabel}</Badge>
            <span className="text-sm font-medium">{optionLabel}</span>
            {req.is_amendment && <Badge variant="warning">Amendment</Badge>}
          </div>
        </div>
        {isAdmin ? (
          <QuoteStatusBar
            requestId={req.id}
            initialStatus={req.status as QuoteRequestStatus}
            initialJobId={linkedJobId}
            shareToken={req.share_token}
            customerEmail={req.customer_email ?? null}
            customerPhone={req.customer_phone ?? null}
            customerName={req.customer_name}
            quoteNumber={req.quote_number ?? null}
            viewedAt={req.viewed_at ?? null}
          />
        ) : (
          <Badge variant="default" className="mt-1 shrink-0">{req.status}</Badge>
        )}
      </div>

      {/* Build-order rail */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card px-2 py-2">
        {BUILD_STEPS.map((step, i) => (
          <div key={step} className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveStep(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                i === activeStep ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {step}
            </button>
            {i < BUILD_STEPS.length - 1 && <span className="text-muted-foreground/40 px-0.5">›</span>}
          </div>
        ))}
      </div>

      {isAdmin ? (
        <>
          {/* Equipment & pricing */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Equipment &amp; pricing</h2>
              <EquipmentSelector
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
            </CardContent>
          </Card>

          {/* Diagram */}
          <Card>
            <CardContent className="pt-5 pb-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Workflow className="h-3.5 w-3.5" /> Diagram
                </h2>
                <div className="flex flex-wrap gap-3 text-xs">
                  {[
                    { c: '#f97316', l: 'DC / PV' }, { c: '#16a34a', l: 'Battery' },
                    { c: '#2563eb', l: 'AC' }, { c: '#65a30d', l: 'Earth' }, { c: '#7c3aed', l: 'Grid' },
                  ].map(({ c, l }) => (
                    <span key={l} className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ background: c }} />
                      <span className="text-muted-foreground">{l}</span>
                    </span>
                  ))}
                </div>
              </div>
              {liveQuoteData ? (
                <SLDDiagram
                  quoteData={liveQuoteData}
                  gridSupply={req.grid_supply as string | undefined}
                  height={640}
                  onSldChange={setLiveQuoteData}
                />
              ) : (
                <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                  Calculate a quote above and the diagram appears here — drag nodes to rearrange.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-5 pb-5">
            {req.quote_html ? (
              <iframe srcDoc={req.quote_html} title="Quote" className="w-full rounded-lg border border-border" style={{ height: 700 }} sandbox="allow-same-origin" />
            ) : (
              <p className="py-10 text-center text-muted-foreground text-sm">Quote is being prepared.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* BOM popup */}
      {isAdmin && (
        <>
          <button
            type="button"
            onClick={() => setBomOpen(true)}
            className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-primary text-white px-4 py-3 text-sm font-semibold shadow-lg hover:opacity-90"
          >
            <PackageCheck className="h-4 w-4" /> Bill of materials
          </button>
          {bomOpen && (
            <div className="fixed inset-0 z-40 flex flex-col justify-end">
              <div className="absolute inset-0 bg-black/40" onClick={() => setBomOpen(false)} />
              <div className="relative bg-card border-t border-border shadow-2xl max-h-[82vh] overflow-y-auto rounded-t-2xl">
                <div className="sticky top-0 flex items-center justify-between bg-card border-b border-border px-5 py-3">
                  <h2 className="text-sm font-semibold flex items-center gap-1.5"><PackageCheck className="h-4 w-4" /> Bill of materials</h2>
                  <button type="button" onClick={() => setBomOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-5 py-4">
                  <BomTab
                    quoteData={liveQuoteData}
                    quoteNumber={req.quote_number ?? null}
                    customerName={req.customer_name ?? ''}
                    siteAddress={req.address ?? ''}
                    onGoToQuoteTab={() => setBomOpen(false)}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
