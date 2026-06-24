'use client'

import { useMemo } from 'react'
import { BatteryCharging, Gauge } from 'lucide-react'
import { evaluateBatteryForInverter, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import {
  computeBalance, designBatteryKwh, designInverterKw,
  batteryCRate, batteryDcCurrent, cableRunsNeeded, DC_CABLE_AMPACITY,
  type CRateLevel, type BatteryBank,
} from '@/lib/solar/system-design'
import { CompatSelect } from '@/components/ui/CompatSelect'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
import { SectionCard } from '../section-ui'

const CRATE_STYLE: Record<CRateLevel, string> = {
  ideal: 'border-emerald-600/50 bg-emerald-50 text-emerald-800',
  good: 'border-green-400/60 bg-green-50 text-green-700',
  warn: 'border-amber-300 bg-amber-50 text-amber-800',
  block: 'border-destructive/40 bg-destructive/5 text-destructive',
}

export function BatterySection() {
  const { design, dispatch, record } = useDesign()
  const { items, loading } = useCatalog()

  const inverterItem: EquipmentCatalogItem | null =
    byCategory(items, 'inverter').find((i) => i.id === design.inverters[0]?.catalogId) ?? null

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
  // Worst-case: size off the discharge-cutoff voltage, not nominal.
  const dcCurrent = batteryDcCurrent(inverterKw, bank.cutoffVoltage)
  const cableRuns = cableRunsNeeded(dcCurrent, bank.cableSizeMm2)
  const cableSizes = Object.keys(DC_CABLE_AMPACITY).map(Number)
  // Derived: feeds = installed inverter count; whole house if no backup load is set.
  const inverterFeeds = design.inverters.reduce((s, u) => s + u.qty, 0) || 1
  const hasBackup = (design.energy.essentialLoadKw ?? 0) > 0
  function setBank(patch: Partial<BatteryBank>) { dispatch({ type: 'setBank', patch }) }

  function pick(id: string) {
    const item = candidates.find((c) => c.item.id === id)?.item
    if (!item) { dispatch({ type: 'removeBattery' }); return }
    dispatch({
      type: 'setBattery',
      battery: { catalogId: item.id, model: item.description, kwh: item.kwh ?? 0 },
    })
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
          <span className="text-xs font-medium text-muted-foreground">Modules</span>
          <input
            type="number" min={1} step={1}
            value={unit?.qty ?? 1}
            disabled={!unit}
            onChange={(ev) => dispatch({ type: 'updateBattery', patch: { qty: Math.max(1, Math.round(Number(ev.target.value) || 1)) } })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BatteryCharging className="h-3.5 w-3.5 text-green-600" />
          <strong className="text-foreground">{batteryKwh.toFixed(1)}</strong> kWh total
        </span>
        {balance.storageHours != null && (
          <span><strong className="text-foreground">{balance.storageHours.toFixed(1)}</strong> hrs at {hasBackup ? 'backup load' : 'full house load'}</span>
        )}
        {balance.storageHours == null && batteryKwh > 0 && (
          <span>Set an essential load or usage in Energy to see hours of storage.</span>
        )}
      </div>

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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Bank wiring</p>
          <p className="text-xs text-muted-foreground mb-2.5">
            <strong className="text-foreground">{bank.voltageClass}</strong> · {bank.nominalVoltage}V nominal ·{' '}
            <strong className="text-foreground">{inverterFeeds}</strong> inverter feed{inverterFeeds === 1 ? '' : 's'}
            <span className="opacity-70"> — derived from the inverter + batteries</span>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Cable size</span>
              <select value={bank.cableSizeMm2} onChange={(e) => setBank({ cableSizeMm2: Number(e.target.value) })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                {cableSizes.map((s) => <option key={s} value={s}>{s}mm² (≈{DC_CABLE_AMPACITY[s]}A)</option>)}
              </select>
            </label>
            <ProductPicker items={items} category="cable" label="Cable product" value={bank.cableProductId} onChange={(v) => setBank({ cableProductId: v })} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Worst-case cutoff V</span>
              <input type="number" min={0} step={0.1} value={bank.cutoffVoltage} onChange={(e) => setBank({ cutoffVoltage: Number(e.target.value) || 0 })} className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
            </label>
          </div>

          {/* Disconnect / busbar builder — inverter → main disconnect → busbar → per-battery */}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1.5">Disconnects &amp; busbar</p>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={bank.mainDisconnect} onChange={(e) => setBank({ mainDisconnect: e.target.checked })} className="accent-primary" />
                <span className="text-xs">Main disconnect (bank → inverter)</span>
              </label>
              {bank.mainDisconnect && (
                <ProductPicker items={items} category="disconnect" value={bank.mainDisconnectId} onChange={(v) => setBank({ mainDisconnectId: v })} className="min-w-[180px]" />
              )}
            </div>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={bank.busbar} onChange={(e) => setBank({ busbar: e.target.checked })} className="accent-primary" />
              <span className="text-xs">Busbar</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={bank.perBatteryDisconnect} onChange={(e) => setBank({ perBatteryDisconnect: e.target.checked })} className="accent-primary" />
                <span className="text-xs">A disconnect per battery</span>
              </label>
              {bank.perBatteryDisconnect && (
                <ProductPicker items={items} category="disconnect" value={bank.perBatteryDisconnectId} onChange={(v) => setBank({ perBatteryDisconnectId: v })} className="min-w-[180px]" />
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {bank.perBatteryDisconnect
              ? `Each of the ${unit?.qty ?? 1} batteries → its own disconnect → ${bank.busbar ? 'busbar → ' : ''}${bank.mainDisconnect ? 'main disconnect → ' : ''}inverter.`
              : `Batteries paralleled on a thick cable${bank.busbar ? ' → busbar' : ''}${bank.mainDisconnect ? ' → main disconnect' : ''} → inverter.`}
          </p>
        </div>
      )}
    </SectionCard>
  )
}
