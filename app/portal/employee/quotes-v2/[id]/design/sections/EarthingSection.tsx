'use client'

import { Plus, Trash2, Zap } from 'lucide-react'
import {
  designInverterKw, mkId, EARTH_SIZES,
  type EarthConductor, type EarthElectrode, type EarthBar, type EarthKind,
} from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { SectionCard, NumberField } from '../section-ui'

// ≤3kW → 2, 4–5kW → 4, 6kW+ → 6 (confirmed on site by soil-resistivity test).
function suggestedSpikes(kw: number): number {
  if (kw <= 0) return 2
  if (kw <= 3) return 2
  if (kw <= 5) return 4
  return 6
}

export function EarthingSection() {
  const { design, dispatch } = useDesign()
  const e = design.earthing
  const kw = designInverterKw(design)

  // Connectable earth points: equipment + bars + electrodes.
  const points: Array<{ id: string; label: string }> = [
    { id: 'inverter', label: 'Inverter' },
    { id: 'db', label: 'Distribution board' },
    ...(design.dcCombiners.length ? [{ id: 'combiner', label: 'DC combiner' }] : []),
    ...(design.batteries.length ? [{ id: 'battery', label: 'Battery bank' }] : []),
    { id: 'grid', label: 'Grid supply' },
    ...design.panels.map((_, i) => ({ id: `panel-${i}`, label: `String ${i + 1}` })),
    ...e.bars.map((b) => ({ id: b.id, label: `▣ ${b.label}` })),
    ...e.electrodes.map((el) => ({ id: el.id, label: `⏚ ${el.label}` })),
  ]

  const setElectrodes = (electrodes: EarthElectrode[]) => dispatch({ type: 'setEarthing', patch: { electrodes } })
  const setBars = (bars: EarthBar[]) => dispatch({ type: 'setEarthing', patch: { bars } })
  const setConductors = (conductors: EarthConductor[]) => dispatch({ type: 'setEarthing', patch: { conductors } })

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Earthing & bonding"
        subtitle="Almost everything with a metal casing must be earthed. Build the earth map below — it shows as the Earth layer on the diagram (toggle it with the layer pills)."
      >
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <NumberField label="Default spikes" value={e.spikeCount} placeholder={String(suggestedSpikes(kw))} onChange={(v) => dispatch({ type: 'setEarthing', patch: { spikeCount: v } })} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Default conductor</span>
            <input value={e.spec} onChange={(ev) => dispatch({ type: 'setEarthing', patch: { spec: ev.target.value } })} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Suggested {suggestedSpikes(kw)} spikes for a {kw.toFixed(1)}kW system — final count confirmed on site.</p>
      </SectionCard>

      {/* Electrodes */}
      <SectionCard
        title="Earth electrodes (spikes)"
        action={
          <button type="button" onClick={() => setElectrodes([...e.electrodes, { id: mkId('el'), label: `Earth spike ${e.electrodes.length + 1}`, spikeCount: suggestedSpikes(kw) }])} className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> Add electrode
          </button>
        }
      >
        {e.electrodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dedicated electrodes yet — add one (e.g. the panel-array earth spike).</p>
        ) : (
          <div className="flex flex-col gap-2">
            {e.electrodes.map((el) => (
              <div key={el.id} className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-lime-600 shrink-0" />
                <input value={el.label} onChange={(ev) => setElectrodes(e.electrodes.map((x) => x.id === el.id ? { ...x, label: ev.target.value } : x))} className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs" />
                <input type="number" min={0} value={el.spikeCount} onChange={(ev) => setElectrodes(e.electrodes.map((x) => x.id === el.id ? { ...x, spikeCount: Math.max(0, Math.round(Number(ev.target.value) || 0)) } : x))} className="h-8 w-20 rounded border border-border bg-background px-2 text-xs" title="spikes" />
                <span className="text-[11px] text-muted-foreground">spikes</span>
                <button type="button" onClick={() => setElectrodes(e.electrodes.filter((x) => x.id !== el.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Earth bars */}
      <SectionCard
        title="Earth bars / busbars"
        action={
          <button type="button" onClick={() => setBars([...e.bars, { id: mkId('bar'), label: `Earth bar ${e.bars.length + 1}` }])} className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> Add bar
          </button>
        }
      >
        {e.bars.length === 0 ? (
          <p className="text-xs text-muted-foreground">No earth bars yet — add the panel-array bar and the main/DB bar.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {e.bars.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="text-lime-600">▣</span>
                <input value={b.label} onChange={(ev) => setBars(e.bars.map((x) => x.id === b.id ? { ...x, label: ev.target.value } : x))} className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs" />
                <button type="button" onClick={() => setBars(e.bars.filter((x) => x.id !== b.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Conductors */}
      <SectionCard
        title="Earth conductors"
        subtitle="Each sized run, tagged earthing (to electrode) or bonding (metal-to-metal). e.g. 16mm² grid→inverter, 6mm² panel-bar→DB."
        action={
          <button
            type="button"
            disabled={points.length < 2}
            onClick={() => setConductors([...e.conductors, { id: mkId('ec'), fromId: points[0].id, toId: points[1].id, sizeMm2: 16, kind: 'earthing' }])}
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add run
          </button>
        }
      >
        {e.conductors.length === 0 ? (
          <p className="text-xs text-muted-foreground">No earth runs yet. Add electrodes/bars above, then connect them.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {e.conductors.map((c) => {
              const upd = (patch: Partial<EarthConductor>) => setConductors(e.conductors.map((x) => x.id === c.id ? { ...x, ...patch } : x))
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/70 bg-muted/20 p-2 text-xs">
                  <select value={c.fromId} onChange={(ev) => upd({ fromId: ev.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {points.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <span className="text-muted-foreground">→</span>
                  <select value={c.toId} onChange={(ev) => upd({ toId: ev.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {points.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <select value={c.sizeMm2} onChange={(ev) => upd({ sizeMm2: Number(ev.target.value) })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {EARTH_SIZES.map((s) => <option key={s} value={s}>{s}mm²</option>)}
                  </select>
                  <select value={c.kind} onChange={(ev) => upd({ kind: ev.target.value as EarthKind })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    <option value="earthing">Earthing</option>
                    <option value="bonding">Bonding</option>
                  </select>
                  <button type="button" onClick={() => setConductors(e.conductors.filter((x) => x.id !== c.id))} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
