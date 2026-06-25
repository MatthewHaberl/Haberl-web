'use client'

import { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { verifyPanelString, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import {
  designInverterKw, designTotalKwp,
  INVERTER_PHASE_CONFIGS, inverterAcceptsPv, inverterAcceptsBattery,
  type InverterPhaseConfig,
} from '@/lib/solar/system-design'
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

      {/* Model / kW / phases — locked to the catalog spec when an inverter is chosen (item 24). */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 md:col-span-1">
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
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Phases</span>
          <select
            value={unit?.phases ?? 1}
            disabled={!unit || locked}
            onChange={(ev) => dispatch({ type: 'updateInverter', patch: { phases: Number(ev.target.value) >= 3 ? 3 : 1 } })}
            className={`h-9 rounded-md border border-border bg-background px-2 text-sm ${LOCKED_FIELD}`}
          >
            <option value={1}>Single-phase</option>
            <option value={3}>Three-phase</option>
          </select>
        </label>
      </div>
      {locked && <div className="mt-1.5"><LockNote>Model, kW and phases come from the catalog inverter</LockNote></div>}

      {/* Phase configuration (item 50) — the catalog prefills a sensible default but this
          stays editable so you can pick split-phase / American where the product doesn't say. */}
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

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <strong className="text-foreground">{inverterKw.toFixed(1)}</strong> kW AC total
        </span>
        {ratio != null && (
          <span className={`rounded-full border px-2 py-0.5 font-medium ${
            ratio > 1.3 ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
              : ratio < 0.5 ? 'border-border bg-muted/40 text-muted-foreground'
              : 'border-success/40 bg-success/5 text-success'
          }`}>
            DC:AC {ratio.toFixed(2)}
          </span>
        )}
      </div>

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
