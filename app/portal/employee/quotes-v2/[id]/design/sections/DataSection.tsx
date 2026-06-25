'use client'

import { Plus, Trash2, Cable } from 'lucide-react'
import {
  type DataLink, type DataCableType, type DataTermination,
} from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { SectionCard, ReorderButtons } from '../section-ui'

const CABLE_TYPES: DataCableType[] = ['Cat5e', 'Cat6', 'Cat7']

// Comms protocols spoken over the link (free metadata — matches the research brief).
const PROTOCOLS: Array<{ value: string; label: string }> = [
  { value: '', label: '— protocol —' },
  { value: 'rs485', label: 'RS485' },
  { value: 'can', label: 'CAN' },
  { value: 'modbus', label: 'Modbus' },
  { value: 'ethernet', label: 'Ethernet' },
  { value: 've-can', label: 'VE.Can' },
  { value: 've-direct', label: 'VE.Direct' },
]

export function DataSection() {
  const { design, dispatch } = useDesign()
  const links = design.data?.links ?? []

  // Connectable comms endpoints: equipment + battery BMS + monitoring devices.
  const points: Array<{ id: string; label: string }> = [
    { id: 'inverter', label: 'Inverter' },
    { id: 'db', label: 'Distribution board' },
    ...(design.dcCombiners.length ? [{ id: 'combiner', label: 'DC combiner' }] : []),
    ...(design.batteries.length ? [{ id: 'battery', label: 'Battery / BMS' }] : []),
    { id: 'grid', label: 'Grid / meter' },
    ...(design.monitoring ?? []).map((m) => ({ id: m.id, label: `◉ ${m.label}` })),
  ]

  return (
    <SectionCard
      title="Data & comms cabling"
      subtitle="Each comms run from→to, with cable type, termination and protocol. Shows as the Data layer on the diagram (toggle it with the layer pills)."
      action={
        <button
          type="button"
          disabled={points.length < 2}
          onClick={() => dispatch({ type: 'addDataLink', link: { fromId: points[0].id, toId: points[1].id } })}
          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add link
        </button>
      }
    >
      {links.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          No data links yet. Add a monitoring device above, then wire it to the inverter / battery BMS — e.g. RS485 inverter→battery, Cat6 gateway→router.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {links.map((l, i) => {
            const upd = (patch: Partial<DataLink>) => dispatch({ type: 'updateDataLink', id: l.id, patch })
            return (
              <div key={l.id} className="rounded-md border border-border/70 bg-muted/20 p-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Cable className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400 shrink-0" />
                  <select value={l.fromId} onChange={(e) => upd({ fromId: e.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {points.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <span className="text-muted-foreground">→</span>
                  <select value={l.toId} onChange={(e) => upd({ toId: e.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {points.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <select value={l.cableType} onChange={(e) => upd({ cableType: e.target.value as DataCableType })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {CABLE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={l.termination} onChange={(e) => upd({ termination: e.target.value as DataTermination })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    <option value="crimp">Crimped (RJ45)</option>
                    <option value="loose">Loose ends</option>
                  </select>
                  <select value={l.protocol} onChange={(e) => upd({ protocol: e.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                    {PROTOCOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <ReorderButtons index={i} count={links.length} onMove={(from, to) => dispatch({ type: 'reorderDataLink', from, to })} />
                  <button type="button" onClick={() => dispatch({ type: 'removeDataLink', id: l.id })} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <input
                  value={l.note}
                  onChange={(e) => upd({ note: e.target.value })}
                  placeholder="Note / explanation (optional) — e.g. shielded RS485, daisy-chain to 2nd battery"
                  className="mt-1.5 h-7 w-full rounded border border-border bg-background px-2 text-[11px]"
                />
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
