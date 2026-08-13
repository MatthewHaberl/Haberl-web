'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ScopeWorkspace — the scope engine's answer to the design canvas (W97).
//
// Edits a QuoteScope and autosaves it to quote_requests.scope with the same
// contract as the canvas autosave (800 ms debounce, first-render skip, save
// badge). Generate/Send live in the shared QuoteStatusBar above this component.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  parseScope, emptyScope, scopeTotals, type QuoteScope,
} from '@/lib/quotes/scope'
import type { WorkType } from '@/lib/quotes/work-types'
import { ScopeEditor } from './ScopeEditor'
import { LabourPanel } from './LabourPanel'
import { ScopeSummaryPanel } from './ScopeSummaryPanel'

/** Pricing context for the builder — markup + labour defaults from Settings. */
export interface ScopePricing {
  markup: number
  labourRateR: number
  dayRateR: number
  calloutR: number
  cocFeeR: number
}

const DEFAULT_PRICING: ScopePricing = { markup: 1.15, labourRateR: 750, dayRateR: 5500, calloutR: 750, cocFeeR: 1500 }

export function ScopeWorkspace({ requestId, rawScope, workType }: {
  requestId: string
  rawScope: unknown
  workType: WorkType
}) {
  const supabase = useMemo(() => createClient(), [])
  const [scope, setScope] = useState<QuoteScope>(
    () => parseScope(rawScope) ?? emptyScope({ sections: workType.default_sections }),
  )
  const [pricing, setPricing] = useState<ScopePricing>(DEFAULT_PRICING)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [exclText, setExclText] = useState(() => scope.exclusions.join('\n'))

  // Markup + labour defaults from company settings. If the scope's labour block
  // is still at the built-in placeholder rates, refresh it to the real ones.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('company_settings')
      .select('markup_pct, labour_hourly_rate_rands, labour_day_rate_rands, callout_fee_rands, coc_fee_rands')
      .eq('id', true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        const num = (v: unknown, fb: number) =>
          typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fb
        const next: ScopePricing = {
          markup: 1 + num(data.markup_pct, 15) / 100,
          labourRateR: num(data.labour_hourly_rate_rands, 750),
          dayRateR: num(data.labour_day_rate_rands, 5500),
          calloutR: num(data.callout_fee_rands, 750),
          cocFeeR: num(data.coc_fee_rands, 1500),
        }
        setPricing(next)
        setScope((s) => {
          const untouchedLabour =
            s.labour.hours === 0 && s.labour.days === 0 && s.labour.fixedR === 0 &&
            !s.labour.description &&
            // Either placeholder generation counts as "never edited".
            ((s.labour.rateR === 650 && s.labour.calloutR === 450) ||
             (s.labour.rateR === 750 && s.labour.calloutR === 750))
          const untouchedCoc = !s.coc.included && s.coc.feeR === 1500
          if (!untouchedLabour && !untouchedCoc) return s
          return {
            ...s,
            labour: untouchedLabour
              ? { ...s.labour, rateR: next.labourRateR, dayRateR: next.dayRateR, calloutR: next.calloutR }
              : s.labour,
            coc: untouchedCoc ? { ...s.coc, feeR: next.cocFeeR } : s.coc,
          }
        })
      })
    return () => { cancelled = true }
  }, [supabase])

  // Autosave — same contract as the canvas DesignProvider.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setSaveState('saving')
    const timer = setTimeout(async () => {
      const { error } = await supabase
        .from('quote_requests')
        .update({ scope })
        .eq('id', requestId)
      setSaveState(error ? 'error' : 'saved')
    }, 800)
    return () => clearTimeout(timer)
  }, [scope, requestId, supabase])

  const totals = scopeTotals(scope)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{workType.label}</div>
        {saveState === 'saving' && <Badge variant="outline">Saving…</Badge>}
        {saveState === 'saved' && <Badge variant="success">Saved</Badge>}
        {saveState === 'error' && <Badge variant="destructive">Save failed — retrying on next change</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="text-sm font-semibold">Scope of works</div>
              <p className="text-xs text-muted-foreground">
                What the customer reads at the top of the quote — plain language, no prices.
              </p>
              <Textarea
                value={scope.summary}
                onChange={(e) => setScope((s) => ({ ...s, summary: e.target.value }))}
                placeholder="e.g. Replace the existing DB board with a 24-way board, rewire the kitchen circuits and issue a Certificate of Compliance."
                rows={4}
              />
            </CardContent>
          </Card>

          <ScopeEditor scope={scope} onChange={setScope} pricing={pricing} />
        </div>

        <div className="space-y-6">
          <ScopeSummaryPanel scope={scope} totals={totals} />
          <LabourPanel scope={scope} onChange={setScope} pricing={pricing} />
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="text-sm font-semibold">What&rsquo;s not included</div>
              <p className="text-xs text-muted-foreground">
                One exclusion per line — the cheapest dispute prevention available.
              </p>
              <Textarea
                value={exclText}
                onChange={(e) => {
                  setExclText(e.target.value)
                  const parsed = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean)
                  setScope((s) => ({ ...s, exclusions: parsed }))
                }}
                placeholder={'Wall chasing and plastering\nMunicipal connection fees\nWork outside the quoted scope'}
                rows={4}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
