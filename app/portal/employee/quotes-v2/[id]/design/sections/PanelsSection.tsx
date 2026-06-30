'use client'

import { Plus, Trash2, Sun, Zap } from 'lucide-react'
import { PSH_GAUTENG, SYSTEM_EFFICIENCY, parseInverterSizingSpec } from '@/lib/solar/quote-calculator'
import { VOC_COLD_FACTOR, EDGE_OF_CLOUD_FACTOR } from '@/lib/solar/compliance'
import { panelGroupKwp, DIRECTIONS, ROOF_TYPES } from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { SectionCard, EmptyHint, LockNote, LOCKED_FIELD, SearchableSelect } from '../section-ui'

export function PanelsSection() {
  const { design, dispatch } = useDesign()
  const { items, loading } = useCatalog()
  const panels = byCategory(items, 'panel')

  // Inverter max DC input voltage — the ceiling the worst-case string Voc is checked
  // against. Pulled from the selected inverter's notes (same source the compliance
  // engine uses); null when no inverter is set or its notes lack the spec.
  const inverterCatalogId = design.inverters[0]?.catalogId
  const inverterItem = inverterCatalogId ? items.find((i) => i.id === inverterCatalogId) : undefined
  const maxDcVoltage = parseInverterSizingSpec(inverterItem?.notes)?.maxDcVoltage ?? null

  function addGroup() {
    const first = panels[0]
    dispatch({
      type: 'addPanelGroup',
      group: first
        ? { panelModel: first.description, panelWatts: first.watts_dc ?? 0, catalogId: first.id, panelCount: 0 }
        : undefined,
    })
  }

  return (
    <SectionCard
      title="Panels"
      subtitle="Add panel groups — each becomes a string on the diagram and feeds the live generation figure."
      action={
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add group
        </button>
      }
    >
      {design.panels.length === 0 ? (
        <EmptyHint>No panels yet. Add a group to start sizing the array.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          {design.panels.map((g, idx) => {
            const kwp = panelGroupKwp(g)
            const dailyKwh = kwp * PSH_GAUTENG * SYSTEM_EFFICIENCY
            // Catalog panel selected → its watts come from the product (item 24).
            const locked = !!g.catalogId

            // Worst-case string voltage: every panel in the group in series, lifted for
            // a cold morning (−10 °C, ×1.10) then the edge-of-cloud overshoot (×1.20) —
            // the exact value the compliance engine checks against the inverter's max DC
            // input. Needs the panel's datasheet Voc; blank for custom/spec-less panels.
            const selectedPanel = g.catalogId ? panels.find((p) => p.id === g.catalogId) : undefined
            const panelVoc = selectedPanel?.voc_volts != null ? Number(selectedPanel.voc_volts) : null
            const series = g.panelCount || 0
            const coldVoc = panelVoc && series > 0 ? panelVoc * series * VOC_COLD_FACTOR : null
            const worstCaseVoc = coldVoc != null ? coldVoc * EDGE_OF_CLOUD_FACTOR : null
            const overLimit = worstCaseVoc != null && maxDcVoltage != null && worstCaseVoc > maxDcVoltage
            return (
              <div key={g.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sun className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
                    {design.panels.length > 1 ? `String ${idx + 1}` : 'Solar array'}
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'removePanelGroup', id: g.id })}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove group"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Panel</span>
                    <SearchableSelect
                      value={g.catalogId}
                      noneLabel="Custom / unspecified"
                      placeholder={loading ? 'Loading…' : 'Custom / unspecified'}
                      options={panels.map((p) => ({ value: p.id, label: p.description }))}
                      onChange={(v) => {
                        const item = v == null ? undefined : panels.find((p) => p.id === v)
                        dispatch({
                          type: 'updatePanelGroup',
                          id: g.id,
                          patch: item
                            ? { catalogId: item.id, panelModel: item.description, panelWatts: item.watts_dc ?? g.panelWatts }
                            : { catalogId: null },
                        })
                      }}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Watts/panel</span>
                    <input
                      type="number" min={0} step={5}
                      value={g.panelWatts || ''}
                      disabled={locked}
                      onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { panelWatts: Number(ev.target.value) || 0 } })}
                      className={`h-9 rounded-md border border-border bg-background px-2 text-sm ${LOCKED_FIELD}`}
                    />
                    {locked && <LockNote>Watts come from the catalog panel</LockNote>}
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Count</span>
                    <input
                      type="number" min={0} step={1}
                      value={g.panelCount || ''}
                      onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { panelCount: Math.max(0, Math.round(Number(ev.target.value) || 0)) } })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </label>

                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Direction</span>
                    <select
                      value={g.azimuth ?? ''}
                      onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { azimuth: ev.target.value === '' ? null : Number(ev.target.value) } })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    >
                      <option value="">— not set —</option>
                      {DIRECTIONS.map((d) => (
                        <option key={d.label} value={d.azimuth}>{d.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><strong className="text-foreground">{kwp.toFixed(2)}</strong> kWp</span>
                  <span>≈ <strong className="text-foreground">{dailyKwh.toFixed(1)}</strong> kWh/day</span>
                  {worstCaseVoc != null ? (
                    <span
                      className={`inline-flex items-center gap-1 ${overLimit ? 'font-semibold text-destructive' : ''}`}
                      title={`Worst case = ${series} panels in series × ${panelVoc}V Voc × ${VOC_COLD_FACTOR} (cold morning, −10 °C) × ${EDGE_OF_CLOUD_FACTOR} (edge-of-cloud overshoot). Cold Voc alone ≈ ${Math.round(coldVoc!)}V.${maxDcVoltage != null ? ` Inverter max DC input = ${maxDcVoltage}V.` : ' No inverter max DC voltage set — pick an inverter to check against.'}`}
                    >
                      <Zap className="h-3 w-3" />
                      Worst-case Voc ≈{' '}
                      <strong className={overLimit ? 'text-destructive' : 'text-foreground'}>{Math.round(worstCaseVoc)}</strong> V
                      {overLimit && maxDcVoltage != null && <> &gt; {maxDcVoltage}V max — shorten string</>}
                    </span>
                  ) : g.catalogId && series > 0 ? (
                    <span className="italic">Worst-case Voc — add datasheet Voc to this panel in the catalog</span>
                  ) : null}
                  <details className="ml-auto">
                    <summary className="cursor-pointer hover:text-foreground">More (optional)</summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Tilt°</span>
                        <input
                          type="number" placeholder="e.g. 15"
                          value={g.pitch ?? ''}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { pitch: ev.target.value === '' ? null : Number(ev.target.value) } })}
                          className="h-8 w-28 rounded border border-border bg-background px-1.5 text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Roof type</span>
                        <select
                          value={g.roofType}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { roofType: ev.target.value } })}
                          className="h-8 w-44 rounded border border-border bg-background px-1.5 text-xs"
                        >
                          <option value="">— not set —</option>
                          {ROOF_TYPES.map((rt) => (
                            <option key={rt} value={rt}>{rt}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Distance from combiner (m)</span>
                        <input
                          type="number" min={0} step={0.5} placeholder="e.g. 12"
                          value={g.distanceFromCombinerM ?? ''}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { distanceFromCombinerM: ev.target.value === '' ? undefined : Math.max(0, Number(ev.target.value) || 0) } })}
                          className="h-8 w-28 rounded border border-border bg-background px-1.5 text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Jumpers (MC4 pairs)</span>
                        <input
                          type="number" min={0} step={1} placeholder="0"
                          value={g.jumpers ?? ''}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { jumpers: ev.target.value === '' ? undefined : Math.max(0, Math.round(Number(ev.target.value) || 0)) } })}
                          className="h-8 w-28 rounded border border-border bg-background px-1.5 text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">For a string spanning two rows/roofs — adds MC4s.</span>
                      </label>
                    </div>
                  </details>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
