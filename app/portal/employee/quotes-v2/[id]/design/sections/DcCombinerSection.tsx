'use client'

import { Plus, Trash2, CircuitBoard } from 'lucide-react'
import {
  combinerConfigLabel, mkId,
  ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, ENCLOSURE_WAYS,
  type DcCombiner, type PanelGroup,
} from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { SectionCard, EmptyHint } from '../section-ui'

function stringLabel(panels: PanelGroup[], id: string): string {
  const i = panels.findIndex((p) => p.id === id)
  const g = panels[i]
  if (!g) return 'String'
  return `String ${i + 1}${g.panelCount ? ` · ${g.panelCount}×${g.panelWatts}W` : ''}`
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function DcCombinerSection() {
  const { design, dispatch } = useDesign()
  const panels = design.panels
  const combiners = design.dcCombiners

  function patch(c: DcCombiner, p: Partial<DcCombiner>) {
    dispatch({ type: 'updateCombiner', id: c.id, patch: p })
  }

  function toggleInput(c: DcCombiner, id: string) {
    const has = c.inputStringIds.includes(id)
    const inputStringIds = has ? c.inputStringIds.filter((x) => x !== id) : [...c.inputStringIds, id]
    const outputs = has ? c.outputs.map((o) => ({ ...o, stringIds: o.stringIds.filter((x) => x !== id) })) : c.outputs
    patch(c, { inputStringIds, outputs })
  }

  function setOutputCount(c: DcCombiner, n: number) {
    n = clamp(Math.round(n), 1, 4)
    let outputs = c.outputs.slice()
    while (outputs.length < n) {
      outputs.push({ id: mkId('out'), label: `Output ${outputs.length + 1}`, stringIds: outputs.length === 0 ? c.inputStringIds.slice() : [] })
    }
    if (outputs.length > n) outputs = outputs.slice(0, n)
    patch(c, { outputs })
  }

  function toggleOutputString(c: DcCombiner, outId: string, strId: string) {
    const outputs = c.outputs.map((o) =>
      o.id !== outId ? o
        : { ...o, stringIds: o.stringIds.includes(strId) ? o.stringIds.filter((x) => x !== strId) : [...o.stringIds, strId] },
    )
    patch(c, { outputs })
  }

  return (
    <SectionCard
      title="DC combiner"
      subtitle="Add a combiner enclosure, tie in the strings, set the outputs, and list what's inside. Needed once you parallel 3+ strings."
      action={
        <button
          type="button"
          onClick={() => dispatch({ type: 'addCombiner' })}
          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add combiner
        </button>
      }
    >
      {combiners.length === 0 ? (
        <EmptyHint>
          {panels.length > 1
            ? `You have ${panels.length} strings — add a combiner to parallel them safely.`
            : 'No combiner yet. Add one when you parallel multiple strings into an MPPT.'}
        </EmptyHint>
      ) : (
        <div className="flex flex-col gap-4">
          {combiners.map((c) => (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <CircuitBoard className="h-3.5 w-3.5 text-orange-500" />
                  <input
                    value={c.label}
                    onChange={(e) => patch(c, { label: e.target.value })}
                    className="bg-transparent border-b border-transparent hover:border-border focus:border-primary text-xs font-semibold focus:outline-none"
                  />
                </span>
                <button type="button" onClick={() => dispatch({ type: 'removeCombiner', id: c.id })} className="text-muted-foreground hover:text-destructive" title="Remove combiner">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Enclosure */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Enclosure</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Material</span>
                  <select value={c.material} onChange={(e) => patch(c, { material: e.target.value as DcCombiner['material'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                    {ENCLOSURE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Mount</span>
                  <select value={c.mount} onChange={(e) => patch(c, { mount: e.target.value as DcCombiner['mount'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                    {ENCLOSURE_MOUNTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Ways</span>
                  <select value={c.ways} onChange={(e) => patch(c, { ways: Number(e.target.value) })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                    {ENCLOSURE_WAYS.map((w) => <option key={w} value={w}>{w}-way</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Rows</span>
                  <input type="number" min={1} max={4} value={c.rows} onChange={(e) => patch(c, { rows: clamp(Math.round(Number(e.target.value) || 1), 1, 4) })} className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">IP rating</span>
                  <input value={c.ipRating} onChange={(e) => patch(c, { ipRating: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Product code</span>
                  <input value={c.productCode} onChange={(e) => patch(c, { productCode: e.target.value, productCodeLocked: true })} className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono" />
                </label>
              </div>

              {/* Inputs */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">Strings in</p>
              {panels.length === 0 ? (
                <p className="text-xs text-muted-foreground">Add panel groups first — then tick which strings feed this combiner.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {panels.map((g) => {
                    const on = c.inputStringIds.includes(g.id)
                    return (
                      <button key={g.id} type="button" onClick={() => toggleInput(c, g.id)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                        {stringLabel(panels, g.id)}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Outputs */}
              <div className="flex items-center gap-2 mt-4 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outputs</p>
                <input type="number" min={1} max={4} value={c.outputs.length}
                  onChange={(e) => setOutputCount(c, Number(e.target.value) || 1)}
                  className="h-7 w-14 rounded-md border border-border bg-background px-2 text-xs" />
                <span className="text-[11px] text-muted-foreground">to the inverter MPPT(s)</span>
              </div>
              {c.outputs.length > 1 && (
                <div className="flex flex-col gap-2">
                  {c.outputs.map((o, oi) => (
                    <div key={o.id} className="rounded-md border border-border/70 bg-muted/20 p-2">
                      <span className="text-[11px] font-medium text-foreground">{o.label || `Output ${oi + 1}`} — strings that combine here</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.inputStringIds.length === 0 && <span className="text-[11px] text-muted-foreground">Tick strings above first.</span>}
                        {c.inputStringIds.map((sid) => {
                          const on = o.stringIds.includes(sid)
                          return (
                            <button key={sid} type="button" onClick={() => toggleOutputString(c, o.id, sid)}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                              {stringLabel(panels, sid)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* What's inside */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">What&apos;s inside</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={c.stringFuses} onChange={(e) => patch(c, { stringFuses: e.target.checked })} className="accent-primary" />
                  <span className="text-xs">String fuses</span>
                  {c.stringFuses && (
                    <input value={c.fuseRating} onChange={(e) => patch(c, { fuseRating: e.target.value })} placeholder="15A gPV" className="h-7 w-24 rounded border border-border bg-background px-1.5 text-[11px]" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={c.hasSpd} onChange={(e) => patch(c, { hasSpd: e.target.checked })} className="accent-primary" />
                  <span className="text-xs">DC SPD</span>
                  {c.hasSpd && (
                    <input value={c.spdType} onChange={(e) => patch(c, { spdType: e.target.value })} placeholder="Type 2" className="h-7 w-24 rounded border border-border bg-background px-1.5 text-[11px]" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={c.hasIsolator} onChange={(e) => patch(c, { hasIsolator: e.target.checked })} className="accent-primary" />
                  <span className="text-xs">DC isolator</span>
                  {c.hasIsolator && (
                    <input value={c.isolatorRating} onChange={(e) => patch(c, { isolatorRating: e.target.value })} placeholder="1000V DC 25A" className="h-7 w-32 rounded border border-border bg-background px-1.5 text-[11px]" />
                  )}
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-xs whitespace-nowrap">Main breaker</span>
                  <input value={c.mainBreaker} onChange={(e) => patch(c, { mainBreaker: e.target.value })} placeholder="optional" className="h-7 flex-1 rounded border border-border bg-background px-1.5 text-[11px]" />
                </label>
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">{combinerConfigLabel(c)} · {c.productCode}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
