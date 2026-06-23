'use client'

import { Plus, Trash2, Sun } from 'lucide-react'
import { PSH_GAUTENG, SYSTEM_EFFICIENCY } from '@/lib/solar/quote-calculator'
import { panelGroupKwp } from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { SectionCard, EmptyHint } from '../section-ui'

export function PanelsSection() {
  const { design, dispatch } = useDesign()
  const { items, loading } = useCatalog()
  const panels = byCategory(items, 'panel')

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
          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
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
            return (
              <div key={g.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sun className="h-3.5 w-3.5 text-orange-500" />
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
                    <select
                      value={g.catalogId ?? ''}
                      disabled={loading}
                      onChange={(ev) => {
                        const item = panels.find((p) => p.id === ev.target.value)
                        dispatch({
                          type: 'updatePanelGroup',
                          id: g.id,
                          patch: item
                            ? { catalogId: item.id, panelModel: item.description, panelWatts: item.watts_dc ?? g.panelWatts }
                            : { catalogId: null },
                        })
                      }}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    >
                      <option value="">Custom / unspecified</option>
                      {panels.map((p) => (
                        <option key={p.id} value={p.id}>{p.description}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Watts/panel</span>
                    <input
                      type="number" min={0} step={5}
                      value={g.panelWatts || ''}
                      onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { panelWatts: Number(ev.target.value) || 0 } })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    />
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
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><strong className="text-foreground">{kwp.toFixed(2)}</strong> kWp</span>
                  <span>≈ <strong className="text-foreground">{dailyKwh.toFixed(1)}</strong> kWh/day</span>
                  <details className="ml-auto">
                    <summary className="cursor-pointer hover:text-foreground">Roof (optional)</summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Azimuth°</span>
                        <input
                          type="number" placeholder="e.g. 0 = N"
                          value={g.azimuth ?? ''}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { azimuth: ev.target.value === '' ? null : Number(ev.target.value) } })}
                          className="h-8 w-24 rounded border border-border bg-background px-1.5 text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Pitch°</span>
                        <input
                          type="number" placeholder="e.g. 15"
                          value={g.pitch ?? ''}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { pitch: ev.target.value === '' ? null : Number(ev.target.value) } })}
                          className="h-8 w-24 rounded border border-border bg-background px-1.5 text-xs"
                        />
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
