'use client'

// DB builder for the scope engine — the same board-building experience as the
// solar studio's AC-board section (enclosure from the catalog, templates, saved
// boards from db_assemblies, a product per device, sanity warnings), but
// standalone: instead of writing to a SystemDesign it converts the finished
// board into scope lines for one section via dbBoardToScopeLines. Boards saved
// here are interchangeable with the studio's (same kind:'ac' payload).

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CircuitBoard, CornerDownRight, LayoutTemplate, Plus, Save, Trash2, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  parseEnclosureSpec, enclosureCode, ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, ENCLOSURE_WAYS,
  DB_COMPONENT_KINDS, dbComponentKind, defaultDbComponent, defaultAcCombiner,
  DB_SUPPLY_ID, DB_SUPPLY_LABEL, DB_TEMPLATES, buildDbTemplate, reidDbComponents, dbBoardSanity,
  type AcCombiner, type DbComponent, type DbComponentKind, type DbTemplateKey,
} from '@/lib/solar/system-design'
import { dbBoardToScopeLines } from '@/lib/quotes/scope-db'
import type { ScopeLine } from '@/lib/quotes/scope'
import { useCatalog, byCategory } from '../design/useCatalog'
import { ProductPicker } from '../design/ProductPicker'
import type { ScopePricing } from './ScopeWorkspace'

type SavedAssembly = { id: string; name: string; payload: AcCombiner }

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ScopeDbBuilder({ section, pricing, onAdd, onClose }: {
  /** Scope section the built lines land in. */
  section: string
  pricing: ScopePricing
  onAdd: (lines: ScopeLine[]) => void
  onClose: () => void
}) {
  const { items, loading } = useCatalog()
  const enclosures = byCategory(items, 'enclosure')
  const [board, setBoard] = useState<AcCombiner>(() => defaultAcCombiner())

  function patch(p: Partial<AcCombiner>) {
    setBoard((c) => {
      const next = { ...c, ...p }
      // Same rule as the studio reducer: an untouched product code tracks the
      // enclosure config.
      const enclosureTouched = 'material' in p || 'mount' in p || 'ways' in p || 'rows' in p
      if (!next.productCodeLocked && enclosureTouched) next.productCode = enclosureCode(next)
      return next
    })
  }
  const locked = !!board.enclosureCatalogId

  function pickEnclosure(id: string) {
    const item = enclosures.find((x) => x.id === id)
    if (!item) { patch({ enclosureCatalogId: null }); return }
    const spec = parseEnclosureSpec(item.notes)
    patch({
      enclosureCatalogId: item.id, productCode: item.sku, productCodeLocked: true,
      ...(spec ? { material: spec.material, mount: spec.mount, ways: spec.ways, rows: spec.rows, ipRating: spec.ip } : {}),
    })
  }

  // ── Inside: component list (same handlers as the studio's AC-board section) ──
  function setComponents(next: DbComponent[]) { patch({ components: next }) }
  function addComponent() { setComponents([...board.components, defaultDbComponent('breaker')]) }
  function updateComponent(id: string, p: Partial<DbComponent>) {
    setComponents(board.components.map((x) => (x.id === id ? { ...x, ...p } : x)))
  }
  function removeComponent(id: string) {
    setComponents(board.components
      .filter((x) => x.id !== id)
      .map((x) => ({ ...x, fedFrom: x.fedFrom.map((f) => (f === id ? '' : f)) })))
  }
  function changeKind(comp: DbComponent, kind: DbComponentKind) {
    const oldDef = dbComponentKind(comp.kind)
    const newDef = dbComponentKind(kind)
    const label = (!comp.label.trim() || comp.label === oldDef.label) ? newDef.label : comp.label
    updateComponent(comp.id, { kind, label, fedFrom: comp.fedFrom.slice(0, newDef.inputs) })
  }
  function setSource(comp: DbComponent, index: number, value: string) {
    const inputs = dbComponentKind(comp.kind).inputs
    const next = Array.from({ length: inputs }, (_, i) => comp.fedFrom[i] ?? '')
    next[index] = value
    updateComponent(comp.id, { fedFrom: next })
  }
  function feedsLabels(comp: DbComponent) {
    return board.components.filter((x) => x.fedFrom.includes(comp.id)).map((x) => x.label)
  }
  // Wiring selectors hidden by default — but shown when anything is unwired.
  const hasUnwired = board.components.some((x) => {
    const inputs = dbComponentKind(x.kind).inputs
    return Array.from({ length: inputs }, (_, i) => x.fedFrom[i]).some((f) => !f)
  })
  const [wiringShown, setWiringShown] = useState<boolean | null>(null)
  const showWiring = wiringShown ?? hasUnwired

  // ── Reusable boards — shared db_assemblies pool with the solar studio. ──
  const [saved, setSaved] = useState<SavedAssembly[]>([])
  const [saving, setSaving] = useState(false)
  async function loadSaved() {
    const { data } = await createClient()
      .from('db_assemblies').select('id,name,payload').eq('kind', 'ac')
      .order('created_at', { ascending: false })
    setSaved((data as SavedAssembly[] | null) ?? [])
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch: setSaved runs in loadSaved's async continuation, not synchronously in the effect body.
  useEffect(() => { loadSaved() }, [])

  function applyTemplate(key: DbTemplateKey) { patch({ components: buildDbTemplate(key) }) }
  async function saveBoard() {
    setSaving(true)
    const { error } = await createClient()
      .from('db_assemblies').insert({ name: board.label || 'Distribution Board', kind: 'ac', payload: board })
    setSaving(false)
    if (!error) loadSaved()
  }
  function loadInto(a: SavedAssembly) {
    const p = a.payload
    patch({
      components: reidDbComponents(p.components ?? []),
      material: p.material, mount: p.mount, ways: p.ways, rows: p.rows, ipRating: p.ipRating,
      enclosureCatalogId: p.enclosureCatalogId ?? null,
      productCode: p.productCode ?? board.productCode, productCodeLocked: p.productCodeLocked ?? false,
      topConnection: p.topConnection ?? board.topConnection, bottomConnection: p.bottomConnection ?? board.bottomConnection,
    })
  }

  // ── Preview of what "Add to quote" will append. ──
  const catalogMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const built = dbBoardToScopeLines(board, catalogMap, pricing.markup, section)
  const totalR = built.reduce((t, l) => t + (l.unitSellR > 0 ? l.unitSellR * l.qty : 0), 0)
  const toQuote = built.filter((l) => l.unitSellR <= 0).length
  const warns = dbBoardSanity(board)

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="DB builder"
        className="fixed inset-x-0 top-[5vh] z-50 mx-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <CircuitBoard className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <input
              value={board.label}
              onChange={(e) => patch({ label: e.target.value })}
              className="min-w-0 bg-transparent border-b border-transparent hover:border-border focus:border-primary text-sm font-bold focus:outline-none"
              aria-label="Board name"
            />
            <span className="shrink-0 text-xs text-muted-foreground">→ {section}</span>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close" title="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Templates + save/load a reusable board (shared with the solar studio). */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <LayoutTemplate className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Template:</span>
            {DB_TEMPLATES.map((t) => (
              <button key={t.key} type="button" title={t.hint} onClick={() => applyTemplate(t.key)}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-primary/5 hover:border-primary/40">{t.label}</button>
            ))}
            <span className="mx-0.5 text-border">·</span>
            <button type="button" onClick={saveBoard} disabled={saving}
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50">
              <Save className="h-3 w-3" /> {saving ? 'Saving…' : 'Save as reusable'}
            </button>
            {saved.length > 0 && (
              <select
                defaultValue=""
                onChange={(e) => { const a = saved.find((s) => s.id === e.target.value); if (a) loadInto(a); e.currentTarget.value = '' }}
                className="h-6 rounded border border-border bg-background px-1 text-[10px]"
              >
                <option value="">Load saved…</option>
                {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Enclosure (DB)</p>
          <label className="mb-2.5 flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">DB product (from catalog)</span>
            <select value={board.enclosureCatalogId ?? ''} onChange={(e) => pickEnclosure(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              <option value="">Custom / manual</option>
              {enclosures.map((x) => <option key={x.id} value={x.id}>{x.description} ({x.sku})</option>)}
            </select>
          </label>
          {locked && (
            <p className="mb-2 text-[10px] text-muted-foreground">
              Material, mount and ways come from the chosen DB. Switch to <span className="font-medium">Custom / manual</span> to edit them.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Material</span>
              <select value={board.material} disabled={locked} onChange={(e) => patch({ material: e.target.value as AcCombiner['material'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60">
                {ENCLOSURE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Mount</span>
              <select value={board.mount} disabled={locked} onChange={(e) => patch({ mount: e.target.value as AcCombiner['mount'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60">
                {ENCLOSURE_MOUNTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Ways</span>
              <select value={board.ways} disabled={locked} onChange={(e) => patch({ ways: Number(e.target.value) })} className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60">
                {ENCLOSURE_WAYS.map((w) => <option key={w} value={w}>{w}-way</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Product code</span>
              <input value={board.productCode} onChange={(e) => patch({ productCode: e.target.value, productCodeLocked: true })} className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs" />
            </label>
          </div>

          <div className="mt-4 mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Inside ({board.components.length})</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWiringShown(!showWiring)}
                className={`rounded-md border px-2 py-1 text-[11px] font-medium ${showWiring ? 'border-primary/40 bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
              >
                {showWiring ? 'Hide wiring' : 'Show wiring'}
              </button>
              <button type="button" onClick={addComponent} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
                <Plus className="h-3 w-3" /> Add component
              </button>
            </div>
          </div>

          {board.components.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
              Nothing inside yet. Add the main breaker, earth-leakage, SPD, changeover, circuits…
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {board.components.map((comp) => {
                const def = dbComponentKind(comp.kind)
                const candidates = board.components.filter((x) => x.id !== comp.id)
                const feeds = feedsLabels(comp)
                return (
                  <div key={comp.id} className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="flex items-center gap-2">
                      <select value={comp.kind} onChange={(e) => changeKind(comp, e.target.value as DbComponentKind)} className="h-7 rounded border border-border bg-background px-1.5 text-[11px] font-medium">
                        {DB_COMPONENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                      <input value={comp.label} onChange={(e) => updateComponent(comp.id, { label: e.target.value })} className="h-7 flex-1 rounded border border-border bg-background px-1.5 text-[11px]" placeholder="Label" />
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        ×
                        <input type="number" min={1} value={comp.qty} onChange={(e) => updateComponent(comp.id, { qty: Math.max(1, Number(e.target.value) || 1) })} className="h-7 w-12 rounded border border-border bg-background px-1.5 text-[11px]" />
                      </label>
                      <button type="button" onClick={() => removeComponent(comp.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <ProductPicker items={items} category={def.category} label="Product" value={comp.productId} onChange={(v) => updateComponent(comp.id, { productId: v })} />
                      {showWiring && (
                        <div className="flex flex-col gap-1">
                          {Array.from({ length: def.inputs }).map((_, i) => (
                            <label key={i} className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-muted-foreground">{def.inputs > 1 ? `Fed from (source ${i + 1})` : 'Fed from'}</span>
                              <select value={comp.fedFrom[i] ?? ''} onChange={(e) => setSource(comp, i, e.target.value)} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
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

          {warns.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-800/60 dark:bg-amber-950/40">
              {warns.map((wn, i) => (
                <p key={i} className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> {wn}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {loading ? 'Loading catalog…' : (
              <>
                {built.length} line{built.length === 1 ? '' : 's'} · {rand(Math.round(totalR * 100) / 100)}
                {toQuote > 0 && <Badge variant="warning" className="ml-2">{toQuote} to quote</Badge>}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="button" size="sm" disabled={loading || built.length === 0} onClick={() => onAdd(built)}>
              <Plus className="h-3.5 w-3.5" /> Add to quote
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
