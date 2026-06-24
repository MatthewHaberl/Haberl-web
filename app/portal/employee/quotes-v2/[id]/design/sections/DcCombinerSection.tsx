'use client'

import { Plus, Trash2, CircuitBoard } from 'lucide-react'
import {
  combinerConfigLabel, mkId, parseEnclosureSpec, defaultStringConnection,
  ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, ENCLOSURE_WAYS,
  type DcCombiner, type PanelGroup, type StringConnection,
} from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
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
  const { items } = useCatalog()
  const panels = design.panels
  const combiners = design.dcCombiners
  const enclosures = byCategory(items, 'enclosure')

  function patch(c: DcCombiner, p: Partial<DcCombiner>) {
    dispatch({ type: 'updateCombiner', id: c.id, patch: p })
  }

  // Pick a specific DB from the catalog → populate the enclosure fields from it.
  function pickEnclosure(c: DcCombiner, id: string) {
    const item = enclosures.find((x) => x.id === id)
    if (!item) { patch(c, { enclosureCatalogId: null }); return }
    const spec = parseEnclosureSpec(item.notes)
    patch(c, {
      enclosureCatalogId: item.id,
      productCode: item.sku,
      productCodeLocked: true,
      ...(spec ? { material: spec.material, mount: spec.mount, ways: spec.ways, rows: spec.rows, ipRating: spec.ip } : {}),
    })
  }

  function toggleInput(c: DcCombiner, id: string) {
    const has = c.inputStringIds.includes(id)
    const inputStringIds = has ? c.inputStringIds.filter((x) => x !== id) : [...c.inputStringIds, id]
    let outputs = c.outputs
    if (has) outputs = c.outputs.map((o) => ({ ...o, stringIds: o.stringIds.filter((x) => x !== id) }))
    else if (c.outputs.length === 1) outputs = c.outputs.map((o, i) => i === 0 ? { ...o, stringIds: [...o.stringIds, id] } : o)
    patch(c, { inputStringIds, outputs })
  }

  function setOutputCount(c: DcCombiner, n: number) {
    n = clamp(Math.round(n), 1, 4)
    let outputs = c.outputs.slice()
    while (outputs.length < n) {
      outputs.push({ id: mkId('out'), label: `Output ${outputs.length + 1}`, stringIds: outputs.length === 0 ? c.inputStringIds.slice() : [], spdId: null, mainBreakerId: null })
    }
    if (outputs.length > n) outputs = outputs.slice(0, n)
    patch(c, { outputs })
  }

  function setOutput(c: DcCombiner, outId: string, p: Partial<DcCombiner['outputs'][number]>) {
    patch(c, { outputs: c.outputs.map((o) => o.id === outId ? { ...o, ...p } : o) })
  }

  function toggleOutputString(c: DcCombiner, outId: string, strId: string) {
    const outputs = c.outputs.map((o) =>
      o.id !== outId ? o
        : { ...o, stringIds: o.stringIds.includes(strId) ? o.stringIds.filter((x) => x !== strId) : [...o.stringIds, strId] },
    )
    patch(c, { outputs })
  }

  const conn = (c: DcCombiner, sid: string): StringConnection => c.stringConnections[sid] ?? defaultStringConnection()
  function setStringConn(c: DcCombiner, sid: string, p: Partial<StringConnection>) {
    patch(c, { stringConnections: { ...c.stringConnections, [sid]: { ...conn(c, sid), ...p } } })
  }

  return (
    <SectionCard
      title="DC combiner"
      subtitle="Add a DB/combiner, tie in the strings, set the outputs, and list what's inside."
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
          No combiner yet. Add one to give the array its DC disconnect and protection.
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
              <label className="flex flex-col gap-1 mb-2.5">
                <span className="text-[11px] text-muted-foreground">DB product (from catalog)</span>
                <select
                  value={c.enclosureCatalogId ?? ''}
                  onChange={(ev) => pickEnclosure(c, ev.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="">Custom / manual</option>
                  {enclosures.map((x) => <option key={x.id} value={x.id}>{x.description} ({x.sku})</option>)}
                </select>
                <span className="text-[10px] text-muted-foreground">Pick one to auto-fill the fields below, or set them manually.</span>
              </label>
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

              {/* Outputs — each output carries its strings + their connection products */}
              <div className="flex items-center gap-2 mt-4 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outputs</p>
                <input type="number" min={1} max={4} value={c.outputs.length}
                  onChange={(e) => setOutputCount(c, Number(e.target.value) || 1)}
                  className="h-7 w-14 rounded-md border border-border bg-background px-2 text-xs" />
                <span className="text-[11px] text-muted-foreground">to the inverter MPPT(s)</span>
              </div>

              <div className="flex flex-col gap-2.5">
                {c.outputs.map((o, oi) => (
                  <div key={o.id} className="rounded-md border border-border/70 bg-muted/20 p-2.5">
                    <span className="text-[11px] font-semibold text-foreground">{o.label || `Output ${oi + 1}`}</span>

                    {c.outputs.length > 1 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.inputStringIds.length === 0 && <span className="text-[11px] text-muted-foreground">Tick strings above first.</span>}
                        {c.inputStringIds.map((sid) => {
                          const on = o.stringIds.includes(sid)
                          const elsewhere = !on && c.outputs.some((oo) => oo.id !== o.id && oo.stringIds.includes(sid))
                          return (
                            <button key={sid} type="button" disabled={elsewhere}
                              onClick={() => { if (!elsewhere) toggleOutputString(c, o.id, sid) }}
                              title={elsewhere ? 'Already combined in another output' : undefined}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                on ? 'border-primary bg-primary/10 text-primary'
                                  : elsewhere ? 'border-border/40 text-muted-foreground/40 line-through cursor-not-allowed'
                                  : 'border-border text-muted-foreground hover:border-primary/40'
                              }`}>
                              {stringLabel(panels, sid)}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* per-string connection products */}
                    {o.stringIds.length === 0 ? (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">No strings on this output yet.</p>
                    ) : (
                      <div className="mt-2 flex flex-col gap-2">
                        {o.stringIds.map((sid) => {
                          const k = conn(c, sid)
                          return (
                            <div key={sid} className="rounded border border-border/60 bg-background p-2">
                              <span className="text-[10px] font-medium text-foreground">{stringLabel(panels, sid)}</span>
                              <div className="mt-1 grid grid-cols-2 md:grid-cols-5 gap-1.5">
                                <ProductPicker items={items} category="breaker" label="Breaker" value={k.breakerId} onChange={(v) => setStringConn(c, sid, { breakerId: v })} />
                                <ProductPicker items={items} category="fuseholder" label="Fuse holder" value={k.fuseHolderId} onChange={(v) => setStringConn(c, sid, { fuseHolderId: v })} />
                                <ProductPicker items={items} category="fuse" label="Fuse" value={k.fuseId} onChange={(v) => setStringConn(c, sid, { fuseId: v })} />
                                <label className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-muted-foreground">Fuse qty</span>
                                  <input type="number" min={0} value={k.fuseQty} onChange={(e) => setStringConn(c, sid, { fuseQty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]" />
                                </label>
                                <ProductPicker items={items} category="isolator" label="Isolator" value={k.isolatorId} onChange={(v) => setStringConn(c, sid, { isolatorId: v })} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* output-level protection */}
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <ProductPicker items={items} category="spd" label="SPD (output)" value={o.spdId} onChange={(v) => setOutput(c, o.id, { spdId: v })} />
                      {o.stringIds.length > 1 && (
                        <ProductPicker items={items} category="breaker" label="Main breaker (combine)" value={o.mainBreakerId} onChange={(v) => setOutput(c, o.id, { mainBreakerId: v })} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">{combinerConfigLabel(c)} · {c.productCode}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
