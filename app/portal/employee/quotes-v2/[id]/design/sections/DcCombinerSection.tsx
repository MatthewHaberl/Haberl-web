'use client'

import { useState } from 'react'
import { Plus, Trash2, CircuitBoard, CornerDownRight, Pencil, ChevronDown } from 'lucide-react'
import {
  combinerConfigLabel, mkId, parseEnclosureSpec, enumerateStrings,
  ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, ENCLOSURE_WAYS,
  DB_COMPONENT_KINDS, dbComponentKind, DB_SUPPLY_ID, DB_SUPPLY_LABEL,
  type DcCombiner, type DcComponent, type DbComponentKind,
} from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
import { SectionCard, EmptyHint, LockNote, LOCKED_FIELD, ReorderButtons, CollapsibleCard } from '../section-ui'

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function DcCombinerSection() {
  const { design, dispatch } = useDesign()
  const { items } = useCatalog()
  const combiners = design.dcCombiners
  const enclosures = byCategory(items, 'enclosure')
  // Every individual string (`${groupId}#k`) — the combiner ties in each one on its own.
  const strings = enumerateStrings(design)
  const stringById = new Map(strings.map((s) => [s.id, s]))
  const strLabel = (id: string) => { const s = stringById.get(id); return s ? `String ${s.seq}` : 'String' }
  // Strings grouped by their panel card, for the "Strings in" picker.
  const stringGroups = design.panels
    .filter((g) => g.panelCount > 0)
    .map((g) => ({ g, list: strings.filter((s) => s.groupId === g.id) }))
    .filter((x) => x.list.length > 0)
  // Enclosure detail (material / mount / ways …) is collapsed by default — the DB
  // product line is enough; click "Edit" to reveal the rest.
  const [editEnc, setEditEnc] = useState<Record<string, boolean>>({})

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
    // One output per string is the physical ceiling; keep a floor of 4.
    n = clamp(Math.round(n), 1, Math.max(4, c.inputStringIds.length))
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

  // ── Inside: component list (item 44 — mirrors AcCombiner) ──────────────────────
  // Each device is fed from the strings on this combiner, the incoming supply, or
  // another device. Default EMPTY — protection is left out until the user adds it.
  function addComponent(c: DcCombiner) {
    dispatch({ type: 'addDcComponent', combinerId: c.id, kind: 'breaker' })
  }
  function updateComponent(c: DcCombiner, componentId: string, p: Partial<DcComponent>) {
    dispatch({ type: 'updateDcComponent', combinerId: c.id, componentId, patch: p })
  }
  function removeComponent(c: DcCombiner, componentId: string) {
    dispatch({ type: 'removeDcComponent', combinerId: c.id, componentId })
  }
  function changeKind(c: DcCombiner, comp: DcComponent, kind: DbComponentKind) {
    const oldDef = dbComponentKind(comp.kind)
    const newDef = dbComponentKind(kind)
    const label = (!comp.label.trim() || comp.label === oldDef.label) ? newDef.label : comp.label
    updateComponent(c, comp.id, { kind, label, fedFrom: (comp.fedFrom ?? []).slice(0, newDef.inputs) })
  }
  function setSource(c: DcCombiner, comp: DcComponent, index: number, value: string) {
    const inputs = dbComponentKind(comp.kind).inputs
    const next = Array.from({ length: inputs }, (_, i) => (comp.fedFrom ?? [])[i] ?? '')
    next[index] = value
    updateComponent(c, comp.id, { fedFrom: next })
  }
  function moveComponent(c: DcCombiner, from: number, to: number) {
    dispatch({ type: 'reorderDcComponent', combinerId: c.id, from, to })
  }
  function feedsLabels(c: DcCombiner, comp: DcComponent) {
    return (c.components ?? []).filter((x) => (x.fedFrom ?? []).includes(comp.id)).map((x) => x.label)
  }

  return (
    <SectionCard
      title="DC combiner"
      subtitle="Add a DB/combiner, tie in the strings, set the outputs, and list what's inside."
      action={
        <button
          type="button"
          onClick={() => dispatch({ type: 'addCombiner' })}
          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
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
          {combiners.map((c) => {
            // Catalog DB chosen → enclosure material / mount / ways / rows come from it (item 24).
            const locked = !!c.enclosureCatalogId
            // Global string exclusion (item 45): strings already tied to ANY OTHER
            // combiner can't be claimed here, so the same string is never on two boards.
            const claimedElsewhere = new Set(
              combiners.flatMap((other) => other.id === c.id ? [] : other.inputStringIds),
            )
            const components = c.components ?? []
            const maxOut = Math.max(4, c.inputStringIds.length)
            return (
            <CollapsibleCard
              key={c.id}
              title={
                <span className="flex items-center gap-1.5">
                  <CircuitBoard className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
                  <input
                    value={c.label}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => patch(c, { label: e.target.value })}
                    className="bg-transparent border-b border-transparent hover:border-border focus:border-primary text-sm font-semibold focus:outline-none"
                  />
                </span>
              }
              subtitle={`${combinerConfigLabel(c)} · ${c.productCode}`}
              right={
                <button type="button" onClick={() => dispatch({ type: 'removeCombiner', id: c.id })} className="text-muted-foreground hover:text-destructive" title="Remove combiner">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              }
            >
              {/* Enclosure — just the DB product line; the rest is behind "Edit". */}
              {(() => { const encOpen = editEnc[c.id] ?? false; return (<>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Enclosure</p>
                <button type="button" onClick={() => setEditEnc((m) => ({ ...m, [c.id]: !encOpen }))}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                  {encOpen ? <ChevronDown className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  {encOpen ? 'Done' : 'Edit material, ways…'}
                </button>
              </div>
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
                {encOpen && <span className="text-[10px] text-muted-foreground">Pick one to auto-fill the fields below, or set them manually.</span>}
              </label>
              {encOpen && (<>
              {locked && <div className="mb-2"><LockNote>Material, mount, ways and rows come from the chosen DB</LockNote></div>}
              <div className="grid grid-cols-2 @xl:grid-cols-3 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Material</span>
                  <select value={c.material} disabled={locked} onChange={(e) => patch(c, { material: e.target.value as DcCombiner['material'] })} className={`h-8 rounded-md border border-border bg-background px-2 text-xs ${LOCKED_FIELD}`}>
                    {ENCLOSURE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Mount</span>
                  <select value={c.mount} disabled={locked} onChange={(e) => patch(c, { mount: e.target.value as DcCombiner['mount'] })} className={`h-8 rounded-md border border-border bg-background px-2 text-xs ${LOCKED_FIELD}`}>
                    {ENCLOSURE_MOUNTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Ways</span>
                  <select value={c.ways} disabled={locked} onChange={(e) => patch(c, { ways: Number(e.target.value) })} className={`h-8 rounded-md border border-border bg-background px-2 text-xs ${LOCKED_FIELD}`}>
                    {ENCLOSURE_WAYS.map((w) => <option key={w} value={w}>{w}-way</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Rows</span>
                  <input type="number" min={1} max={4} value={c.rows} disabled={locked} onChange={(e) => patch(c, { rows: clamp(Math.round(Number(e.target.value) || 1), 1, 4) })} className={`h-8 rounded-md border border-border bg-background px-2 text-xs ${LOCKED_FIELD}`} />
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
              </>)}
              </>) })()}

              {/* Inputs — every individual string, grouped by its panel card. Strings
                  already tied to another combiner are disabled (item 45). */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">Strings in</p>
              {strings.length === 0 ? (
                <p className="text-xs text-muted-foreground">Add panel groups first — then tick which strings feed this combiner.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {stringGroups.map(({ g, list }) => (
                    <div key={g.id}>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {g.panelCount}×{g.panelWatts}W · {list.length} string{list.length === 1 ? '' : 's'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((s) => {
                          const on = c.inputStringIds.includes(s.id)
                          const taken = !on && claimedElsewhere.has(s.id)
                          return (
                            <button key={s.id} type="button" disabled={taken}
                              onClick={() => { if (!taken) toggleInput(c, s.id) }}
                              title={taken ? 'Already on another combiner' : undefined}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                on ? 'border-primary bg-primary/10 text-primary'
                                  : taken ? 'border-border/40 text-muted-foreground/40 line-through cursor-not-allowed'
                                  : 'border-border text-muted-foreground hover:border-primary/40'
                              }`}>
                              String {s.seq}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Outputs — each output carries its strings to the inverter MPPT(s) */}
              <div className="flex flex-wrap items-center gap-2 mt-4 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outputs</p>
                <input type="number" min={1} max={maxOut} value={c.outputs.length}
                  onChange={(e) => setOutputCount(c, Number(e.target.value) || 1)}
                  className="h-7 w-14 rounded-md border border-border bg-background px-2 text-xs" />
                <span className="text-[11px] text-muted-foreground">to the inverter MPPT(s)</span>
              </div>
              {/* The run this box to the inverter — the counterpart of a panel
                  group's "distance from combiner", and what the diagram labels. */}
              <label className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Distance to inverter (m)</span>
                <input type="number" min={0} step={0.5} placeholder="e.g. 8"
                  value={c.distanceToInverterM ?? ''}
                  onChange={(e) => patch(c, { distanceToInverterM: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                  className="h-7 w-20 rounded-md border border-border bg-background px-2 text-xs" />
                <span className="text-[10px] text-muted-foreground">Sizes the combiner’s output cable. Blank draws 8 m.</span>
              </label>

              {c.outputs.length > 1 && (
                <div className="flex flex-col gap-2.5">
                  {c.outputs.map((o, oi) => (
                    <div key={o.id} className="rounded-md border border-border/70 bg-muted/20 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground">{o.label || `Output ${oi + 1}`}</span>
                        <ReorderButtons index={oi} count={c.outputs.length} onMove={(from, to) => dispatch({ type: 'reorderCombinerComponent', combinerId: c.id, list: 'outputs', from, to })} />
                      </div>
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
                              {strLabel(sid)}
                            </button>
                          )
                        })}
                      </div>
                      {/* output SPD lives in the inside list now; main breaker stays per-output */}
                      {o.stringIds.length > 1 && (
                        <div className="mt-2">
                          <ProductPicker items={items} category="breaker" label="Main breaker (combine)" value={o.mainBreakerId} onChange={(v) => setOutput(c, o.id, { mainBreakerId: v })} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Inside — component list (item 44). Default EMPTY; SPD/protection only when added. */}
              <div className="flex items-center justify-between mt-4 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Inside ({components.length})</p>
                <button type="button" onClick={() => addComponent(c)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
                  <Plus className="h-3 w-3" /> Add component
                </button>
              </div>

              {components.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
                  Nothing inside yet. Add string fuses / fuse holders, isolators, breakers, SPD, busbar…
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {components.map((comp, ci) => {
                    const def = dbComponentKind(comp.kind)
                    const candidates = components.filter((x) => x.id !== comp.id)
                    const feeds = feedsLabels(c, comp)
                    return (
                      <div key={comp.id} className="rounded-md border border-border bg-muted/30 p-2">
                        <div className="flex items-center gap-2">
                          <ReorderButtons index={ci} count={components.length} onMove={(from, to) => moveComponent(c, from, to)} />
                          <select value={comp.kind} onChange={(e) => changeKind(c, comp, e.target.value as DbComponentKind)} className="h-7 rounded border border-border bg-background px-1.5 text-[11px] font-medium">
                            {DB_COMPONENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                          </select>
                          <input value={comp.label} onChange={(e) => updateComponent(c, comp.id, { label: e.target.value })} className="flex-1 h-7 rounded border border-border bg-background px-1.5 text-[11px]" placeholder="Label" />
                          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            ×
                            <input type="number" min={1} value={comp.qty} onChange={(e) => updateComponent(c, comp.id, { qty: Math.max(1, Number(e.target.value) || 1) })} className="h-7 w-12 rounded border border-border bg-background px-1.5 text-[11px]" />
                          </label>
                          <button type="button" onClick={() => removeComponent(c, comp.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="mt-2 grid grid-cols-1 @lg:grid-cols-2 gap-2">
                          <ProductPicker items={items} category={def.category} label="Product" value={comp.productId} onChange={(v) => updateComponent(c, comp.id, { productId: v })} />
                          <div className="flex flex-col gap-1">
                            {Array.from({ length: def.inputs }).map((_, i) => (
                              <label key={i} className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">{def.inputs > 1 ? `Fed from (source ${i + 1})` : 'Fed from'}</span>
                                <select value={(comp.fedFrom ?? [])[i] ?? ''} onChange={(e) => setSource(c, comp, i, e.target.value)} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                                  <option value="">— not wired —</option>
                                  <option value={DB_SUPPLY_ID}>{DB_SUPPLY_LABEL}</option>
                                  {c.inputStringIds.map((sid) => <option key={sid} value={sid}>{strLabel(sid)}</option>)}
                                  {candidates.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                                </select>
                              </label>
                            ))}
                          </div>
                        </div>
                        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <CornerDownRight className="h-3 w-3" />
                          Feeds: {feeds.length ? feeds.join(', ') : <span className="italic">output / inverter</span>}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </CollapsibleCard>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
