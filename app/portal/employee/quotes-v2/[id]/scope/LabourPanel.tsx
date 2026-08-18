'use client'

// Labour + CoC panel for the scope builder (W97). Labour is hourly (call-out,
// which carries the first hour, + further hours × rate), daily (days × team day
// rate), a fixed amount, or priced per person from the staff list ("My crew") —
// chosen per quote; rates seed from Settings.
//
// Whichever mode is used, the customer sees ONE line. Crew mode is the only one
// that knows the real wage cost behind that line, which is what lets it show a
// margin (see CrewPanel).

import type { Dispatch, SetStateAction } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  CREW_DEFAULT_MARKUP, FIXED_BASES, fixedBasisSpec, fixedLabourR, labourAmountR, managementFeeR,
  type QuoteScope, type ScopeFixedBasis,
} from '@/lib/quotes/scope'
import type { ScopeIssue } from '@/lib/quotes/scope-validate'
import { CrewPanel } from './CrewPanel'
import type { ScopePricing } from './ScopeWorkspace'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LabourPanel({ scope, onChange, pricing, issues }: {
  scope: QuoteScope
  onChange: Dispatch<SetStateAction<QuoteScope>>
  pricing: ScopePricing
  /** Whole-scope pre-flight; this panel shows the ones anchored to labour. */
  issues: ScopeIssue[]
}) {
  const labourIssues = issues.filter((i) => i.anchor === 'labour')
  const labour = scope.labour
  const setLabour = (patch: Partial<QuoteScope['labour']>) =>
    onChange((s) => ({ ...s, labour: { ...s.labour, ...patch } }))
  const num = (v: string) => Math.max(0, Number(v) || 0)

  const modeBtn = (mode: QuoteScope['labour']['mode'], label: string) => (
    <button
      type="button"
      onClick={() => setLabour({ mode })}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        labour.mode === mode
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/40'
      }`}
    >
      {label}
    </button>
  )

  return (
    <Card data-issue-anchor="labour">
      <CardContent className="space-y-3 pt-6">
        <div className="text-sm font-semibold">Labour</div>
        {/* One row now the panel is full width — it used to sit in a 340px rail. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {modeBtn('hourly', 'Call-out + hourly')}
          {modeBtn('daily', 'Day rate')}
          {modeBtn('fixed', 'Fixed price')}
          {modeBtn('crew', 'My crew')}
        </div>

        {labour.mode === 'hourly' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-[11px] text-muted-foreground">
              Call-out
              <Input leadingText="R" type="number" min={0} step="any" className="h-9"
                value={labour.calloutR === 0 ? '' : String(labour.calloutR)}
                onChange={(e) => setLabour({ calloutR: num(e.target.value) })} />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              Hours
              <Input type="number" min={0} step="any" className="h-9"
                value={labour.hours === 0 ? '' : String(labour.hours)}
                onChange={(e) => setLabour({ hours: num(e.target.value) })} />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              Rate /hr
              <Input leadingText="R" type="number" min={0} step="any" className="h-9"
                value={labour.rateR === 0 ? '' : String(labour.rateR)}
                onChange={(e) => setLabour({ rateR: num(e.target.value) })} />
            </label>
            <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-3">
              The call-out covers the first hour — enter total hours on site and only
              the hours beyond the first are charged at the hourly rate.
            </p>
          </div>
        )}

        {labour.mode === 'daily' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-[11px] text-muted-foreground">
              Days on site
              <Input type="number" min={0} step="0.5" className="h-9"
                value={labour.days === 0 ? '' : String(labour.days)}
                onChange={(e) => setLabour({ days: num(e.target.value) })} />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              Rate /day (team)
              <Input leadingText="R" type="number" min={0} step="any" className="h-9"
                value={labour.dayRateR === 0 ? '' : String(labour.dayRateR)}
                onChange={(e) => setLabour({ dayRateR: num(e.target.value) })} />
            </label>
            <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-1">
              Standard team of 4. Settings default: {rand(pricing.dayRateR)}/day — no
              call-out is added on day-rate work.
            </p>
          </div>
        )}

        {labour.mode === 'fixed' && (() => {
          // A fixed price is still worked out from something. Pick what it is
          // worked out from and the quote keeps the rate as well as the answer —
          // so "why R20 000?" has an answer, and the next job of the same shape
          // is priced the same way. The customer still sees one labour line.
          const spec = fixedBasisSpec(labour.fixedBasis)
          const unitName = labour.fixedUnitLabel.trim()
          const rateSuffix = labour.fixedBasis === 'unit' && unitName ? `/${unitName}` : spec.rateSuffix
          const qtyLabel = labour.fixedBasis === 'unit' && unitName
            ? `${unitName.charAt(0).toUpperCase()}${unitName.slice(1)}s`
            : spec.qtyLabel
          const qty = labour.fixedQty
          const rate = labour.fixedRateR

          return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {FIXED_BASES.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    title={b.hint}
                    onClick={() => setLabour({ fixedBasis: b.key as ScopeFixedBasis })}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      labour.fixedBasis === b.key
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {labour.fixedBasis === 'amount' ? (
                <label className="block max-w-xs space-y-1 text-[11px] text-muted-foreground">
                  Fixed labour amount
                  <Input leadingText="R" type="number" min={0} step="any" className="h-9"
                    value={labour.fixedR === 0 ? '' : String(labour.fixedR)}
                    onChange={(e) => setLabour({ fixedR: num(e.target.value) })} />
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    Rate
                    <Input leadingText="R" trailingText={rateSuffix}
                      type="number" min={0} step={spec.rateStep} className="h-9"
                      value={rate === 0 ? '' : String(rate)}
                      onChange={(e) => setLabour({ fixedRateR: num(e.target.value) })} />
                  </label>
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    {qtyLabel}
                    <Input type="number" min={0} step={spec.qtyStep} className="h-9"
                      value={qty === 0 ? '' : String(qty)}
                      onChange={(e) => setLabour({ fixedQty: num(e.target.value) })} />
                  </label>
                  {labour.fixedBasis === 'unit' && (
                    <label className="space-y-1 text-[11px] text-muted-foreground">
                      Unit is called
                      <Input className="h-9" placeholder="way, circuit, downlight"
                        value={labour.fixedUnitLabel}
                        onChange={(e) => setLabour({ fixedUnitLabel: e.target.value })} />
                    </label>
                  )}
                  <div className="space-y-1 text-[11px] text-muted-foreground">
                    Works out to
                    <div className="flex h-9 items-center text-sm font-medium tabular-nums text-foreground">
                      {rand(fixedLabourR(labour))}
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                {labour.fixedBasis !== 'amount' && qty > 0 && rate > 0 && (
                  <span className="font-medium text-foreground">
                    {qty.toLocaleString('en-ZA')}{rateSuffix.replace('/', ' ')} x {rand(rate)}
                    {rateSuffix} = {rand(fixedLabourR(labour))}.{' '}
                  </span>
                )}
                {spec.hint} The customer sees one labour line either way — the rate is
                yours, not theirs.
              </p>
            </div>
          )
        })()}

        {labour.mode === 'crew' && (
          <CrewPanel scope={scope} onChange={onChange} defaultMarkup={CREW_DEFAULT_MARKUP} />
        )}

        {/* ── Management fee ───────────────────────────────────────────────
            Getting to site, running the job, the admin behind it. On by
            default; switch it off on the jobs you are actually working, where
            your own hours are already in the labour above. */}
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={labour.managementIncluded}
              // Ticking it on a quote that has never carried the fee takes the
              // amount from Settings right here, so nothing has to be written
              // onto quotes that are switched off just to keep a figure warm.
              onChange={(e) => setLabour(
                e.target.checked && labour.managementR <= 0
                  ? { managementIncluded: true, managementR: pricing.managementR }
                  : { managementIncluded: e.target.checked },
              )}
            />
            Management fee
          </label>
          {labour.managementIncluded && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-end">
              <label className="space-y-0.5 text-[10px] text-muted-foreground">
                Fee
                <Input leadingText="R" type="number" min={0} step="any" className="h-8 text-xs"
                  value={labour.managementR === 0 ? '' : String(labour.managementR)}
                  onChange={(e) => setLabour({ managementR: num(e.target.value) })} />
              </label>
              <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-1">
                Supervision, site visits and admin — charged once per job whether or not
                you are on the tools. The customer never sees it as its own line: it is
                added into the labour total above.{' '}
                {labour.mode === 'hourly' && labour.calloutR > 0
                  ? 'On call-out work the call-out already covers getting you there — untick one of the two.'
                  : `Settings default: ${rand(pricing.managementR)}.`}
              </p>
            </div>
          )}
        </div>

        <Input
          value={labour.description}
          onChange={(e) => setLabour({ description: e.target.value })}
          placeholder={labour.mode === 'crew' ? 'Customer sees: "Labour" (optional override)' : 'Labour line description (optional)'}
          className="h-9"
        />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Labour total</span>
          <span className="font-medium">{rand(labourAmountR(labour))}</span>
        </div>
        {managementFeeR(labour) > 0 && (
          <p className="-mt-2 text-right text-[11px] text-muted-foreground">
            includes {rand(managementFeeR(labour))} management
          </p>
        )}
        {/* R0 labour is legal (supply-only work), so this states the case
            rather than blocking it — the quote just carries no labour. */}
        {labourIssues.map((i) => (
          <p key={i.id} className="text-[11px] font-medium text-warning">{i.message}</p>
        ))}

        <div className="border-t border-border pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scope.coc.included}
              onChange={(e) => onChange((s) => ({ ...s, coc: { ...s.coc, included: e.target.checked } }))}
            />
            Include Certificate of Compliance
          </label>
          {scope.coc.included && (
            <label className="mt-2 block space-y-1 text-[11px] text-muted-foreground">
              CoC fee
              <Input leadingText="R" type="number" min={0} step="any" className="h-9"
                value={scope.coc.feeR === 0 ? '' : String(scope.coc.feeR)}
                onChange={(e) => onChange((s) => ({
                  ...s,
                  coc: { ...s.coc, feeR: Math.max(0, Number(e.target.value) || 0) },
                }))} />
              <span>Settings default: {rand(pricing.cocFeeR)}</span>
            </label>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
