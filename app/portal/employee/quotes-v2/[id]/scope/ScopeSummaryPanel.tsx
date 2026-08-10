'use client'

// Totals + deposit preview for the scope builder (W97). These are live
// previews from the values stored on the scope — Generate re-prices catalog
// lines from current costs, which is the authoritative number.

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { scopeDepositSections, type QuoteScope, type ScopeTotals } from '@/lib/quotes/scope'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ScopeSummaryPanel({ scope, totals }: {
  scope: QuoteScope
  totals: ScopeTotals
}) {
  const depositSections = scopeDepositSections(scope)
  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'text-base font-semibold' : 'font-medium'}>{value}</span>
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
        {row('Materials', rand(totals.materialsR))}
        {row('Labour', rand(totals.labourR))}
        {row('Fees & compliance', rand(totals.feesR))}
        <div className="border-t border-border pt-2">
          {row('Quote total', rand(totals.sellR), true)}
        </div>
        {row('Deposit (materials)', rand(totals.materialsR))}
        {row('Balance on completion', rand(Math.max(0, Math.round((totals.sellR - totals.materialsR) * 100) / 100)))}
        {depositSections.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Deposit covers: {depositSections.join(', ')}
          </p>
        )}
        {totals.optionalR > 0 && row('Optional extras (not in total)', rand(totals.optionalR))}
        <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Preview from saved prices — Generate re-prices catalog items at current
          cost × markup. Totals exclude items marked &ldquo;Quote&rdquo;.
        </p>
      </CardContent>
    </Card>
  )
}
