'use client'

// Labour + CoC panel for the scope builder (W97). Labour is hourly (call-out +
// hours × rate) or a fixed amount, chosen per quote — rates seed from Settings.

import type { Dispatch, SetStateAction } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { labourAmountR, type QuoteScope } from '@/lib/quotes/scope'
import type { ScopePricing } from './ScopeWorkspace'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LabourPanel({ scope, onChange, pricing }: {
  scope: QuoteScope
  onChange: Dispatch<SetStateAction<QuoteScope>>
  pricing: ScopePricing
}) {
  const labour = scope.labour
  const setLabour = (patch: Partial<QuoteScope['labour']>) =>
    onChange((s) => ({ ...s, labour: { ...s.labour, ...patch } }))
  const num = (v: string) => Math.max(0, Number(v) || 0)

  const modeBtn = (mode: 'hourly' | 'fixed', label: string) => (
    <button
      type="button"
      onClick={() => setLabour({ mode })}
      className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        labour.mode === mode
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/40'
      }`}
    >
      {label}
    </button>
  )

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="text-sm font-semibold">Labour</div>
        <div className="flex gap-2">
          {modeBtn('hourly', 'Call-out + hourly')}
          {modeBtn('fixed', 'Fixed price')}
        </div>

        {labour.mode === 'hourly' ? (
          <div className="grid grid-cols-3 gap-2">
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
          </div>
        ) : (
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            Fixed labour amount
            <Input leadingText="R" type="number" min={0} step="any" className="h-9"
              value={labour.fixedR === 0 ? '' : String(labour.fixedR)}
              onChange={(e) => setLabour({ fixedR: num(e.target.value) })} />
          </label>
        )}

        <Input
          value={labour.description}
          onChange={(e) => setLabour({ description: e.target.value })}
          placeholder="Labour line description (optional)"
          className="h-9"
        />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Labour total</span>
          <span className="font-medium">{rand(labourAmountR(labour))}</span>
        </div>

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
