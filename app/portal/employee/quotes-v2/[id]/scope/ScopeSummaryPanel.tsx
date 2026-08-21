'use client'

// Totals + deposit preview for the scope builder (W97). These are live
// previews from the values stored on the scope — Generate re-prices catalog
// lines from current costs, which is the authoritative number.
//
// Reads as a strip of figures rather than a stacked list: it sits at the foot
// of a full-width builder now, and a label/value pair stretched across 1400px
// is unreadable.

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { scopeDepositSections, type QuoteScope, type ScopeTotals } from '@/lib/quotes/scope'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const round2 = (n: number) => Math.round(n * 100) / 100

export function ScopeSummaryPanel({ scope, totals }: {
  scope: QuoteScope
  totals: ScopeTotals
}) {
  const depositSections = scopeDepositSections(scope)
  const fig = (label: string, value: string, strong = false) => (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={strong ? 'text-lg font-semibold tabular-nums' : 'text-sm font-medium tabular-nums'}>
        {value}
      </div>
    </div>
  )

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Quote preview</div>
          {totals.needsPricing > 0 && (
            <Badge variant="warning">{totals.needsPricing} to price</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {fig('Materials', rand(totals.materialsR))}
          {fig('Labour', rand(totals.labourR))}
          {fig('Fees & compliance', rand(totals.feesR))}
          {fig('Quote total', rand(totals.sellR), true)}
          {fig('Deposit (materials)', rand(totals.materialsR))}
          {fig(
            'Balance on completion',
            rand(Math.max(0, Math.round((totals.sellR - totals.materialsR) * 100) / 100)),
          )}
        </div>
        {/* Internal — what the job costs. Never rendered on the customer's quote.
            Landed is what leaves the account (supplier VAT included, because it
            is never claimed back) and is what margin is measured against; the
            ex-VAT figure is the one to hold against a supplier's quote. */}
        {totals.costR > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
            <span>
              Cost <span className="font-medium tabular-nums text-foreground">{rand(totals.costR)}</span> landed
            </span>
            <span title="Materials at the supplier's ex-VAT price; wages and certificates carry no VAT either way">
              Cost ex VAT <span className="font-medium tabular-nums text-foreground">{rand(totals.costExVatR)}</span>
            </span>
            <span>
              Margin{' '}
              <span className={`font-semibold tabular-nums ${
                totals.sellR - totals.costR < 0 ? 'text-destructive' : 'text-success'
              }`}>
                {rand(round2(totals.sellR - totals.costR))}
                {totals.sellR > 0 && ` (${(((totals.sellR - totals.costR) / totals.sellR) * 100).toFixed(1)}%)`}
              </span>
            </span>
          </div>
        )}
        {depositSections.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Deposit covers: {depositSections.join(', ')}
          </p>
        )}
        {totals.optionalR > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Optional extras (not in total): {rand(totals.optionalR)}
          </p>
        )}
        <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Preview from saved prices — Generate re-prices catalog items at current
          cost × markup. Totals exclude items marked &ldquo;Quote&rdquo;.
        </p>
      </CardContent>
    </Card>
  )
}
