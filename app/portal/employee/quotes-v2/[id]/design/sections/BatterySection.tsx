'use client'

import { useMemo } from 'react'
import { BatteryCharging } from 'lucide-react'
import { evaluateBatteryForInverter, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { computeBalance, designBatteryKwh } from '@/lib/solar/system-design'
import { CompatSelect } from '@/components/ui/CompatSelect'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { SectionCard } from '../section-ui'

export function BatterySection() {
  const { design, dispatch, record } = useDesign()
  const { items, loading } = useCatalog()

  const inverterItem: EquipmentCatalogItem | null =
    byCategory(items, 'inverter').find((i) => i.id === design.inverters[0]?.catalogId) ?? null

  const candidates = useMemo(
    () => byCategory(items, 'battery').map((item) => ({ item, compat: evaluateBatteryForInverter(inverterItem, item) })),
    [items, inverterItem],
  )

  const unit = design.batteries[0]
  const balance = useMemo(() => computeBalance(design, record), [design, record])
  const batteryKwh = designBatteryKwh(design)

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
          <span><strong className="text-foreground">{balance.storageHours.toFixed(1)}</strong> hrs at backup load</span>
        )}
        {balance.storageHours == null && batteryKwh > 0 && (
          <span>Set an essential load or usage in Energy to see hours of storage.</span>
        )}
      </div>
    </SectionCard>
  )
}
