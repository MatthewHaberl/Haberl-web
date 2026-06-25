'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeBalance } from '@/lib/solar/system-design'
import { designToBom } from '@/lib/solar/design-bom'
import { DEFAULT_PRICING, mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { buildLossModel } from '@/lib/solar/loss-model'
import { buildSavingsSummary, DEFAULT_TARIFF_RATE } from '@/lib/solar/savings'
import { SavingsAccumulation } from '@/components/charts/SavingsAccumulation'
import { useDesign } from '../DesignProvider'
import { useCatalog } from '../useCatalog'
import { SectionCard, EmptyHint } from '../section-ui'

const LOSS = buildLossModel()

function rand(n: number) {
  return `R${Math.round(n).toLocaleString('en-ZA')}`
}
function kwh(n: number) {
  return `${Math.round(n).toLocaleString('en-ZA')}`
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-primary/40 bg-primary/5' : 'border-border bg-background'}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function SavingsSection() {
  const { design, record, gridSupply } = useDesign()
  const { items, loading } = useCatalog()
  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const [tariff, setTariff] = useState(DEFAULT_TARIFF_RATE)
  const [allowExport, setAllowExport] = useState(false)
  const [feedInRate, setFeedInRate] = useState(0)

  useEffect(() => {
    let active = true
    createClient().from('company_settings').select('*').eq('id', true).maybeSingle()
      .then(({ data }) => { if (active && data) setPricing(mapSettingsToPricing(data)) })
    return () => { active = false }
  }, [])

  const catalog = useMemo(() => {
    const m = new Map<string, EquipmentCatalogItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const balance = useMemo(() => computeBalance(design, record), [design, record])
  const systemCostR = useMemo(
    () => designToBom(design, catalog, pricing.markup, { gridSupply, pricing }).totalSellR,
    [design, catalog, pricing, gridSupply],
  )

  const annualGen = (balance.generationKwh ?? 0) * 365
  const annualCons = (balance.demandKwh ?? 0) * 365

  const summary = useMemo(
    () => buildSavingsSummary(annualGen, annualCons, balance.batteryKwh, systemCostR, { tariffRate: tariff, allowExport, feedInRate }),
    [annualGen, annualCons, balance.batteryKwh, systemCostR, tariff, allowExport, feedInRate],
  )

  if (loading) {
    return (
      <SectionCard title="Savings & Performance">
        <p className="py-6 text-center text-xs text-muted-foreground">Loading catalog…</p>
      </SectionCard>
    )
  }

  if (annualGen <= 0 || annualCons <= 0) {
    return (
      <SectionCard title="Savings & Performance" subtitle="What the customer saves, read live off the energy balance + BOM">
        <EmptyHint>Add the customer&rsquo;s energy usage (Energy) and at least panels + an inverter, and the savings build here.</EmptyHint>
      </SectionCard>
    )
  }

  const a = summary.balance.annual
  const f = summary.financial
  const maxBill = Math.max(a.billBeforeR, 1)

  const inputCls = 'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm'

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Savings & Performance" subtitle="Read live off the energy balance + BOM — never a parallel calc">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Electricity tariff (R/kWh)</span>
            <input
              type="number" step="0.05" min="0" value={tariff}
              onChange={(e) => setTariff(Number(e.target.value) || 0)}
              className={inputCls}
            />
          </label>
          <label className="flex items-end gap-2 pb-1.5">
            <input type="checkbox" checked={allowExport} onChange={(e) => setAllowExport(e.target.checked)} />
            <span className="text-xs text-muted-foreground">Feed-in agreement (export paid)</span>
          </label>
          {allowExport && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Feed-in rate (R/kWh)</span>
              <input
                type="number" step="0.05" min="0" value={feedInRate}
                onChange={(e) => setFeedInRate(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </label>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="System price" value={rand(systemCostR)} />
          <Stat
            label="Payback" accent
            value={f.paybackYearsEscalated != null ? `${f.paybackYearsEscalated.toFixed(1)} yrs` : '—'}
            sub={f.paybackYears != null ? `${f.paybackYears.toFixed(1)} yrs at flat tariff` : undefined}
          />
          <Stat label="20-yr savings" value={rand(f.cumulativeEscalatedR)} accent sub={`${rand(f.cumulativeFlatR)} flat`} />
          <Stat label="Net present value" value={rand(f.npvR)} sub={f.roiPct != null ? `${f.roiPct}% 20-yr ROI` : undefined} />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Payback &amp; NPV assume {12}% tariff escalation, {0.5}% panel degradation, {10}% discount. Tariff is editable here for now — it moves to Settings with the assumption levers (W58).
        </p>
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Bill impact">
          <div className="flex items-end gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Now</p>
              <p className="text-lg font-bold text-foreground">{rand(a.billBeforeR / 12)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">With solar</p>
              <p className="text-lg font-bold text-primary">{rand(a.billAfterR / 12)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Saved / yr</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{rand(a.savingR)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Now</span>
              <div className="h-3 flex-1 rounded bg-muted">
                <div className="h-3 rounded bg-muted-foreground/50" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] text-muted-foreground">With solar</span>
              <div className="h-3 flex-1 rounded bg-muted">
                <div className="h-3 rounded bg-primary" style={{ width: `${Math.max(2, (a.billAfterR / maxBill) * 100)}%` }} />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="System performance" subtitle={`${LOSS ? Math.round(LOSS.totalLossPct * 100) : 15}% modelled system losses`}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">{a.energyFromSolarPct}%</p>
              <p className="text-[10px] text-muted-foreground">Energy from solar</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{a.gridIndependencePct}%</p>
              <p className="text-[10px] text-muted-foreground">Bill removed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{a.selfConsumptionPct}%</p>
              <p className="text-[10px] text-muted-foreground">Solar self-used</p>
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Loss assumptions</p>
            <div className="flex flex-col gap-0.5">
              {LOSS.components.map((c) => (
                <div key={c.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="tabular-nums">{(c.pct * 100).toFixed(1)}%</span>
                </div>
              ))}
              <div className="mt-0.5 flex items-center justify-between border-t border-border pt-0.5 text-xs font-semibold">
                <span>Total system loss</span>
                <span className="tabular-nums">{(LOSS.totalLossPct * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Monthly energy & savings" subtitle="Representative-day balance per month — generation, what's self-used, what's still bought">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Month</th>
                <th className="py-1 px-2 text-right font-medium">Generated</th>
                <th className="py-1 px-2 text-right font-medium">Used</th>
                <th className="py-1 px-2 text-right font-medium">Self-used</th>
                <th className="py-1 px-2 text-right font-medium">Bought</th>
                <th className="py-1 pl-2 text-right font-medium">Saved</th>
              </tr>
            </thead>
            <tbody>
              {summary.balance.months.map((m) => (
                <tr key={m.month} className="border-b border-border/60 last:border-0">
                  <td className="py-1 pr-2 font-medium text-foreground">{m.month}</td>
                  <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{kwh(m.generationKwh)}</td>
                  <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{kwh(m.consumptionKwh)}</td>
                  <td className="py-1 px-2 text-right tabular-nums text-foreground">{kwh(m.selfConsumedKwh)}</td>
                  <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{kwh(m.importedKwh)}</td>
                  <td className="py-1 pl-2 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{rand(m.savingR)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-1 pr-2">Year</td>
                <td className="py-1 px-2 text-right tabular-nums">{kwh(a.generationKwh)}</td>
                <td className="py-1 px-2 text-right tabular-nums">{kwh(a.consumptionKwh)}</td>
                <td className="py-1 px-2 text-right tabular-nums">{kwh(a.selfConsumedKwh)}</td>
                <td className="py-1 px-2 text-right tabular-nums">{kwh(a.importedKwh)}</td>
                <td className="py-1 pl-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{rand(a.savingR)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">kWh values. Monthly shape is a Gauteng seasonal estimate; the annual totals match the design&rsquo;s balance exactly.</p>
      </SectionCard>

      <SectionCard title="20-year savings" subtitle="Cumulative, flat vs 12% p.a. escalation">
        <SavingsAccumulation annualSavingR={summary.annualSavingR} />
      </SectionCard>
    </div>
  )
}
