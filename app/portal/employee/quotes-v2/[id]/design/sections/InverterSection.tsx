'use client'

import { useMemo, useState } from 'react'
import { Zap, Plug, Wand2, ChevronDown, ChevronUp } from 'lucide-react'
import { verifyPanelString, parseInverterSizingSpec, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import {
  designInverterKw, designTotalKwp,
  supplyKva, recommendedInverterKw, defaultSupply,
  INVERTER_PHASE_CONFIGS, inverterAcceptsPv, inverterAcceptsBattery,
  DEFAULT_SITE_CONDITIONS,
  type InverterPhaseConfig, type SupplyConfig,
} from '@/lib/solar/system-design'
import { computeStringLayout } from '@/lib/solar/compliance'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { SectionCard, LockNote, LOCKED_FIELD, SearchableSelect } from '../section-ui'

function phaseOf(gridSupply?: string): 'single' | 'three' {
  return String(gridSupply ?? '').toLowerCase().includes('three') ? 'three' : 'single'
}

export function InverterSection() {
  const { design, dispatch, gridSupply } = useDesign()
  const { items, loading } = useCatalog()
  const gridPhase = phaseOf(gridSupply)

  const inverters = useMemo(
    () => byCategory(items, 'inverter').filter((i) => i.phase === gridPhase || i.phase === 'any'),
    [items, gridPhase],
  )

  const unit = design.inverters[0]
  const selected = inverters.find((i) => i.id === unit?.catalogId) ?? null
  const firstPanel = design.panels[0]
  const panelItem: EquipmentCatalogItem | null =
    byCategory(items, 'panel').find((p) => p.id === firstPanel?.catalogId) ?? null
  const totalPanels = design.panels.reduce((s, g) => s + g.panelCount, 0)

  const stringVerdict = useMemo(
    () => verifyPanelString(selected, panelItem, totalPanels),
    [selected, panelItem, totalPanels],
  )

  const inverterKw = designInverterKw(design)
  const totalKwp = designTotalKwp(design)
  const ratio = inverterKw > 0 ? totalKwp / inverterKw : null
  // No built-in MPPT (acceptsPv off, e.g. Victron) → don't run the string check at all,
  // so the "no max DC voltage" warning never pops up for a battery-inverter.
  const pvOn = unit ? inverterAcceptsPv(unit) : true

  // W82: a "String plan" readout — how the total panels split into strings across
  // this inverter's MPPTs, incl. the max panels/string at the site (the "16 is
  // perfect" number). Reuses the same physics the per-string table uses.
  const invSpec = useMemo(() => parseInverterSizingSpec(selected?.notes), [selected])
  const stringPlan = useMemo(
    () => (panelItem && totalPanels > 0 && pvOn)
      ? computeStringLayout({ panelCount: totalPanels, panel: panelItem, spec: invSpec, conditions: design.site ?? DEFAULT_SITE_CONDITIONS })
      : null,
    [panelItem, totalPanels, invSpec, design.site, pvOn],
  )

  function pick(id: string) {
    const item = inverters.find((i) => i.id === id)
    if (!item) {
      // Drop to a manual unit so model/kw/phases stay editable when there's no catalog match.
      dispatch({
        type: 'setInverter',
        inverter: { catalogId: null, model: unit?.model ?? '', kw: unit?.kw ?? 0, phases: unit?.phases ?? (gridPhase === 'three' ? 3 : 1) },
      })
      return
    }
    const phases: 1 | 3 = item.phase === 'three' ? 3 : 1
    dispatch({
      type: 'setInverter',
      inverter: { catalogId: item.id, model: item.description, kw: (item.watts_ac ?? 0) / 1000, phases },
    })
    // Prefill a sensible phase config from the catalog phase but keep it user-editable
    // (item 50 — Victron MultiPlus-II ships single by default; you can switch to split-phase here).
    dispatch({
      type: 'updateInverter',
      patch: { phaseConfig: unit?.phaseConfig ?? (phases === 3 ? 'three_phase' : 'single_230') },
    })
  }

  // Catalog inverter selected → model / kW / phases are dictated by the product (item 24).
  const locked = !!unit?.catalogId

  return (
    <SectionCard
      title="Inverter"
      subtitle={`Filtered to ${gridPhase}-phase. The string check and DC:AC ratio update as you change panels or inverter.`}
    >
      <SupplySizer />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Inverter</span>
          <SearchableSelect
            value={unit?.catalogId ?? null}
            onChange={(v) => pick(v ?? '')}
            placeholder={loading ? 'Loading…' : 'None selected'}
            noneLabel="None selected"
            options={inverters.map((i) => ({
              value: i.id,
              label: `${i.description} — ${((i.watts_ac ?? 0) / 1000).toFixed(1)}kW`,
            }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Quantity (parallel)</span>
          <input
            type="number" min={1} step={1}
            value={unit?.qty ?? 1}
            disabled={!unit}
            onChange={(ev) => dispatch({ type: 'updateInverter', patch: { qty: Math.max(1, Math.round(Number(ev.target.value) || 1)) } })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
          />
        </label>
      </div>

      {/* Phase configuration (item 50) — THE phase control (the reducer derives `phases`
          from it). The catalog prefills a sensible default but this stays editable so you
          can pick split-phase / American where the product doesn't say. */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Phase configuration</span>
          <select
            value={unit?.phaseConfig ?? (unit?.phases === 3 ? 'three_phase' : 'single_230')}
            disabled={!unit}
            onChange={(ev) => dispatch({ type: 'updateInverter', patch: { phaseConfig: ev.target.value as InverterPhaseConfig } })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
          >
            {INVERTER_PHASE_CONFIGS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Model / kW override + capability toggles — advanced; opens by default only for a
          manual (non-catalog) inverter, where these fields are the only way to describe it. */}
      <details className="mt-3" open={!!unit && !unit.catalogId}>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Advanced (model override & capabilities)
        </summary>
        <div className="mt-2">
          {/* Model / kW — locked to the catalog spec when an inverter is chosen (item 24). */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Model</span>
              <input
                value={unit?.model ?? ''}
                disabled={!unit || locked}
                placeholder="e.g. Sunsynk 5kW"
                onChange={(ev) => dispatch({ type: 'updateInverter', patch: { model: ev.target.value } })}
                className={`h-9 rounded-md border border-border bg-background px-2 text-sm ${LOCKED_FIELD}`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">kW (AC)</span>
              <input
                type="number" min={0} step={0.1}
                value={unit?.kw ?? ''}
                disabled={!unit || locked}
                onChange={(ev) => dispatch({ type: 'updateInverter', patch: { kw: Math.max(0, Number(ev.target.value) || 0) } })}
                className={`h-9 rounded-md border border-border bg-background px-2 text-sm ${LOCKED_FIELD}`}
              />
            </label>
          </div>
          {locked && <div className="mt-1.5"><LockNote>Model and kW come from the catalog inverter</LockNote></div>}

          {/* Capability toggles (item 51) — default ON. */}
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={unit ? inverterAcceptsPv(unit) : true}
                disabled={!unit}
                onChange={(ev) => dispatch({ type: 'updateInverter', patch: { acceptsPv: ev.target.checked } })}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary disabled:opacity-50"
              />
              <span className="text-xs">
                <span className="font-medium text-foreground">PV / strings</span>
                <span className="block text-[11px] text-muted-foreground">Turn off for an inverter with no built-in MPPT (e.g. Victron) — suppresses the string checks.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={unit ? inverterAcceptsBattery(unit) : true}
                disabled={!unit}
                onChange={(ev) => dispatch({ type: 'updateInverter', patch: { acceptsBattery: ev.target.checked } })}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary disabled:opacity-50"
              />
              <span className="text-xs">
                <span className="font-medium text-foreground">Batteries</span>
                <span className="block text-[11px] text-muted-foreground">Turn off for a grid-tie inverter that can't take a battery.</span>
              </span>
            </label>
          </div>
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <strong className="text-foreground">{inverterKw.toFixed(1)}</strong> kW AC total
        </span>
        {ratio != null && (
          <span title="DC:AC ratio — panel kWp vs inverter kW AC. Healthy ≈ 1.0–1.3; higher clips at midday." className={`rounded-full border px-2 py-0.5 font-medium ${
            ratio > 1.3 ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
              : ratio < 0.5 ? 'border-border bg-muted/40 text-muted-foreground'
              : 'border-success/40 bg-success/5 text-success'
          }`}>
            DC:AC {ratio.toFixed(2)}
          </span>
        )}
      </div>

      {stringPlan && (
        <div className="mt-3 rounded-md border border-border bg-muted/20 p-2.5 text-xs">
          <div className="mb-0.5 flex items-center gap-1.5 font-medium text-foreground">
            <Zap className="h-3 w-3 text-primary" /> String plan
          </div>
          <p className="text-muted-foreground">
            {totalPanels} panels ≈{' '}
            <strong className="text-foreground">{stringPlan.stringCount}</strong> string{stringPlan.stringCount === 1 ? '' : 's'} of{' '}
            <strong className="text-foreground">
              {stringPlan.evenStrings ? stringPlan.panelsPerString : `${stringPlan.panelsPerStringMin}–${stringPlan.panelsPerString}`}
            </strong>{' '}
            {stringPlan.maxSeriesAllowed != null
              ? <>panels (max <strong className="text-foreground">{stringPlan.maxSeriesAllowed}</strong>/string at this inverter + site)</>
              : <>panels</>}
            {invSpec?.mpptCount ? <>, ≈ <strong className="text-foreground">{stringPlan.parallelStringsPerMppt}</strong>/MPPT across {invSpec.mpptCount} MPPTs</> : null}.
            {stringPlan.assumed && <span className="italic"> Add a max-DC-voltage spec to the inverter for an exact per-string limit.</span>}
          </p>
        </div>
      )}

      {!pvOn ? (
        <p className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          PV / string checks are off — this inverter has no built-in MPPT (PV runs via an external MPPT charge controller), so no string sizing is checked here.
        </p>
      ) : stringVerdict ? (
        <div className={`mt-3 rounded-md border p-3 text-sm ${
          stringVerdict.level === 'block' ? 'border-destructive/40 bg-destructive/5 text-destructive'
            : stringVerdict.level === 'warn' ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
            : 'border-success/40 bg-success/5 text-success'
        }`}>
          <p className="font-medium">
            {stringVerdict.level === 'block' ? '⛔' : stringVerdict.level === 'warn' ? '⚠' : '✓'} {stringVerdict.summary}
          </p>
          {stringVerdict.notes.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
              {stringVerdict.notes.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Select an inverter, a catalog panel and a panel count to run the string check.
        </p>
      )}
    </SectionCard>
  )
}

// ── Breaker-led sizing (W82) ───────────────────────────────────────────────────

interface InverterOption {
  key: string
  item: EquipmentCatalogItem
  qty: number
  totalKw: number
  redundant: boolean
}

/** Up to three ways to hit a target AC kW from the catalog: a single inverter, or
 *  2–3 smaller units in parallel (redundancy). Single-first. */
function recommendInverterOptions(targetKw: number, list: EquipmentCatalogItem[]): InverterOption[] {
  if (targetKw <= 0) return []
  const units = list
    .map((item) => ({ item, kw: (item.watts_ac ?? 0) / 1000 }))
    .filter((u) => u.kw > 0)
    .sort((a, b) => a.kw - b.kw)
  if (units.length === 0) return []
  const options: InverterOption[] = []
  const push = (item: EquipmentCatalogItem, kw: number, qty: number) => {
    const key = `${item.id}-${qty}`
    if (options.some((o) => o.key === key)) return
    options.push({ key, item, qty, totalKw: +(kw * qty).toFixed(1), redundant: qty >= 2 })
  }
  const single = units.find((u) => u.kw >= targetKw)
  if (single) push(single.item, single.kw, 1)
  for (const n of [2, 3]) {
    const u = units.find((x) => x.kw * n >= targetKw && x.kw < targetKw)
    if (u) push(u.item, u.kw, n)
  }
  // Nothing reaches the target alone → offer the largest unit ×N.
  if (options.length === 0) {
    const big = units[units.length - 1]
    const n = Math.max(1, Math.ceil(targetKw / big.kw))
    push(big.item, big.kw, n)
  }
  return options.slice(0, 3)
}

function SupplySizer() {
  const { design, dispatch } = useDesign()
  const { items } = useCatalog()
  // Expanded while there's no inverter yet (the sizer is the fastest route to one);
  // collapsed once a unit exists — still manually toggleable either way.
  const [sizerOpen, setSizerOpen] = useState(design.inverters.length === 0)
  const supply: SupplyConfig = design.supply ?? defaultSupply()
  const set = (patch: Partial<SupplyConfig>) => dispatch({ type: 'setSupply', patch })
  const kva = supplyKva(supply)
  const targetKw = recommendedInverterKw(supply)

  const phaseInverters = useMemo(
    () => byCategory(items, 'inverter').filter((i) =>
      supply.phases === 3 ? (i.phase === 'three' || i.phase === 'any') : (i.phase === 'single' || i.phase === 'any')),
    [items, supply.phases],
  )
  const options = useMemo(() => recommendInverterOptions(targetKw, phaseInverters), [targetKw, phaseInverters])

  function apply(opt: InverterOption) {
    const phases: 1 | 3 = opt.item.phase === 'three' ? 3 : 1
    dispatch({ type: 'setInverter', inverter: { catalogId: opt.item.id, model: opt.item.description, kw: (opt.item.watts_ac ?? 0) / 1000, phases } })
    dispatch({ type: 'updateInverter', patch: { qty: opt.qty, phaseConfig: phases === 3 ? 'three_phase' : 'single_230' } })
  }

  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <button
        type="button"
        onClick={() => setSizerOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-1.5 text-xs font-semibold text-foreground"
      >
        <Plug className="h-3.5 w-3.5 text-primary" /> Size from the main breaker
        {sizerOpen
          ? <ChevronUp className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
      {sizerOpen && (<>
      <div className="mt-2.5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Main breaker (A)</span>
          <input type="number" min={0} step={5} value={supply.mainBreakerA || ''}
            onChange={(e) => set({ mainBreakerA: Math.max(0, Number(e.target.value) || 0) })}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Phases</span>
          <select value={supply.phases}
            onChange={(e) => { const p = Number(e.target.value) >= 3 ? 3 : 1; set({ phases: p, voltageV: p === 3 ? 400 : 230 }) }}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm">
            <option value={1}>Single-phase</option>
            <option value={3}>Three-phase</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Voltage (V)</span>
          <input type="number" min={0} step={10} value={supply.voltageV || ''}
            onChange={(e) => set({ voltageV: Math.max(0, Number(e.target.value) || 0) })}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm" />
        </label>
        <div className="flex flex-col justify-end">
          <p className="text-[11px] text-muted-foreground">Breaker capacity</p>
          <p className="text-sm font-semibold text-foreground">≈ {kva.toFixed(0)} kVA</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        To take over a <strong className="text-foreground">{supply.mainBreakerA}A {supply.phases === 3 ? '3-phase' : '1-phase'}</strong> supply
        (~{kva.toFixed(0)} kVA) you want ≈ <strong className="text-foreground">{targetKw} kW</strong> of inverter.
      </p>
      {options.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {options.map((opt) => (
            <button key={opt.key} type="button" onClick={() => apply(opt)}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-xs hover:border-primary/50 hover:bg-primary/5">
              <span>
                <Wand2 className="mr-1 inline h-3 w-3 text-primary" />
                <strong className="text-foreground">{opt.qty} × {opt.item.description}</strong>
                <span className="text-muted-foreground"> — {opt.totalKw} kW{opt.redundant ? ' · N+ redundancy' : ''}</span>
              </span>
              <span className="shrink-0 rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Apply</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] italic text-muted-foreground">No catalog inverter matches yet — set the breaker, or pick one below.</p>
      )}
      </>)}
    </div>
  )
}
