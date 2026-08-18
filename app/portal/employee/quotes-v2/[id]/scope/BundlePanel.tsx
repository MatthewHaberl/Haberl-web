'use client'

// ─────────────────────────────────────────────────────────────────────────────
// The combined price, against the packages it is made of.
//
// The one screen that answers the question the whole feature exists for: if the
// customer takes everything, what do they save, and where does that saving come
// from? Materials cost the same either way, so it can only come from labour
// (fewer days on site than three separate call-outs) or compliance (one
// certificate for the job instead of one per package). Both are itemised, and
// a saving that hasn't been earned yet is reported as zero rather than implied.
// ─────────────────────────────────────────────────────────────────────────────

import type { Dispatch, SetStateAction } from 'react'
import { ArrowRight, Layers } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  bundleSavingR, labourAmountR, packageTotals, scopeTotals, separateCocR, separateLabourR,
  separateTotalR, type QuoteScope,
} from '@/lib/quotes/scope'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BundlePanel({ scope }: {
  scope: QuoteScope
  onChange?: Dispatch<SetStateAction<QuoteScope>>
}) {
  if (scope.packages.length === 0) return null

  const bundle = scopeTotals(scope)
  const separate = separateTotalR(scope)
  const saving = bundleSavingR(scope)
  const savingPct = separate > 0 ? (saving / separate) * 100 : 0
  const bundleLabour = labourAmountR(scope.labour)
  const separateLabour = separateLabourR(scope)
  const labourSaving = Math.max(0, separateLabour - bundleLabour)
  // One certificate for the job instead of one per package.
  const bundleCoc = scope.coc.included && scope.coc.feeR > 0 ? scope.coc.feeR : 0
  const cocSaving = Math.max(0, separateCocR(scope) - bundleCoc)

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Combined price</span>
          {saving > 0 && (
            <Badge variant="success">
              saves {rand(saving)} ({savingPct.toFixed(0)}%)
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          {scope.packages.map((pkg, i) => {
            const t = packageTotals(scope, pkg)
            return (
              <div key={pkg.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-muted-foreground">
                  {pkg.label.trim() || `Package ${i + 1}`}
                  <span className="ml-1.5 text-[11px]">on its own</span>
                </span>
                <span className="shrink-0 tabular-nums">{rand(t.sellR)}</span>
              </div>
            )
          })}
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5 text-sm">
            <span className="font-medium">Bought separately</span>
            <span className="shrink-0 font-medium tabular-nums">{rand(separate)}</span>
          </div>
        </div>

        <div className="rounded-lg bg-primary/5 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">All of it together</span>
            <span className="text-lg font-semibold tabular-nums">{rand(bundle.sellR)}</span>
          </div>
          {saving > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {rand(saving)} less than buying the packages one at a time.
            </p>
          ) : (
            <p className="mt-1 text-xs text-warning">
              No saving yet — the combined price is not below the separate one. Reduce the combined
              labour below to the visit you would actually do.
            </p>
          )}
        </div>

        {/* Where the saving comes from, itemised honestly. Materials cost the
            same either way, so the difference can only be labour (fewer days on
            site) or compliance (one certificate instead of one per package) —
            and saying "labour" while the labour figure has not moved is exactly
            the sort of thing a customer notices. */}
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs font-semibold">Where the saving comes from</div>

          <div className="mt-2 flex items-center gap-3 text-sm">
            {labourSaving > 0 && (
              <span className="tabular-nums text-muted-foreground line-through">{rand(separateLabour)}</span>
            )}
            {labourSaving > 0 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="font-medium tabular-nums">{rand(bundleLabour)}</span>
            <span className="text-xs text-muted-foreground">
              labour, in one visit
              {labourSaving > 0 && <> &mdash; {rand(labourSaving)} saved</>}
            </span>
          </div>

          {cocSaving > 0 && (
            <div className="mt-1.5 flex items-center gap-3 text-sm">
              <span className="font-medium tabular-nums">{rand(cocSaving)}</span>
              <span className="text-xs text-muted-foreground">
                one Certificate of Compliance for the whole job, not one per package
              </span>
            </div>
          )}

          <p className="mt-2 text-[11px] text-muted-foreground">
            {labourSaving > 0
              ? `${rand(labourSaving)} of crew time saved by not mobilising ${scope.packages.length} separate times. Materials cost the same either way.`
              : cocSaving > 0
                ? 'The whole saving is the single certificate — the combined labour is still the sum of the packages’. Cut it in the Labour block below (fewer crew days, one call-out, one management fee) and the rest of the saving appears here.'
                : 'Nothing saved yet. The saving lives in the Labour block below: the same work in one visit needs fewer crew days than three separate call-outs.'}
          </p>
        </div>

        {bundle.needsPricing > 0 && (
          <p className="text-[11px] text-warning">
            {bundle.needsPricing} line{bundle.needsPricing === 1 ? '' : 's'} still to price — every
            figure here is short until they are done.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
