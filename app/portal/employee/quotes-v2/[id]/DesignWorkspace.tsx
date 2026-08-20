'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CanvasThemeProvider, type CanvasColorOverrides } from '@/lib/solar/canvas-theme'
import { extractQuoteJson, isMultiOption, type QuoteData } from '@/lib/solar/render-quote'
import {
  parseDesign, quoteDataToDesign, emptyDesign, type SystemDesign,
} from '@/lib/solar/system-design'
import { QuoteStatusBar } from './QuoteStatusBar'
import type { QuoteRequestStatus } from '@/types/database'
import { DesignProvider } from './design/DesignProvider'
import { BalanceHeader } from './design/BalanceHeader'
import { BuildRail } from './design/BuildRail'
import { Walkthrough } from './design/Walkthrough'
import { ActiveSection } from './design/sections/ActiveSection'
import { DesignBomPanel } from './design/DesignBomPanel'
import { DesignCanvasPanel } from './design/DesignCanvasPanel'
import { DesignStudio } from './design/DesignStudio'
import { DraftTotalSync } from './design/DraftTotalSync'
import { ScopeWorkspace } from './scope/ScopeWorkspace'
import { CreditsPanel } from './CreditsPanel'
import { ContingencyPanel } from './ContingencyPanel'
import { SendSettingsPanel } from './SendSettingsPanel'
import { parseScope } from '@/lib/quotes/scope'
import { RfqPanel } from './RfqPanel'
import { SupplierQuotesPanel } from './SupplierQuotesPanel'
import type { WorkType } from '@/lib/quotes/work-types'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: Record<string, any>
  isAdmin: boolean
  photoUrls: string[]
  nextQuoteNum: string
  linkedJobId: string | null
  engine: 'solar' | 'scope'
  workType: WorkType
  /** Resolved name behind quote_requests.sent_by — '' when nobody is recorded. */
  sentByName?: string
}

export function DesignWorkspace({ req, isAdmin, linkedJobId, engine, workType, sentByName = '' }: Props) {
  // Generate lives up here in the status bar while the scope it validates lives
  // below in ScopeWorkspace. The builder registers its check on this ref rather
  // than lifting the whole scope, which would re-render the bar on every
  // keystroke. Solar quotes leave it null and generate as before.
  const scopePreflight = useRef<(() => string[]) | null>(null)
  const registerPreflight = useCallback((fn: () => string[]) => {
    scopePreflight.current = fn
  }, [])

  const siteLabel = req.site_label?.trim() || req.address?.trim() || `Site ${req.site_number ?? 1}`
  const optionLabel = req.option_label?.trim() || req.quote_number || 'Option'

  // Opt-in "studio" cockpit layout — the classic vertical stack stays the default
  // until the user flips it. Seeded from localStorage in an effect (not a lazy
  // initializer) so server + first client render agree on 'classic' (no hydration
  // mismatch); the other three are pure layout state, never persisted.
  const [layout, setLayout] = useState<'classic' | 'studio'>('classic')
  useEffect(() => {
    // Deferred read of a client-only preference: server + first client render must
    // both be 'classic' to avoid a hydration mismatch, so the stored choice is
    // applied after mount (the intentional two-pass render).
    const v = localStorage.getItem('qv2-layout')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v === 'studio' || v === 'classic') setLayout(v)
  }, [])
  function flipLayout() {
    setLayout((prev) => {
      const next = prev === 'studio' ? 'classic' : 'studio'
      try { localStorage.setItem('qv2-layout', next) } catch { /* private mode: ignore */ }
      return next
    })
  }
  const [consoleOpen, setConsoleOpen] = useState(true)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'canvas' | 'bom'>('canvas')

  // Company-wide canvas colour overrides for the diagram. Same client fetch pattern
  // as DesignBomPanel's markup read; null/missing degrades to the brand defaults.
  const [canvasColors, setCanvasColors] = useState<CanvasColorOverrides | null>(null)
  useEffect(() => {
    let active = true
    createClient()
      .from('company_settings').select('canvas_colors').eq('id', true).maybeSingle()
      .then(({ data }) => {
        if (active && data?.canvas_colors) setCanvasColors(data.canvas_colors as CanvasColorOverrides)
      })
    return () => { active = false }
  }, [])

  // Resolve the canvas's starting design: saved system_design → else hydrate from
  // a legacy generated_quote → else a blank design.
  const initialDesign: SystemDesign = useMemo(() => {
    const stored = parseDesign(req.system_design)
    if (stored) return stored
    if (req.generated_quote) {
      const parsed = extractQuoteJson(req.generated_quote)
      if (parsed) {
        const single = isMultiOption(parsed)
          ? (parsed.options.find((o) => o.tier === 'recommended') ?? parsed.options[0])
          : (parsed as QuoteData)
        return quoteDataToDesign(single)
      }
    }
    return emptyDesign()
  }, [req.system_design, req.generated_quote])

  // A quote the customer can accept ONE package off is the one case a
  // quote-level credit can't follow the money — the accept route bills that
  // package's standalone price. The credits panel warns rather than guesses.
  const creditablePackages = useMemo(() => {
    if (engine !== 'scope' || req.allow_partial_acceptance === false) return false
    return (parseScope(req.scope)?.packages.length ?? 0) >= 2
  }, [engine, req.scope, req.allow_partial_acceptance])

  return (
    <div className={`flex flex-col gap-4 ${isAdmin && engine !== 'scope' && layout === 'studio' ? 'pb-4' : 'pb-20'}`}>
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
            {workType.code !== 'solar' && <Badge variant="outline">{workType.label}</Badge>}
            {req.is_amendment && <Badge variant="warning">Amendment</Badge>}
          </div>
        </div>
        {isAdmin ? (
          <div className="flex flex-col items-end gap-2">
            {/* Classic/studio is a canvas-only choice — the scope builder has one layout. */}
            {engine !== 'scope' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={flipLayout}
                title={layout === 'studio' ? 'Switch back to the classic layout' : 'Try the new canvas-forward studio layout'}
              >
                {layout === 'studio' ? 'Classic layout' : 'Try new layout'}
              </Button>
            )}
            <div id="quote-status-bar">
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
                isSolar={engine !== 'scope'}
                preflight={engine === 'scope' ? () => scopePreflight.current?.() ?? [] : undefined}
              />
            </div>
          </div>
        ) : (
          <Badge variant="default" className="mt-1 shrink-0">{req.status}</Badge>
        )}
      </div>

      {isAdmin ? (
        <>
        {/* Engine branch (W97): 'scope' work types get the line-item scope builder;
            everything else keeps the solar design canvas. Header + status bar above
            and the non-admin iframe below are shared by both engines. */}
        {engine === 'scope' ? (
          <ScopeWorkspace
            requestId={req.id}
            rawScope={req.scope}
            workType={workType}
            registerPreflight={registerPreflight}
            customerId={req.customer_id ?? null}
            customerName={req.customer_name ?? ''}
            optionLabel={req.option_label ?? null}
          />
        ) : (
          <CanvasThemeProvider value={canvasColors}>
            <DesignProvider
              requestId={req.id}
              initialDesign={initialDesign}
              gridSupply={req.grid_supply as string | undefined}
              record={{ monthly_kwh: req.monthly_kwh ?? null, municipality: req.municipality ?? null }}
              canSave
            >
              {/* Keeps the quotes list showing a figure for a design that has
                  never been generated (migration 122). Headless, both layouts. */}
              <DraftTotalSync />
              {layout === 'studio' ? (
                <DesignStudio
                  consoleOpen={consoleOpen}
                  setConsoleOpen={setConsoleOpen}
                  overviewOpen={overviewOpen}
                  setOverviewOpen={setOverviewOpen}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                />
              ) : (
                <>
                  <BalanceHeader />
                  <Walkthrough />
                  <BuildRail />
                  <ActiveSection />
                  <DesignCanvasPanel />
                  <DesignBomPanel />
                </>
              )}
            </DesignProvider>
          </CanvasThemeProvider>
        )}
        {/* How this quote reads and how it went out (migration 127). Shared by
            both engines, and visible at EVERY status — the document switches
            used to live in the status bar and vanish the moment it was sent. */}
        <SendSettingsPanel
          requestId={req.id}
          status={req.status}
          isSolar={engine !== 'scope'}
          showPhotos={req.show_equipment_photos !== false}
          detailed={req.quote_version === 'detailed'}
          allowPartial={req.allow_partial_acceptance !== false}
          expiryDate={req.expiry_date ?? null}
          sentAt={req.sent_at ?? null}
          sentMethod={req.sent_method ?? null}
          sentByName={sentByName}
          viewedAt={req.viewed_at ?? null}
          reminderCount={req.reminder_count ?? 0}
          customerEmail={req.customer_email ?? null}
          customerPhone={req.customer_phone ?? null}
          currentVersion={req.current_version ?? null}
        />
        {/* Credits (migration 126), shared by both engines: money already owed to
            the customer — a deposit paid, a warranty part, a reimbursement —
            taken off the bottom of the quote rather than off a line item. */}
        <CreditsPanel
          requestId={req.id}
          rawCredits={req.credits}
          status={req.status}
          generatedQuote={req.generated_quote}
          hasPackages={creditablePackages}
        />
        {/* Contingency (migration 129), shared by both engines: the allowance this
            quote carries for what nobody can see yet. Sits beside credits on
            purpose — one adds money to the price of the work, the other takes it
            off the bottom, and they are the only two things on a quote that
            aren't a line item. */}
        <ContingencyPanel
          requestId={req.id}
          raw={req.contingency}
          status={req.status}
          generatedQuote={req.generated_quote}
        />
        {/* Supplier pricing loop, shared by both engines: ask (W99), then receive (W98). */}
        <RfqPanel requestId={req.id} />
        <SupplierQuotesPanel requestId={req.id} />
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          {req.quote_html ? (
            <iframe srcDoc={req.quote_html} title="Quote" className="w-full rounded-lg border border-border" style={{ height: 700 }} sandbox="allow-same-origin" />
          ) : (
            <p className="py-10 text-center text-muted-foreground text-sm">Quote is being prepared.</p>
          )}
        </div>
      )}
    </div>
  )
}
