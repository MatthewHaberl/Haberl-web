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
  parseScope, emptyScope, scopeTotals, applyCrewShift, importScopeAsPackage,
  CREW_HOURS_PER_DAY, type QuoteScope,
} from '@/lib/quotes/scope'
import type { WorkType } from '@/lib/quotes/work-types'
import { validateScope } from '@/lib/quotes/scope-validate'
import { ScopeEditor } from './ScopeEditor'
import { LabourPanel } from './LabourPanel'
import { ScopeSummaryPanel } from './ScopeSummaryPanel'
import { ScopeIssuesPanel, scrollToIssue } from './ScopeIssuesPanel'
import { PackagesPanel } from './PackagesPanel'
import { BundlePanel } from './BundlePanel'
import { ImportQuoteDialog, useImportableQuotes, type ImportableQuote } from './ImportQuoteDialog'
import { Button } from '@/components/ui/button'
import { PackagePlus } from 'lucide-react'

/** Pricing context for the builder — markup + labour defaults from Settings. */
export interface ScopePricing {
  markup: number
  labourRateR: number
  dayRateR: number
  calloutR: number
  cocFeeR: number
  crewDays: number
  crewHoursPerDay: number
  managementR: number
  managementDefault: boolean
}

const DEFAULT_PRICING: ScopePricing = {
  markup: 1.15, labourRateR: 750, dayRateR: 5500, calloutR: 750, cocFeeR: 1500,
  crewDays: 1, crewHoursPerDay: CREW_HOURS_PER_DAY,
  managementR: 750, managementDefault: true,
}

/**
 * Quotes seeded before migration 118 carry an empty "Labour" section — labour
 * is priced in the Labour block below and scopeToBom emits its own section, so
 * the heading was only ever something to delete. Dropped on open, and only
 * while it is empty: a Labour section someone actually put lines under still
 * bills and stays.
 */
function dropEmptyLabourSection(scope: QuoteScope): QuoteScope {
  const used = scope.lines.some((l) => l.section === 'Labour')
  if (used || !scope.sections.includes('Labour')) return scope
  return { ...scope, sections: scope.sections.filter((n) => n !== 'Labour') }
}

export function ScopeWorkspace({
  requestId, rawScope, workType, registerPreflight, customerId, customerName, optionLabel,
}: {
  requestId: string
  rawScope: unknown
  workType: WorkType
  /** Whose other quotes "Add another quote" offers. */
  customerId?: string | null
  customerName?: string
  /** This quote's own option name — the label its existing scope folds into. */
  optionLabel?: string | null
  /**
   * Hands Generate (in the status bar above this component) a way to ask
   * "can this be a document yet?". Returns the blocking messages, and reveals
   * the red fields + scrolls to the first one on its way out.
   */
  registerPreflight?: (fn: () => string[]) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [scope, setScope] = useState<QuoteScope>(
    () => dropEmptyLabourSection(
      parseScope(rawScope) ?? emptyScope({ sections: workType.default_sections }),
    ),
  )
  const [pricing, setPricing] = useState<ScopePricing>(DEFAULT_PRICING)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [exclText, setExclText] = useState(() => scope.exclusions.join('\n'))
  const [importing, setImporting] = useState(false)

  const importable = useImportableQuotes(requestId, customerId ?? null, customerName ?? '')

  /**
   * Pull the chosen quotes in as packages.
   *
   * Applied in one setScope so the autosave writes once. Each import folds this
   * quote's own scope into a first package on the way (ensurePackaged), so the
   * result is N+1 packages rather than N packages beside a pile of loose lines.
   */
  function importQuotes(picked: ImportableQuote[]) {
    let next = scope
    for (const q of picked) {
      next = importScopeAsPackage(next, q.scope, {
        label: q.label,
        sourceQuoteId: q.id,
        existingLabel: optionLabel?.trim() || workType.label,
      }).scope
    }
    setScope(next)
    // The exclusions box holds its own text state, so an import that merges the
    // sources' exclusions has to restate it. Without this the box keeps showing
    // the pre-import list, and the next keystroke in it writes that shorter list
    // back over the merged one — silently dropping exclusions off the quote.
    setExclText(next.exclusions.join('\n'))
    setImporting(false)
  }

  // Markup + labour defaults from company settings. If the scope's labour block
  // is still at the built-in placeholder rates, refresh it to the real ones.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('company_settings')
      .select('markup_pct, labour_hourly_rate_rands, labour_day_rate_rands, callout_fee_rands, coc_fee_rands, crew_days_default, crew_hours_per_day, management_fee_rands, management_fee_default')
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
          crewDays: num(data.crew_days_default, 1),
          crewHoursPerDay: num(data.crew_hours_per_day, CREW_HOURS_PER_DAY),
          managementR: num(data.management_fee_rands, 750),
          managementDefault: data.management_fee_default !== false,
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
          // The shift block is "never touched" while nobody is on the crew and
          // both figures still read the built-in defaults. Once a crew line
          // exists the hours price it, so re-seeding would silently re-quote.
          const untouchedShift =
            s.labour.crew.length === 0 &&
            s.labour.crewDays === 1 &&
            s.labour.crewHoursPerDay === CREW_HOURS_PER_DAY
          if (!untouchedLabour && !untouchedCoc && !untouchedShift) return s
          let labour = untouchedLabour
            ? { ...s.labour, rateR: next.labourRateR, dayRateR: next.dayRateR, calloutR: next.calloutR }
            : s.labour
          // The management fee is switched on only where no labour has been
          // entered at all. Reopening a quote that is already priced must never
          // add money to it — the panel's tick box is the only way in there,
          // and it takes its amount from Settings at the moment it is ticked.
          if (untouchedLabour && next.managementDefault && next.managementR > 0) {
            labour = { ...labour, managementIncluded: true, managementR: next.managementR }
          }
          return {
            ...s,
            labour: untouchedShift
              ? applyCrewShift(labour, { crewDays: next.crewDays, crewHoursPerDay: next.crewHoursPerDay })
              : labour,
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
  const issues = validateScope(scope)
  const blockers = issues.filter((i) => i.level === 'blocker')

  // Red fields stay hidden until Generate has actually been refused — same
  // posture as the new-quote form. The panel below is always honest, though:
  // it is a review list, not a nag under a field you are still typing into.
  const [showIssues, setShowIssues] = useState(false)

  // Kept in a ref so the registered callback always sees the current scope
  // without re-registering (and re-rendering the status bar) on every keystroke.
  const blockersRef = useRef(blockers)
  useEffect(() => { blockersRef.current = blockers })
  useEffect(() => {
    registerPreflight?.(() => {
      const current = blockersRef.current
      if (current.length === 0) return []
      setShowIssues(true)
      // Put the first problem on screen — this editor is long enough to hide it.
      requestAnimationFrame(() => scrollToIssue(current[0].anchor))
      return current.map((b) => b.message)
    })
  }, [registerPreflight])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{workType.label}</div>
        {saveState === 'saving' && <Badge variant="outline">Saving…</Badge>}
        {saveState === 'saved' && <Badge variant="success">Saved</Badge>}
        {saveState === 'error' && <Badge variant="destructive">Save failed — retrying on next change</Badge>}
      </div>

      <ScopeIssuesPanel issues={issues} />

      {/* One column, full width. The line editor is a table — squeezing it into
          two thirds of the page to keep a 340px rail of read-only figures cost
          more than the rail was worth. Everything that used to sit in the rail
          now reads in the order the quote is built: scope, lines, labour,
          exclusions, then the totals you check before Generate. */}
      <div className="space-y-6">
        <Card data-issue-anchor="summary">
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

        {scope.packages.length > 0 ? (
          <PackagesPanel
            scope={scope}
            onChange={setScope}
            pricing={pricing}
            requestId={requestId}
            issues={issues}
            showIssues={showIssues}
            onAddQuote={() => setImporting(true)}
          />
        ) : (
          <>
            <ScopeEditor
              scope={scope}
              onChange={setScope}
              pricing={pricing}
              requestId={requestId}
              issues={issues}
              showIssues={showIssues}
            />
            {/* Offered only where there is something to combine WITH — on a
                customer's first quote this button would open an empty list. */}
            {(importable?.length ?? 0) > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setImporting(true)}>
                <PackagePlus className="h-3.5 w-3.5" /> Add another quote to this one
              </Button>
            )}
          </>
        )}

        <BundlePanel scope={scope} />

        <LabourPanel scope={scope} onChange={setScope} pricing={pricing} issues={issues} />

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

        <ScopeSummaryPanel scope={scope} totals={totals} />
      </div>

      {importing && (
        <ImportQuoteDialog
          quotes={importable}
          onImport={importQuotes}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  )
}
