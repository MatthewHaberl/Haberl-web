'use client'

import { Plus, Trash2, Box, FileText } from 'lucide-react'
import { EXTRA_TYPES, mkId } from '@/lib/solar/system-design'
import { landedCostR } from '@/lib/quotes/supplier-quotes'
import {
  SupplierQuoteLinePicker, useSupplierQuoteLines,
} from '../../SupplierQuoteLinePicker'
import { useDesign } from '../DesignProvider'
import { useCatalog } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
import { SectionCard } from '../section-ui'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Lines pulled from uploaded supplier quotes (W98) — priced at the quoted rate. */
function QuotedItemsCard() {
  const { design, dispatch, requestId } = useDesign()
  const supplierLines = useSupplierQuoteLines(requestId)
  const quoted = design.quotedItems ?? []
  if (supplierLines.length === 0 && quoted.length === 0) return null

  return (
    <SectionCard
      title="Quoted line items"
      subtitle="Pulled from the supplier quotes uploaded below — priced at the quoted (landed) rate, not the catalog."
    >
      {quoted.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          Nothing pulled in yet — pick lines from a supplier quote to add them to this design&rsquo;s BOM.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {quoted.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-[160px] flex-1">
                <div className="truncate text-xs">{q.description}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {[q.supplier, q.sku].filter(Boolean).join(' · ')}
                </div>
              </div>
              <input
                type="number" min={0} step="any"
                value={q.qty === 0 ? '' : String(q.qty)}
                onChange={(e) => dispatch({ type: 'updateQuotedItem', id: q.id, patch: { qty: Math.max(0, Number(e.target.value) || 0) } })}
                className="h-7 w-16 rounded border border-border bg-background px-2 text-xs"
                title="Quantity"
              />
              <span className="w-24 text-right text-xs font-medium">
                {q.unitCostR > 0 ? rand(q.unitCostR) : 'No price'}
              </span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'removeQuotedItem', id: q.id })}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <SupplierQuoteLinePicker
          lines={supplierLines}
          onPick={(l) => dispatch({
            type: 'addQuotedItem',
            item: {
              id: mkId('sqitem'),
              lineId: l.id,
              supplier: l.supplierLabel,
              sku: l.sku,
              description: l.description,
              qty: l.qty > 0 ? l.qty : 1,
              unitCostR: landedCostR(l.unitPriceExVatR),
            },
          })}
          label="Add from supplier quote"
        />
      </div>
    </SectionCard>
  )
}

export function ExtrasSection() {
  const { design, dispatch } = useDesign()
  const { items } = useCatalog()
  const extras = design.extras

  return (
    <>
    <QuotedItemsCard />
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
    </>
  )
}
