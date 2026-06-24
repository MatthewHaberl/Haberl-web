'use client'

import { Plus, Trash2, CircuitBoard } from 'lucide-react'
import {
  parseEnclosureSpec, ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, ENCLOSURE_WAYS,
  type AcCombiner,
} from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
import { SectionCard } from '../section-ui'

export function AcCombinerSection() {
  const { design, dispatch, gridSupply } = useDesign()
  const { items } = useCatalog()
  const enclosures = byCategory(items, 'enclosure')
  const boards = design.acCombiners
  const phase = design.inverters[0]?.phases ?? (String(gridSupply ?? '').toLowerCase().includes('three') ? 3 : 1)

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

  return (
    <SectionCard
      title="AC combiner / Distribution board"
      subtitle={`The DB after the inverter — ${phase}-phase. Pick the board enclosure and its main protection.`}
      action={
        <button type="button" onClick={() => dispatch({ type: 'addAcCombiner' })} className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
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
          {boards.map((c) => (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <CircuitBoard className="h-3.5 w-3.5 text-blue-600" />
                  <input value={c.label} onChange={(e) => patch(c, { label: e.target.value })} className="bg-transparent border-b border-transparent hover:border-border focus:border-primary text-xs font-semibold focus:outline-none" />
                </span>
                <button type="button" onClick={() => dispatch({ type: 'removeAcCombiner', id: c.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Enclosure (DB)</p>
              <label className="flex flex-col gap-1 mb-2.5">
                <span className="text-[11px] text-muted-foreground">DB product (from catalog)</span>
                <select value={c.enclosureCatalogId ?? ''} onChange={(e) => pickEnclosure(c, e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                  <option value="">Custom / manual</option>
                  {enclosures.map((x) => <option key={x.id} value={x.id}>{x.description} ({x.sku})</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Material</span>
                  <select value={c.material} onChange={(e) => patch(c, { material: e.target.value as AcCombiner['material'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                    {ENCLOSURE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Mount</span>
                  <select value={c.mount} onChange={(e) => patch(c, { mount: e.target.value as AcCombiner['mount'] })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
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
                  <span className="text-[11px] text-muted-foreground">Product code</span>
                  <input value={c.productCode} onChange={(e) => patch(c, { productCode: e.target.value, productCodeLocked: true })} className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono" />
                </label>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">Inside</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <ProductPicker items={items} category="breaker" label="Main breaker" value={c.mainBreakerId} onChange={(v) => patch(c, { mainBreakerId: v })} />
                <ProductPicker items={items} category="rccb" label="Earth leakage (RCCB)" value={c.rccbId} onChange={(v) => patch(c, { rccbId: v })} />
                <ProductPicker items={items} category="spd" label="AC SPD" value={c.spdId} onChange={(v) => patch(c, { spdId: v })} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
