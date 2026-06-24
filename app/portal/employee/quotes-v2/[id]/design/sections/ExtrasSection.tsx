'use client'

import { Plus, Trash2, Box } from 'lucide-react'
import { EXTRA_TYPES } from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
import { SectionCard } from '../section-ui'

export function ExtrasSection() {
  const { design, dispatch } = useDesign()
  const { items } = useCatalog()
  const extras = design.extras

  return (
    <SectionCard
      title="Extras"
      subtitle="Isolators, SPDs, meters, EV chargers and custom blocks. They drop onto the diagram for you to wire and position."
    >
      <div className="flex flex-wrap gap-1.5 mb-3">
        {EXTRA_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => dispatch({ type: 'addExtra', extraType: t.value, label: t.label })}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> {t.label}
          </button>
        ))}
      </div>

      {extras.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          No extras yet. Click one above to add it to the diagram.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {extras.map((x) => {
            const def = EXTRA_TYPES.find((t) => t.value === x.type)
            return (
              <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-2">
                <Box className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-24">{def?.label ?? x.type}</span>
                <input
                  value={x.label}
                  onChange={(e) => dispatch({ type: 'updateExtra', id: x.id, patch: { label: e.target.value } })}
                  className="h-7 flex-1 min-w-[120px] rounded border border-border bg-background px-2 text-xs"
                />
                {def?.category && (
                  <ProductPicker items={items} category={def.category} value={x.productId} onChange={(v) => dispatch({ type: 'updateExtra', id: x.id, patch: { productId: v } })} className="min-w-[160px]" />
                )}
                <button type="button" onClick={() => dispatch({ type: 'removeExtra', id: x.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
