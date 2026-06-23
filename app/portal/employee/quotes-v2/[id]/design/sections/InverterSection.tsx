'use client'

import { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { verifyPanelString, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { designInverterKw, designTotalKwp } from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { SectionCard } from '../section-ui'

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

  function pick(id: string) {
    const item = inverters.find((i) => i.id === id)
    if (!item) { dispatch({ type: 'removeInverter' }); return }
    dispatch({
      type: 'setInverter',
      inverter: {
        catalogId: item.id,
        model: item.description,
        kw: (item.watts_ac ?? 0) / 1000,
        phases: item.phase === 'three' ? 3 : 1,
      },
    })
  }

  return (
    <SectionCard
      title="Inverter"
      subtitle={`Filtered to ${gridPhase}-phase. The string check and DC:AC ratio update as you change panels or inverter.`}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Inverter</span>
          <select
            value={unit?.catalogId ?? ''}
            disabled={loading}
            onChange={(ev) => pick(ev.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">None selected</option>
            {inverters.map((i) => (
              <option key={i.id} value={i.id}>{i.description} — {((i.watts_ac ?? 0) / 1000).toFixed(1)}kW</option>
            ))}
          </select>
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

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <strong className="text-foreground">{inverterKw.toFixed(1)}</strong> kW AC total
        </span>
        {ratio != null && (
          <span className={`rounded-full border px-2 py-0.5 font-medium ${
            ratio > 1.3 ? 'border-amber-300 bg-amber-50 text-amber-800'
              : ratio < 0.5 ? 'border-border bg-muted/40 text-muted-foreground'
              : 'border-success/40 bg-success/5 text-success'
          }`}>
            DC:AC {ratio.toFixed(2)}
          </span>
        )}
      </div>

      {stringVerdict && (
        <div className={`mt-3 rounded-md border p-3 text-sm ${
          stringVerdict.level === 'block' ? 'border-destructive/40 bg-destructive/5 text-destructive'
            : stringVerdict.level === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-800'
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
      )}
      {!stringVerdict && (
        <p className="mt-3 text-xs text-muted-foreground">
          Select an inverter, a catalog panel and a panel count to run the string check.
        </p>
      )}
    </SectionCard>
  )
}
