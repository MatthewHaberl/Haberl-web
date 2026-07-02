'use client'

import { useEffect, useMemo, useState } from 'react'
import { BatteryCharging, ChevronDown, ChevronRight, Gauge, Layers, Plus, Trash2, Cable } from 'lucide-react'
import { evaluateBatteryForInverter, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import {
  computeBalance, designBatteryKwh, designInverterKw,
  batteryCRate, batteryDcCurrent, cableRunsNeeded, DC_CABLE_AMPACITY,
  defaultDisconnectChoice, inverterAcceptsBattery,
  parseBatteryVoltage, parseBatteryStack, cutoffFromNominal,
  type CRateLevel, type BatteryBank, type BatteryUnit, type DisconnectKind, type DisconnectChoice,
  type BatteryBusbarSpec, type BankCable,
} from '@/lib/solar/system-design'
import { simulateEnergyBalance } from '@/lib/solar/energy-balance'
import { buildBalanceInput, DEFAULT_TARIFF_RATE } from '@/lib/solar/savings'
import { CompatSelect } from '@/components/ui/CompatSelect'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
import { SectionCard, ReorderButtons, LOCKED_FIELD, LockNote } from '../section-ui'

const CRATE_STYLE: Record<CRateLevel, string> = {
  ideal: 'border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300',
  good: 'border-green-400/60 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300',
  warn: 'border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
  block: 'border-destructive/40 bg-destructive/5 text-destructive',
}

// Type of switchgear a battery section is broken at (item 23).
const DISCONNECT_KINDS: Array<{ value: DisconnectKind; label: string }> = [
  { value: 'fuse-disconnect', label: 'Fused disconnect' },
  { value: 'isolator', label: 'Isolator' },
  { value: 'breaker', label: 'Breaker (MCB/MCCB)' },
  { value: 'dc-switch', label: 'DC switch' },
  { value: 'dc-switchgear', label: 'DC switchgear (assembly)' },
  { value: 'none', label: 'None' },
]

// Busbar source — a Victron Lynx link, a catalog product, or a hand-built bar.
type BusbarSource = 'victron-lynx' | 'catalog' | 'custom'
const VICTRON_LYNX_LABEL = 'Victron Lynx link'

// First battery node id in designToFlow (the rest are batt-1, batt-2, …).
const NODE_BATTERY = 'battery'

const CABLE_MATERIALS: Array<{ value: string; label: string }> = [
  { value: 'CU', label: 'Copper' },
  { value: 'AL', label: 'Aluminium' },
]

export function BatterySection() {
  const { design, dispatch, record } = useDesign()
  const { items, loading } = useCatalog()

  const inverterItem: EquipmentCatalogItem | null =
    byCategory(items, 'inverter').find((i) => i.id === design.inverters[0]?.catalogId) ?? null

  // Item 51: grid-tie inverters can't take a battery — gate the whole section.
  const inv0 = design.inverters[0]
  const acceptsBattery = inv0 ? inverterAcceptsBattery(inv0) : true

  // Keep blocked batteries visible but push them to the bottom of the list, so a
  // mistakenly-blocked item can still be spotted and flagged.
  const candidates = useMemo(
    () => byCategory(items, 'battery')
      .map((item) => ({ item, compat: evaluateBatteryForInverter(inverterItem, item) }))
      .sort((a, b) => (a.compat.level === 'block' ? 1 : 0) - (b.compat.level === 'block' ? 1 : 0)),
    [items, inverterItem],
  )

  const unit = design.batteries[0]
  const balance = useMemo(() => computeBalance(design, record), [design, record])
  const batteryKwh = designBatteryKwh(design)
  const inverterKw = designInverterKw(design)
  const bank = design.bank
  const cr = batteryCRate(inverterKw, batteryKwh)
  // W84: live grid-independence / self-consumption / cycles-per-day as the module
  // count changes — read off the same honest hourly engine the Savings view uses.
  // The percentages are tariff-independent, so the default rate is fine here.
  const independence = useMemo(() => {
    const annualGen = (balance.generationKwh ?? 0) * 365
    const annualCons = (balance.demandKwh ?? 0) * 365
    if (annualGen <= 0 || annualCons <= 0 || batteryKwh <= 0) return null
    return simulateEnergyBalance(
      buildBalanceInput(annualGen, annualCons, batteryKwh, { tariffRate: DEFAULT_TARIFF_RATE }),
    ).annual
  }, [balance.generationKwh, balance.demandKwh, batteryKwh])
  // Worst-case: size off the discharge-cutoff voltage, not nominal.
  const dcCurrent = batteryDcCurrent(inverterKw, bank.cutoffVoltage)
  const cableRuns = cableRunsNeeded(dcCurrent, bank.cableSizeMm2)
  const cableSizes = Object.keys(DC_CABLE_AMPACITY).map(Number)
  // Derived: feeds = installed inverter count; whole house if no backup load is set.
  const inverterFeeds = design.inverters.reduce((s, u) => s + u.qty, 0) || 1
  const hasBackup = (design.energy.essentialLoadKw ?? 0) > 0
  // Progressive disclosure — the full wiring/disconnect builder starts collapsed.
  const [wiringOpen, setWiringOpen] = useState(false)
  function setBank(patch: Partial<BatteryBank>) { dispatch({ type: 'setBank', patch }) }

  // ── Series (HV) stack + voltage (item W85) ──────────────────────────────────
  const selectedBatItem = unit?.catalogId ? candidates.find((c) => c.item.id === unit.catalogId)?.item ?? null : null
  const isStack = !!unit?.seriesStack
  const stackSize = unit?.stackSize ?? 1
  const perModuleKwh = unit?.perModuleKwh ?? 0
  const perModuleVoltage = unit?.perModuleVoltage ?? 0
  const minModules = unit?.minModules ?? 2
  const maxModules = unit?.maxModules ?? 16
  const override = !!bank.voltageOverride
  // Effective voltage the bank sizes off — a series stack scales it with the module
  // count, otherwise the stored (or catalog-derived) single-unit nominal is used. The
  // catalog fallback self-heals designs saved before voltage was derived.
  const effV = useMemo<{ voltageClass: 'LV' | 'HV'; nominalVoltage: number } | null>(() => {
    if (!unit) return null
    if (isStack && perModuleVoltage && stackSize) {
      return { voltageClass: 'HV', nominalVoltage: Math.round(perModuleVoltage * stackSize * 10) / 10 }
    }
    if (unit.nominalVoltage && unit.voltageClass) return { voltageClass: unit.voltageClass, nominalVoltage: unit.nominalVoltage }
    if (selectedBatItem) {
      const { voltage, voltageClass } = parseBatteryVoltage(selectedBatItem.notes, selectedBatItem.description)
      if (voltage) return { voltageClass: voltageClass ?? (voltage >= 90 ? 'HV' : 'LV'), nominalVoltage: voltage }
    }
    return null
  }, [unit, isStack, perModuleVoltage, stackSize, selectedBatItem])

  // Keep the persisted bank voltage in step with the selected battery (+ stack size)
  // unless the user has taken manual control. Downstream (cable math, diagram) reads
  // the stored bank fields, so we cache the derived values there.
  useEffect(() => {
    if (override || !effV) return
    const cutoff = cutoffFromNominal(effV.nominalVoltage)
    if (bank.voltageClass !== effV.voltageClass || bank.nominalVoltage !== effV.nominalVoltage || bank.cutoffVoltage !== cutoff) {
      setBank({ voltageClass: effV.voltageClass, nominalVoltage: effV.nominalVoltage, cutoffVoltage: cutoff })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override, effV?.voltageClass, effV?.nominalVoltage])

  // Patch the battery unit, recomputing one stack's kWh when a stack field changes.
  function patchBattery(patch: Partial<BatteryUnit>) {
    const next = { ...unit, ...patch } as BatteryUnit
    if (next.seriesStack && next.perModuleKwh != null && next.stackSize != null) {
      patch = { ...patch, kwh: Math.round(next.perModuleKwh * next.stackSize * 100) / 100 }
    }
    dispatch({ type: 'updateBattery', patch })
  }

  // Enable/disable a hand-built series stack when the catalog has no stack metadata.
  function toggleSeriesStack(on: boolean) {
    if (!on) { patchBattery({ seriesStack: false, stackSize: 1 }); return }
    const { voltage } = parseBatteryVoltage(selectedBatItem?.notes, selectedBatItem?.description ?? '')
    const size = unit?.stackSize && unit.stackSize > 1 ? unit.stackSize : (unit?.maxModules ?? 12)
    const perKwh = unit?.perModuleKwh || (selectedBatItem?.kwh ? Math.round((selectedBatItem.kwh / size) * 100) / 100 : 0)
    const perV = unit?.perModuleVoltage || (voltage ? Math.round((voltage / size) * 10) / 10 : 0)
    patchBattery({
      seriesStack: true, stackSize: size,
      minModules: unit?.minModules ?? 4, maxModules: unit?.maxModules ?? 12,
      perModuleKwh: perKwh, perModuleVoltage: perV,
    })
  }

  // ── Disconnect choices (item 23) — a type selector + a catalog-backed product. ──
  const disconnectProducts = byCategory(items, 'disconnect')
  const mainChoice: DisconnectChoice = bank.mainDisconnectChoice ?? defaultDisconnectChoice('isolator')
  const perBatChoice: DisconnectChoice = bank.perBatteryDisconnectChoice ?? defaultDisconnectChoice('breaker')
  function setMainChoice(patch: Partial<DisconnectChoice>) { setBank({ mainDisconnectChoice: { ...mainChoice, ...patch } }) }
  function setPerBatChoice(patch: Partial<DisconnectChoice>) { setBank({ perBatteryDisconnectChoice: { ...perBatChoice, ...patch } }) }

  // ── Busbar picker (item 27) — Victron Lynx / catalog / custom, with a fab spec. ──
  const busbarSpec: BatteryBusbarSpec = bank.busbarSpec ?? { product: null, material: null, lengthMm: null, widthMm: null }
  const busbarSource: BusbarSource = busbarSpec.product === VICTRON_LYNX_LABEL
    ? 'victron-lynx'
    : busbarSpec.product
      ? 'catalog'
      : 'custom'
  const busbarLocked = busbarSource !== 'custom'
  // Only offer the Lynx link on Victron systems — but never strand a saved pick.
  const showLynxOption =
    /victron/i.test(design.inverters[0]?.model ?? '') ||
    /victron/i.test(unit?.model ?? '') ||
    busbarSpec.product === VICTRON_LYNX_LABEL
  function setBusbarSpec(patch: Partial<BatteryBusbarSpec>) { setBank({ busbarSpec: { ...busbarSpec, ...patch } }) }
  function pickBusbarSource(src: BusbarSource) {
    if (src === 'victron-lynx') {
      // A Lynx link is a fixed copper bar — auto-fill + lock its specs.
      setBank({ busbarSpec: { product: VICTRON_LYNX_LABEL, material: 'copper', lengthMm: 280, widthMm: 30 } })
    } else if (src === 'catalog') {
      setBank({ busbarSpec: { ...busbarSpec, product: busbarSpec.product && busbarSpec.product !== VICTRON_LYNX_LABEL ? busbarSpec.product : '', material: busbarSpec.material ?? 'copper' } })
    } else {
      setBank({ busbarSpec: { product: null, material: busbarSpec.material ?? 'copper', lengthMm: busbarSpec.lengthMm, widthMm: busbarSpec.widthMm } })
    }
  }
  function pickBusbarProduct(id: string | null) {
    const item = id ? disconnectProducts.find((x) => x.id === id) ?? items.find((x) => x.id === id) : null
    // A chosen catalog bar dictates the spec → auto-fill material + lock.
    setBank({ busbarSpec: { product: id, material: item ? (busbarSpec.material ?? 'copper') : busbarSpec.material, lengthMm: busbarSpec.lengthMm, widthMm: busbarSpec.widthMm } })
  }

  // ── Itemised bank cables (item 28) — default size applies to any unlisted run. ──
  const cables = bank.cables ?? []
  function addCable() { dispatch({ type: 'addBankCable', cable: { fromRef: 'bat-busbar', toRef: NODE_BATTERY, sizeMm2: String(bank.cableSizeMm2) } }) }
  function updateCable(id: string, patch: Partial<BankCable>) { dispatch({ type: 'updateBankCable', id, patch }) }
  function removeCable(id: string) { dispatch({ type: 'removeBankCable', id }) }
  function moveCable(from: number, to: number) { dispatch({ type: 'reorderBankCable', from, to }) }

  // Named endpoints a cable can run between — must match the node ids designToFlow emits.
  const batCount = Math.min(unit?.qty ?? 1, 12)
  const cablePoints: Array<{ id: string; label: string }> = [
    ...(bank.busbar ? [{ id: 'bat-busbar', label: 'DC busbar' }] : []),
    ...(bank.mainDisconnect ? [{ id: 'bat-main', label: 'Main disconnect' }] : []),
    { id: 'inverter', label: 'Inverter' },
    ...Array.from({ length: batCount }, (_, i) => ({ id: i === 0 ? NODE_BATTERY : `batt-${i}`, label: `Battery ${i + 1}` })),
    ...(bank.perBatteryDisconnect ? Array.from({ length: batCount }, (_, i) => ({ id: `bat-disc-${i}`, label: `Battery ${i + 1} disconnect` })) : []),
  ]

  function pick(id: string) {
    const item = candidates.find((c) => c.item.id === id)?.item
    if (!item) { dispatch({ type: 'removeBattery' }); return }
    // Derive class + nominal voltage, and auto-fill a series stack when the catalog
    // notes describe one (item W85) — voltage then scales with the module count.
    const { voltage, voltageClass } = parseBatteryVoltage(item.notes, item.description)
    const stack = parseBatteryStack(item.notes)
    const battery: Partial<BatteryUnit> = {
      catalogId: item.id, model: item.description, kwh: item.kwh ?? 0,
      voltageClass: voltageClass ?? undefined,
      nominalVoltage: voltage ?? undefined,
      seriesStack: false,
      stackSize: 1,
    }
    if (stack) {
      const size = stack.maxModules
      const perKwh = stack.perModuleKwh ?? (item.kwh ? Math.round((item.kwh / size) * 100) / 100 : 0)
      const perV = stack.perModuleVoltage ?? (voltage ? Math.round((voltage / size) * 10) / 10 : 0)
      battery.seriesStack = true
      battery.minModules = stack.minModules
      battery.maxModules = stack.maxModules
      battery.stackSize = size
      battery.perModuleKwh = perKwh
      battery.perModuleVoltage = perV
      battery.kwh = Math.round(perKwh * size * 100) / 100
    }
    dispatch({ type: 'setBattery', battery })
  }

  // Grid-tie inverter (acceptsBattery === false): no battery editors, can't add one.
  if (!acceptsBattery) {
    return (
      <SectionCard
        title="Batteries"
        subtitle="Incompatible batteries are shown greyed-out with the reason. Storage hours update live."
      >
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          This inverter does not accept batteries.
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Batteries"
      subtitle="Incompatible batteries are shown greyed-out with the reason. Storage hours update live."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Battery</span>
          {loading ? (
            <div className="h-9 rounded-md border border-border bg-muted/30" />
          ) : (
            <CompatSelect
              value={unit?.catalogId ?? ''}
              onChange={pick}
              options={candidates.map((c) => ({
                id: c.item.id,
                label: `${c.item.description}${c.item.kwh ? ` — ${c.item.kwh}kWh` : ''}`,
                level: c.compat.level,
                reason: c.compat.reason || undefined,
              }))}
              placeholder="Select a battery"
            />
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{isStack ? 'Parallel banks' : 'Modules'}</span>
          <input
            type="number" min={1} step={1}
            value={unit?.qty ?? 1}
            disabled={!unit}
            onChange={(ev) => dispatch({ type: 'updateBattery', patch: { qty: Math.max(1, Math.round(Number(ev.target.value) || 1)) } })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
          />
          {isStack && <span className="text-[10px] text-muted-foreground">Identical stacks in parallel</span>}
        </label>
      </div>

      {/* Series (HV) stack builder (item W85) — modules in series, voltage scales with count. */}
      {unit && (
        <div className="mt-3 rounded-lg border border-border bg-muted/20 p-2.5">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={isStack} onChange={(e) => toggleSeriesStack(e.target.checked)} className="accent-primary" />
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Layers className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" /> Series (HV) stack — voltage scales with modules
            </span>
          </label>
          {isStack && (
            <>
              <div className="mt-2.5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Stack size (series)</span>
                  <input
                    type="number" min={minModules} max={maxModules} step={1}
                    value={stackSize}
                    onChange={(e) => patchBattery({ stackSize: Math.max(minModules, Math.min(maxModules, Math.round(Number(e.target.value) || minModules))) })}
                    className="h-8 rounded border border-border bg-background px-1.5 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">{minModules}–{maxModules} modules</span>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Per-module kWh</span>
                  <input
                    type="number" min={0} step={0.01}
                    value={perModuleKwh || ''}
                    onChange={(e) => patchBattery({ perModuleKwh: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-8 rounded border border-border bg-background px-1.5 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Per-module V</span>
                  <input
                    type="number" min={0} step={0.1}
                    value={perModuleVoltage || ''}
                    onChange={(e) => patchBattery({ perModuleVoltage: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-8 rounded border border-border bg-background px-1.5 text-xs"
                  />
                </label>
                <div className="flex gap-1.5">
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Min</span>
                    <input
                      type="number" min={1} step={1}
                      value={minModules}
                      onChange={(e) => patchBattery({ minModules: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                      className="h-8 w-full rounded border border-border bg-background px-1.5 text-xs"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Max</span>
                    <input
                      type="number" min={1} step={1}
                      value={maxModules}
                      onChange={(e) => patchBattery({ maxModules: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                      className="h-8 w-full rounded border border-border bg-background px-1.5 text-xs"
                    />
                  </label>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                <strong className="text-foreground">{stackSize}</strong> in series
                {(unit.qty ?? 1) > 1 ? <> × <strong className="text-foreground">{unit.qty}</strong> banks</> : null}
                {' '}→ <strong className="text-foreground">{(perModuleKwh * stackSize * (unit.qty ?? 1)).toFixed(1)}</strong> kWh
                {' '}@ <strong className="text-foreground">{Math.round(perModuleVoltage * stackSize)}</strong> VDC nominal
              </p>
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BatteryCharging className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <strong className="text-foreground">{batteryKwh.toFixed(1)}</strong> kWh total
        </span>
        {balance.storageHours != null && (
          <span><strong className="text-foreground">{balance.storageHours.toFixed(1)}</strong> hrs at {hasBackup ? 'backup load' : 'full house load'}</span>
        )}
        {balance.storageHours == null && batteryKwh > 0 && (
          <span>Set an essential load or usage in Energy to see hours of storage.</span>
        )}
      </div>

      {/* W84 — live grid-independence readout (OpenSolar-style), updates as qty changes. */}
      {independence && (
        <div className="mt-3">
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/20 p-2.5 text-center">
            <div>
              <p className="text-xl font-bold text-primary">{independence.gridIndependencePct}%</p>
              <p className="text-[10px] text-muted-foreground">Grid independence</p>
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{independence.selfConsumptionPct}%</p>
              <p className="text-[10px] text-muted-foreground">Solar self-used</p>
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{independence.batteryCyclesPerDay.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">Cycles / day</p>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Add or remove modules above to move grid independence — it updates live off the energy balance (needs usage + panels set).
          </p>
        </div>
      )}

      {batteryKwh > 0 && inverterKw > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {cr.level && (
            <span className={`self-start flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${CRATE_STYLE[cr.level]}`}>
              <Gauge className="h-3.5 w-3.5" /> C-rate {cr.label}
            </span>
          )}
          <p className="text-xs text-muted-foreground">
            At full inverter draw ≈ <strong className="text-foreground">{Math.round(dcCurrent)}A</strong> DC (~{bank.cutoffVoltage}V worst-case cutoff) →
            battery cable <strong className="text-foreground">{bank.cableSizeMm2}mm² × {cableRuns}</strong> run{cableRuns > 1 ? 's' : ''}.
          </p>
        </div>
      )}

      {design.batteries.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          {/* Progressive disclosure — one-line summary until the builder is opened. */}
          <button
            type="button"
            onClick={() => setWiringOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bank wiring &amp; disconnects (advanced)
              {wiringOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
            {!wiringOpen && (
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {[
                  `${bank.cableSizeMm2}mm² × ${cableRuns}`,
                  bank.mainDisconnect ? 'main disconnect' : null,
                  bank.busbar ? 'busbar' : null,
                  bank.perBatteryDisconnect ? 'per-battery disconnects' : null,
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </button>
          {wiringOpen && (<div className="mt-2">
          {/* Voltage class + nominal — derived from the battery (+ stack) unless overridden. */}
          <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <input type="checkbox" checked={override} onChange={(e) => setBank({ voltageOverride: e.target.checked })} className="accent-primary" />
              Override voltage
            </label>
            <label className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Class</span>
              <select value={bank.voltageClass} disabled={!override} onChange={(e) => setBank({ voltageClass: e.target.value as BatteryBank['voltageClass'] })} className={`h-7 rounded border border-border bg-background px-1.5 text-[11px] ${LOCKED_FIELD}`}>
                <option value="LV">LV</option>
                <option value="HV">HV</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Nominal V</span>
              <input type="number" min={0} step={0.1} value={bank.nominalVoltage} disabled={!override} onChange={(e) => setBank({ nominalVoltage: Number(e.target.value) || 0 })} className={`h-7 w-20 rounded border border-border bg-background px-1.5 text-[11px] ${LOCKED_FIELD}`} />
            </label>
            <span className="text-muted-foreground"><strong className="text-foreground">{inverterFeeds}</strong> inverter feed{inverterFeeds === 1 ? '' : 's'}</span>
            {!override && <span className="text-[11px] text-muted-foreground opacity-70">— derived from the selected battery{isStack ? ' + stack size' : ''}</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Cable size</span>
              <select value={bank.cableSizeMm2} onChange={(e) => setBank({ cableSizeMm2: Number(e.target.value) })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                {cableSizes.map((s) => <option key={s} value={s}>{s}mm² (≈{DC_CABLE_AMPACITY[s]}A)</option>)}
              </select>
            </label>
            <ProductPicker items={items} category="cable" label="Default cable product" value={bank.cableProductId} onChange={(v) => setBank({ cableProductId: v })} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Worst-case cutoff V</span>
              <input type="number" min={0} step={0.1} value={bank.cutoffVoltage} disabled={!override} onChange={(e) => setBank({ cutoffVoltage: Number(e.target.value) || 0 })} className={`h-8 rounded-md border border-border bg-background px-2 text-xs ${LOCKED_FIELD}`} />
              {!override && <LockNote>Auto (≈86% of nominal) — tick Override to set</LockNote>}
            </label>
          </div>

          {/* Disconnect / busbar builder — inverter → main disconnect → busbar → per-battery */}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1.5">Disconnects &amp; busbar</p>
          <div className="flex flex-col gap-2.5">
            {/* Main disconnect (bank → inverter) — type + product (item 23). */}
            <div className="rounded-md border border-border/70 bg-muted/20 p-2">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={bank.mainDisconnect} onChange={(e) => setBank({ mainDisconnect: e.target.checked })} className="accent-primary" />
                <span className="text-xs font-medium">Main disconnect (bank → inverter)</span>
              </label>
              {bank.mainDisconnect && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Type</span>
                    <select value={mainChoice.type} onChange={(e) => setMainChoice({ type: e.target.value as DisconnectKind })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                      {DISCONNECT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </label>
                  <ProductPicker items={items} category="disconnect" label="Product" value={mainChoice.product} onChange={(v) => setMainChoice({ product: v })} />
                </div>
              )}
            </div>

            {/* Busbar picker (item 27) — source + fabrication spec. */}
            <div className="rounded-md border border-border/70 bg-muted/20 p-2">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={bank.busbar} onChange={(e) => setBank({ busbar: e.target.checked })} className="accent-primary" />
                <span className="text-xs font-medium">Busbar</span>
              </label>
              {bank.busbar && (
                <div className="mt-2 flex flex-col gap-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Busbar source</span>
                    <select value={busbarSource} onChange={(e) => pickBusbarSource(e.target.value as BusbarSource)} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                      {showLynxOption && <option value="victron-lynx">Victron Lynx link</option>}
                      <option value="catalog">Catalog product</option>
                      <option value="custom">Custom (hand-built)</option>
                    </select>
                  </label>
                  {busbarSource === 'catalog' && (
                    <ProductPicker items={items} category="disconnect" label="Busbar product" value={busbarSpec.product} onChange={pickBusbarProduct} />
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">Material</span>
                      <select value={busbarSpec.material ?? 'copper'} disabled={busbarLocked} onChange={(e) => setBusbarSpec({ material: e.target.value as BatteryBusbarSpec['material'] })} className={`h-7 rounded border border-border bg-background px-1.5 text-[11px] ${LOCKED_FIELD}`}>
                        <option value="copper">Copper</option>
                        <option value="aluminium">Aluminium</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">Length (mm)</span>
                      <input type="number" min={0} value={busbarSpec.lengthMm ?? ''} disabled={busbarLocked} onChange={(e) => setBusbarSpec({ lengthMm: e.target.value === '' ? null : Number(e.target.value) })} className={`h-7 rounded border border-border bg-background px-1.5 text-[11px] ${LOCKED_FIELD}`} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">Width (mm)</span>
                      <input type="number" min={0} value={busbarSpec.widthMm ?? ''} disabled={busbarLocked} onChange={(e) => setBusbarSpec({ widthMm: e.target.value === '' ? null : Number(e.target.value) })} className={`h-7 rounded border border-border bg-background px-1.5 text-[11px] ${LOCKED_FIELD}`} />
                    </label>
                  </div>
                  {busbarLocked && <LockNote>{busbarSource === 'victron-lynx' ? 'Spec set by the Victron Lynx link' : 'Spec set by the selected busbar product'}</LockNote>}
                </div>
              )}
            </div>

            {/* Per-battery disconnect — type + product (item 23). */}
            <div className="rounded-md border border-border/70 bg-muted/20 p-2">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={bank.perBatteryDisconnect} onChange={(e) => setBank({ perBatteryDisconnect: e.target.checked })} className="accent-primary" />
                <span className="text-xs font-medium">A disconnect per battery</span>
              </label>
              {bank.perBatteryDisconnect && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Type</span>
                    <select value={perBatChoice.type} onChange={(e) => setPerBatChoice({ type: e.target.value as DisconnectKind })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                      {DISCONNECT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </label>
                  <ProductPicker items={items} category="disconnect" label="Product" value={perBatChoice.product} onChange={(v) => setPerBatChoice({ product: v })} />
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {bank.perBatteryDisconnect
              ? `Each of the ${unit?.qty ?? 1} batteries → its own disconnect → ${bank.busbar ? 'busbar → ' : ''}${bank.mainDisconnect ? 'main disconnect → ' : ''}inverter.`
              : `Batteries paralleled on a thick cable${bank.busbar ? ' → busbar' : ''}${bank.mainDisconnect ? ' → main disconnect' : ''} → inverter.`}
          </p>

          {/* Itemised cables (item 28) — default size applies to any unlisted run. */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Itemised cables</p>
            <button type="button" disabled={cablePoints.length < 2} onClick={addCable} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50">
              <Plus className="h-3 w-3" /> Add cable
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mb-1.5">The {bank.cableSizeMm2}mm² default above applies to any run not itemised here. List a run to override its size / material / parallel runs.</p>
          {cables.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">No itemised cables — every run uses the {bank.cableSizeMm2}mm² default.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {cables.map((c, i) => (
                <div key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/70 bg-muted/20 p-2 text-xs">
                  <Cable className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <select value={c.fromRef} onChange={(e) => updateCable(c.id, { fromRef: e.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {cablePoints.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <span className="text-muted-foreground">↔</span>
                  <select value={c.toRef} onChange={(e) => updateCable(c.id, { toRef: e.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {cablePoints.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <select value={c.sizeMm2} onChange={(e) => updateCable(c.id, { sizeMm2: e.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {cableSizes.map((s) => <option key={s} value={String(s)}>{s}mm²</option>)}
                  </select>
                  <select value={c.material} onChange={(e) => updateCable(c.id, { material: e.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {CABLE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    ×
                    <input type="number" min={1} value={c.runs} onChange={(e) => updateCable(c.id, { runs: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className="h-7 w-12 rounded border border-border bg-background px-1.5 text-[11px]" />
                  </label>
                  <div className="ml-auto flex items-center gap-1.5">
                    <ReorderButtons index={i} count={cables.length} onMove={moveCable} />
                    <button type="button" onClick={() => removeCable(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>)}
        </div>
      )}
    </SectionCard>
  )
}
