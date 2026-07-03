'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  X, Check, Info, AlertTriangle, CircleAlert, ShieldCheck, ShieldAlert, Send, Gauge, Sun, BatteryCharging,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_PRICING, mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { consolidateBom, designToBom } from '@/lib/solar/design-bom'
import { designComplianceChecks } from '@/lib/solar/design-quote'
import {
  computeBalance, inverterAcceptsPv, inverterAcceptsBattery, type VerdictLevel,
} from '@/lib/solar/system-design'
import { Button } from '@/components/ui/button'
import { useDesign } from './DesignProvider'
import { useCatalog } from './useCatalog'

function fmt(value: number | null, digits = 1): string {
  if (value == null) return '—'
  return value.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const VERDICT_STYLE: Record<VerdictLevel, { cls: string; Icon: typeof Info }> = {
  ok:    { cls: 'border-success/40 bg-success/5 text-success',             Icon: Check },
  info:  { cls: 'border-border bg-muted/40 text-muted-foreground',         Icon: Info },
  warn:  { cls: 'border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300', Icon: AlertTriangle },
  block: { cls: 'border-destructive/40 bg-destructive/5 text-destructive', Icon: CircleAlert },
}

/**
 * Studio layout — the on-demand Design overview. A right-docked popup (✕ / scrim /
 * Esc to close) that summarises the design without shouting a price: energy
 * verdicts + coverage, the live SANS 10142-1 compliance result, and BOM readiness.
 * Reuses the same selectors the BOM panel and balance header run.
 */
export function DesignOverview({ onClose }: { onClose: () => void }) {
  const { design, record, gridSupply } = useDesign()
  const { items } = useCatalog()
  const [pricing, setPricing] = useState(DEFAULT_PRICING)

  useEffect(() => {
    let active = true
    createClient()
      .from('company_settings').select('*').eq('id', true).maybeSingle()
      .then(({ data }) => { if (active && data) setPricing(mapSettingsToPricing(data)) })
    return () => { active = false }
  }, [])

  // Esc closes (mirrors ConfirmDialog).
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const catalog = useMemo(() => {
    const m = new Map<string, EquipmentCatalogItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const balance = useMemo(() => computeBalance(design, record), [design, record])
  const bom = useMemo(
    () => consolidateBom(designToBom(design, catalog, pricing.markup, { gridSupply, pricing })),
    [design, catalog, pricing, gridSupply],
  )
  const compliance = useMemo(
    () => designComplianceChecks({ design, bom, catalog, gridSupply }),
    [design, bom, catalog, gridSupply],
  )
  const blockers = compliance.filter((c) => c.status === 'blocker')
  const warnings = compliance.filter((c) => c.status === 'warning')
  const passes = compliance.filter((c) => c.status === 'pass')

  // Same PV/battery verdict filtering as BalanceHeader (item 51).
  const inv0 = design.inverters[0]
  const showPv = inv0 ? inverterAcceptsPv(inv0) : true
  const showBat = inv0 ? inverterAcceptsBattery(inv0) : true
  const verdicts = balance.verdicts.filter((v) => {
    if (!showPv && v.id.startsWith('inv-')) return false
    if (!showBat && v.id.startsWith('bat-')) return false
    return true
  })
  const coverage = balance.coveragePct

  function reviewSend() {
    onClose()
    document.getElementById('quote-status-bar')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Design overview"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-foreground">Design overview</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* Key figures */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { Icon: Gauge, label: 'Usage', value: fmt(balance.demandKwh), unit: 'kWh/d' },
              { Icon: Sun, label: 'Generation', value: fmt(balance.generationKwh), unit: 'kWh/d' },
              { Icon: BatteryCharging, label: 'Storage', value: fmt(balance.storageHours), unit: 'hrs' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <s.Icon className="h-3 w-3" /> {s.label}
                </span>
                <span className="mt-0.5 block text-lg font-bold tabular-nums text-foreground">
                  {s.value}<span className="ml-1 text-[11px] font-medium text-muted-foreground">{s.unit}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Verdicts + coverage */}
          {(coverage != null || verdicts.length > 0) && (
            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</h3>
              <div className="flex flex-wrap gap-1.5">
                {coverage != null && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                    coverage >= 90 ? 'border-success/40 bg-success/5 text-success'
                      : coverage >= 50 ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-destructive/40 bg-destructive/5 text-destructive'
                  }`}>
                    {coverage.toFixed(0)}% of daily usage
                  </span>
                )}
                {verdicts.map((v) => {
                  const s = VERDICT_STYLE[v.level]
                  return (
                    <span key={v.id} className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${s.cls}`}>
                      <s.Icon className="h-3 w-3" /> {v.label}
                    </span>
                  )
                })}
              </div>
            </section>
          )}

          {/* SANS compliance */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {blockers.length ? <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> : <ShieldCheck className="h-3.5 w-3.5 text-success" />}
              SANS 10142-1
            </h3>
            {compliance.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add products and the compliance checks run here.</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${blockers.length ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                    {blockers.length} blocker{blockers.length === 1 ? '' : 's'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${warnings.length ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                    {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                  </span>
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                    {passes.length} passed
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {[...blockers, ...warnings].map((c) => (
                    <div key={c.id} className="flex items-start gap-1.5 text-[11px]">
                      <span className="mt-0.5 shrink-0">{c.status === 'blocker' ? '⛔' : '⚠'}</span>
                      <span>
                        <span className="font-medium text-foreground">{c.title}</span>
                        <span className="text-muted-foreground"> — {c.detail} </span>
                        <span className="text-muted-foreground/70">({c.reference})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* BOM readiness — counts only, no price */}
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bill of materials</h3>
            {bom.needsPricing > 0 ? (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><strong>{bom.needsPricing}</strong> item(s) still need a supplier price. Open <strong>Review BOM</strong> to export them.</span>
              </p>
            ) : (
              <p className="flex items-center gap-1.5 rounded-md border border-success/40 bg-success/5 px-3 py-1.5 text-[11px] text-success">
                <Check className="h-3.5 w-3.5 shrink-0" /> Every line is priced.
              </p>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t border-border bg-card p-4">
          <Button variant="accent" className="w-full" onClick={reviewSend}>
            <Send className="h-4 w-4" /> Review &amp; send quote
          </Button>
        </div>
      </div>
    </>
  )
}
