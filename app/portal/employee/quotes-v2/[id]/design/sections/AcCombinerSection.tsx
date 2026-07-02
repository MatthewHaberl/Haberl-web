'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, CircuitBoard, ChevronDown, ChevronRight, CornerDownRight, Save, LayoutTemplate, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  parseEnclosureSpec, ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, ENCLOSURE_WAYS,
  DB_COMPONENT_KINDS, dbComponentKind, defaultDbComponent, DB_SUPPLY_ID, DB_SUPPLY_LABEL,
  DB_CONNECTIONS, DB_TEMPLATES, buildDbTemplate, reidDbComponents,
  type AcCombiner, type DbComponent, type DbComponentKind, type DbTemplateKey,
} from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
import { SectionCard } from '../section-ui'

type SavedAssembly = { id: string; name: string; payload: AcCombiner }

/** Lightweight board sanity checks surfaced under the component list (W83). */
function dbSanity(c: AcCombiner): string[] {
  const w: string[] = []
  if (c.components.length > 0 && !c.components.some((x) => x.fedFrom.includes(DB_SUPPLY_ID)))
    w.push('Nothing is fed from the incoming supply.')
  if (c.components.length > 0 && !c.components.some((x) => x.kind === 'spd'))
    w.push('No SPD on this board.')
  for (const x of c.components.filter((x) => x.kind === 'changeover'))
    if (x.fedFrom.filter(Boolean).length < 2) w.push(`Changeover “${x.label}” needs two sources.`)
  return w
}

export function AcCombinerSection() {
  const { design, dispatch, gridSupply } = useDesign()
  const { items } = useCatalog()
  const enclosures = byCategory(items, 'enclosure')
  const boards = design.acCombiners
  const phase = design.inverters[0]?.phases ?? (String(gridSupply ?? '').toLowerCase().includes('three') ? 3 : 1)

  // Progressive disclosure — first board open, later boards collapsed until toggled.
  const [openBoards, setOpenBoards] = useState<Record<string, boolean>>({})
  function boardOpen(c: AcCombiner) { return openBoards[c.id] ?? (c.id === boards[0]?.id) }
  // Wiring selectors hidden by default — but shown when anything is left unwired,
  // so broken wiring can't hide behind the toggle.
  const [wiringShown, setWiringShown] = useState<Record<string, boolean>>({})
  function hasUnwired(c: AcCombiner) {
    return c.components.some((x) => {
      const inputs = dbComponentKind(x.kind).inputs
      return Array.from({ length: inputs }, (_, i) => x.fedFrom[i]).some((f) => !f)
    })
  }
  function boardWiring(c: AcCombiner) { return wiringShown[c.id] ?? hasUnwired(c) }

  function patch(c: AcCombiner, p: Partial<AcCombiner>) {
    dispatch({ type: 'updateAcCombiner', id: c.id, patch: p })
  }
  function pickEnclosure(c: AcCombiner, id: string) {
    const item = enclosures.find((x) => x.id === id)
    if (!item) { patch(c, { enclosureCatalogId: null }); return }
    const spec = parseEnclosureSpec(item.notes)
    patch(c, {
      enclosureCatalogId: item.id, productCode: item.sku, productCodeLocked: true,
      ...(spec ? { material: spec.material, mount: spec.mount, ways: spec.ways, rows: spec.rows, ipRating: spec.ip } : {}),
    })
  }

  // ── Inside: component list (each device is fed from the supply or another device) ──
  function setComponents(c: AcCombiner, next: DbComponent[]) { patch(c, { components: next }) }
  function addComponent(c: AcCombiner) {
    setComponents(c, [...c.components, defaultDbComponent('breaker')])
  }
  function updateComponent(c: AcCombiner, id: string, p: Partial<DbComponent>) {
    setComponents(c, c.components.map((x) => (x.id === id ? { ...x, ...p } : x)))
  }
  function removeComponent(c: AcCombiner, id: string) {
    // Drop the device and clear any links that pointed at it (keep source positions).
    setComponents(c, c.components
      .filter((x) => x.id !== id)
      .map((x) => ({ ...x, fedFrom: x.fedFrom.map((f) => (f === id ? '' : f)) })))
  }
  function changeKind(c: AcCombiner, comp: DbComponent, kind: DbComponentKind) {
    const oldDef = dbComponentKind(comp.kind)
    const newDef = dbComponentKind(kind)
    const label = (!comp.label.trim() || comp.label === oldDef.label) ? newDef.label : comp.label
    updateComponent(c, comp.id, { kind, label, fedFrom: comp.fedFrom.slice(0, newDef.inputs) })
  }
  function setSource(c: AcCombiner, comp: DbComponent, index: number, value: string) {
    const inputs = dbComponentKind(comp.kind).inputs
    const next = Array.from({ length: inputs }, (_, i) => comp.fedFrom[i] ?? '')
    next[index] = value
    updateComponent(c, comp.id, { fedFrom: next })
  }

  function sourceLabel(c: AcCombiner, id: string) {
    if (id === DB_SUPPLY_ID) return DB_SUPPLY_LABEL
    return c.components.find((x) => x.id === id)?.label ?? '—'
  }
  function feedsLabels(c: AcCombiner, comp: DbComponent) {
    return c.components.filter((x) => x.fedFrom.includes(comp.id)).map((x) => x.label)
  }

  // ── Reusable boards (W83) — templates + save/load from db_assemblies. ──
  const [saved, setSaved] = useState<SavedAssembly[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)
  async function loadSaved() {
    const { data } = await createClient()
      .from('db_assemblies').select('id,name,payload').eq('kind', 'ac')
      .order('created_at', { ascending: false })
    setSaved((data as SavedAssembly[] | null) ?? [])
  }
  useEffect(() => { loadSaved() }, [])

  function applyTemplate(c: AcCombiner, key: DbTemplateKey) {
    patch(c, { components: buildDbTemplate(key) })
  }
  async function saveBoard(c: AcCombiner) {
    setSavingId(c.id)
    const { error } = await createClient()
      .from('db_assemblies').insert({ name: c.label || 'Distribution Board', kind: 'ac', payload: c })
    setSavingId(null)
    if (!error) loadSaved()
  }
  function loadInto(c: AcCombiner, a: SavedAssembly) {
    const p = a.payload
    patch(c, {
      components: reidDbComponents(p.components ?? []),
      material: p.material, mount: p.mount, ways: p.ways, rows: p.rows, ipRating: p.ipRating,
      enclosureCatalogId: p.enclosureCatalogId ?? null,
      productCode: p.productCode ?? c.productCode, productCodeLocked: p.productCodeLocked ?? false,
      topConnection: p.topConnection ?? c.topConnection, bottomConnection: p.bottomConnection ?? c.bottomConnection,
    })
  }

  return (
    <SectionCard
      title="AC combiner / Distribution board"
      subtitle={`The DB after the inverter — ${phase}-phase. Pick the board enclosure, its cable entry and everything on the inside.`}
      action={
        <button type="button" onClick={() => dispatch({ type: 'addAcCombiner' })} className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Add board
        </button>
      }
    >
      {boards.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          No board yet. Add one to pick the DB and its main breaker / earth-leakage / SPD.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {boards.map((c) => {
            const locked = !!c.enclosureCatalogId
            const open = boardOpen(c)
            const showWiring = boardWiring(c)
            return (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className={`flex items-center justify-between ${open ? 'mb-3' : ''}`}>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <button type="button" onClick={() => setOpenBoards((m) => ({ ...m, [c.id]: !open }))} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground" aria-expanded={open}>
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <CircuitBoard className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    </button>
                    <input value={c.label} onChange={(e) => patch(c, { label: e.target.value })} className="bg-transparent border-b border-transparent hover:border-border focus:border-primary text-xs font-semibold focus:outline-none" />
                    {!open && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {c.components.length} component{c.components.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => dispatch({ type: 'removeAcCombiner', id: c.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>

                {open && (<>

                {/* W83 — templates + save/load a reusable board. */}
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <LayoutTemplate className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Template:</span>
                  {DB_TEMPLATES.map((t) => (
                    <button key={t.key} type="button" title={t.hint} onClick={() => applyTemplate(c, t.key)}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-primary/5 hover:border-primary/40">{t.label}</button>
                  ))}
                  <span className="mx-0.5 text-border">·</span>
                  <button type="button" onClick={() => saveBoard(c)} disabled={savingId === c.id}
                    className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50">
                    <Save className="h-3 w-3" /> {savingId === c.id ? 'Saving…' : 'Save as reusable'}
                  </button>
                  {saved.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => { const a = saved.find((s) => s.id === e.target.value); if (a) loadInto(c, a); e.currentTarget.value = '' }}
                      className="h-6 rounded border border-border bg-background px-1 text-[10px]"
                    >
                      <option value="">Load saved…</option>
                      {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </div>

                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Enclosure (DB)</p>
                <label className="flex flex-col gap-1 mb-2.5">
                  <span className="text-[11px] text-muted-foreground">DB product (from catalog)</span>
                  <select value={c.enclosureCatalogId ?? ''} onChange={(e) => pickEnclosure(c, e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                    <option value="">Custom / manual</option>
                    {enclosures.map((x) => <option key={x.id} value={x.id}>{x.description} ({x.sku})</option>)}
                  </select>
                </label>
                {locked && (
                  <p className="mb-2 text-[10px] text-muted-foreground">
                    Material, mount and ways come from the chosen DB. Switch to <span className="font-medium">Custom / manual</span> to edit them.
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Material</span>
                    <select value={c.material} disabled={locked} onChange={(e) => patch(c, { material: e.target.value as AcCombiner['material'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed">
                      {ENCLOSURE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Mount</span>
                    <select value={c.mount} disabled={locked} onChange={(e) => patch(c, { mount: e.target.value as AcCombiner['mount'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed">
                      {ENCLOSURE_MOUNTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Ways</span>
                    <select value={c.ways} disabled={locked} onChange={(e) => patch(c, { ways: Number(e.target.value) })} className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed">
                      {ENCLOSURE_WAYS.map((w) => <option key={w} value={w}>{w}-way</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Product code</span>
                    <input value={c.productCode} onChange={(e) => patch(c, { productCode: e.target.value, productCodeLocked: true })} className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono" />
                  </label>
                </div>

                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">Cable entry</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Top</span>
                    <select value={c.topConnection} onChange={(e) => patch(c, { topConnection: e.target.value as AcCombiner['topConnection'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                      {DB_CONNECTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Bottom</span>
                    <select value={c.bottomConnection} onChange={(e) => patch(c, { bottomConnection: e.target.value as AcCombiner['bottomConnection'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                      {DB_CONNECTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="flex items-center justify-between mt-4 mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Inside ({c.components.length})</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setWiringShown((m) => ({ ...m, [c.id]: !showWiring }))}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium ${showWiring ? 'border-primary/40 bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      {showWiring ? 'Hide wiring' : 'Show wiring'}
                    </button>
                    <button type="button" onClick={() => addComponent(c)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
                      <Plus className="h-3 w-3" /> Add component
                    </button>
                  </div>
                </div>

                {c.components.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
                    Nothing inside yet. Add the main breaker, earth-leakage, SPD, changeover, circuits…
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {c.components.map((comp) => {
                      const def = dbComponentKind(comp.kind)
                      const candidates = c.components.filter((x) => x.id !== comp.id)
                      const feeds = feedsLabels(c, comp)
                      return (
                        <div key={comp.id} className="rounded-md border border-border bg-muted/30 p-2">
                          <div className="flex items-center gap-2">
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
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <ProductPicker items={items} category={def.category} label="Product" value={comp.productId} onChange={(v) => updateComponent(c, comp.id, { productId: v })} />
                            {showWiring && (
                              <div className="flex flex-col gap-1">
                                {Array.from({ length: def.inputs }).map((_, i) => (
                                  <label key={i} className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-muted-foreground">{def.inputs > 1 ? `Fed from (source ${i + 1})` : 'Fed from'}</span>
                                    <select value={comp.fedFrom[i] ?? ''} onChange={(e) => setSource(c, comp, i, e.target.value)} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                                      <option value="">— not wired —</option>
                                      <option value={DB_SUPPLY_ID}>{DB_SUPPLY_LABEL}</option>
                                      {candidates.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                                    </select>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          {showWiring && (
                            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                              <CornerDownRight className="h-3 w-3" />
                              Feeds: {feeds.length ? feeds.join(', ') : <span className="italic">output / load</span>}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {(() => {
                  const warns = dbSanity(c)
                  return warns.length > 0 ? (
                    <div className="mt-2 rounded-md border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-2">
                      {warns.map((wn, i) => (
                        <p key={i} className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3 shrink-0" /> {wn}
                        </p>
                      ))}
                    </div>
                  ) : null
                })()}
                </>)}
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
