'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Work packages — several jobs on one quote.
//
// Each package is a job the customer could buy on its own: its own sections,
// its own items, and its own labour block answering "what does this cost if it
// is the only reason we come out?". The quote's own labour is the COMBINED
// visit, and the gap between the two is the saving the document offers.
//
// The labour block inside a package reuses the same LabourPanel and CrewPanel
// the bundle uses, through a synthetic scope: those panels only ever read
// `scope.labour` and `scope.coc`, so handing them a package-shaped view and
// mapping the writes back is both zero-duplication and zero-risk to the live
// single-package path.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, PackagePlus, Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  labourAmountR, movePackage, packageLines, packageTotals, removePackage, updatePackage,
  type QuoteScope, type ScopePackage,
} from '@/lib/quotes/scope'
import type { ScopeIssue } from '@/lib/quotes/scope-validate'
import { ScopeEditor } from './ScopeEditor'
import { LabourPanel } from './LabourPanel'
import type { ScopePricing } from './ScopeWorkspace'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PackagesPanel({
  scope, onChange, pricing, requestId, issues, showIssues, onAddQuote,
}: {
  scope: QuoteScope
  onChange: Dispatch<SetStateAction<QuoteScope>>
  pricing: ScopePricing
  requestId: string
  issues: ScopeIssue[]
  showIssues: boolean
  onAddQuote: () => void
}) {
  return (
    <div className="space-y-4" data-issue-anchor="sections">
      {scope.packages.map((pkg, i) => (
        <PackageCard
          key={pkg.id}
          scope={scope}
          onChange={onChange}
          pkg={pkg}
          index={i}
          isFirst={i === 0}
          isLast={i === scope.packages.length - 1}
          pricing={pricing}
          requestId={requestId}
          issues={issues}
          showIssues={showIssues}
        />
      ))}

      {/* Lines belonging to no package still bill on the combined price, so they
          have to be visible and editable — silently hiding them is how a quote
          ends up with money on it nobody can see. */}
      {packageLines(scope, null).length > 0 && (
        <Card className="border-warning/50">
          <CardContent className="space-y-3 pt-6">
            <div>
              <div className="text-sm font-semibold">Not in any package</div>
              <p className="text-xs text-muted-foreground">
                These are billed on the combined price but appear under none of the individual
                package prices. Move them into a package, or delete them.
              </p>
            </div>
            <ScopeEditor
              scope={scope}
              onChange={onChange}
              pricing={pricing}
              requestId={requestId}
              issues={issues}
              showIssues={showIssues}
            />
          </CardContent>
        </Card>
      )}

      <Button type="button" variant="outline" size="sm" onClick={onAddQuote}>
        <PackagePlus className="h-3.5 w-3.5" /> Add another quote as a package
      </Button>
    </div>
  )
}

function PackageCard({
  scope, onChange, pkg, index, isFirst, isLast, pricing, requestId, issues, showIssues,
}: {
  scope: QuoteScope
  onChange: Dispatch<SetStateAction<QuoteScope>>
  pkg: ScopePackage
  index: number
  isFirst: boolean
  isLast: boolean
  pricing: ScopePricing
  requestId: string
  issues: ScopeIssue[]
  showIssues: boolean
}) {
  const confirm = useConfirm()
  const [open, setOpen] = useState(true)
  const [labourOpen, setLabourOpen] = useState(false)

  const totals = packageTotals(scope, pkg)
  const lineCount = packageLines(scope, pkg.id).length
  const packageIssues = issues.filter((i) => i.anchor === `package:${pkg.id}`)

  const patch = (p: Partial<ScopePackage>) => onChange((s) => updatePackage(s, pkg.id, p))

  /**
   * A package dressed as a scope, so LabourPanel/CrewPanel can edit its
   * standalone labour with no changes of their own. Only `labour` and `coc` are
   * read by those panels; `packages: []` keeps them off the package path.
   */
  const labourView: QuoteScope = { ...scope, labour: pkg.labour, coc: pkg.coc, packages: [] }
  const onLabourChange: Dispatch<SetStateAction<QuoteScope>> = (action) =>
    onChange((s) => {
      const current = s.packages.find((p) => p.id === pkg.id)
      if (!current) return s
      const view: QuoteScope = { ...s, labour: current.labour, coc: current.coc, packages: [] }
      const next = typeof action === 'function'
        ? (action as (prev: QuoteScope) => QuoteScope)(view)
        : action
      return updatePackage(s, pkg.id, { labour: next.labour, coc: next.coc })
    })

  async function remove() {
    const name = pkg.label.trim() || `Package ${index + 1}`
    if (!(await confirm({
      title: `Remove "${name}"?`,
      body: lineCount > 0
        ? `Its ${lineCount} line${lineCount === 1 ? '' : 's'} come off this quote. The original quote it came from is not affected.`
        : 'The original quote it came from is not affected.',
      confirmText: 'Remove package',
      destructive: true,
    }))) return
    onChange((s) => removePackage(s, pkg.id))
  }

  return (
    <Card data-issue-anchor={`package:${pkg.id}`}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={open ? 'Collapse package' : 'Expand package'}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <Input
            value={pkg.label}
            onChange={(e) => patch({ label: e.target.value })}
            placeholder={`Package ${index + 1} name — e.g. "Add a second battery"`}
            className="h-9 min-w-[220px] flex-1 font-medium"
          />

          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-sm font-semibold">{rand(totals.sellR)}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">on its own</div>
            </div>
            {totals.needsPricing > 0 && <Badge variant="warning">{totals.needsPricing} to price</Badge>}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => onChange((s) => movePackage(s, pkg.id, -1))}
              disabled={isFirst} title="Move up">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => onChange((s) => movePackage(s, pkg.id, 1))}
              disabled={isLast} title="Move down">
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
              onClick={remove} title="Remove this package">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="pl-10 text-xs text-muted-foreground">
          {lineCount} line{lineCount === 1 ? '' : 's'} · {rand(totals.materialsR)} materials ·{' '}
          {rand(labourAmountR(pkg.labour))} labour on its own
          {pkg.coc.included && pkg.coc.feeR > 0 && <> · CoC {rand(pkg.coc.feeR)}</>}
        </div>

        {packageIssues.map((i) => (
          <p key={i.id} className="pl-10 text-[11px] font-medium text-warning">{i.message}</p>
        ))}

        {open && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="space-y-1.5">
              <div className="text-xs font-medium">What this package covers</div>
              <Textarea
                value={pkg.summary}
                onChange={(e) => patch({ summary: e.target.value })}
                placeholder="Plain language, no prices — what the customer reads under this package's heading."
                rows={2}
              />
            </div>

            <ScopeEditor
              scope={scope}
              onChange={onChange}
              pricing={pricing}
              requestId={requestId}
              issues={issues}
              showIssues={showIssues}
              packageId={pkg.id}
            />

            <div className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setLabourOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="flex items-center gap-2">
                  {labourOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="text-xs font-semibold">If this package is done on its own</span>
                </span>
                <span className="text-xs font-medium">{rand(labourAmountR(pkg.labour))}</span>
              </button>
              {labourOpen && (
                <div className="border-t border-border px-3 pb-3 pt-1">
                  <p className="pb-2 pt-2 text-[11px] text-muted-foreground">
                    Its own visit: call-out, crew days and CoC as if nothing else were being done that
                    day. This prices the &ldquo;just this one&rdquo; column only — it is never added to
                    the combined price below.
                  </p>
                  {/* The panels below edit the package through a synthetic scope. */}
                  <LabourPanel
                    scope={labourView}
                    onChange={onLabourChange}
                    pricing={pricing}
                    issues={[]}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
