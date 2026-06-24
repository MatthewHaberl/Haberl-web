'use client'

import { useEffect, useMemo, useState } from 'react'
import { PackageCheck, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_PRICING, mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { designToBom } from '@/lib/solar/design-bom'
import { useDesign } from './DesignProvider'
import { useCatalog } from './useCatalog'

function rands(n: number) {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function DesignBomPanel() {
  const { design, gridSupply } = useDesign()
  const { items, loading } = useCatalog()
  const [markup, setMarkup] = useState(DEFAULT_PRICING.markup)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    let active = true
    createClient()
      .from('company_settings').select('markup_pct').eq('id', true).maybeSingle()
      .then(({ data }) => { if (active && data) setMarkup(mapSettingsToPricing(data).markup) })
    return () => { active = false }
  }, [])

  const catalog = useMemo(() => {
    const m = new Map<string, EquipmentCatalogItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const bom = useMemo(() => designToBom(design, catalog, markup, { gridSupply }), [design, catalog, markup, gridSupply])

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <PackageCheck className="h-4 w-4" /> Bill of materials
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        <span className="text-sm font-bold text-primary">{rands(bom.totalSellR)}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading catalog…</p>
          ) : bom.sections.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Pick catalog products in the sections above and the priced BOM builds here.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {bom.missing > 0 && (
                <p className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {bom.missing} item(s) reference a product not in the catalog — re-pick them.
                </p>
              )}
              {bom.sections.map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between border-b border-border pb-1 mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.name}</span>
                    <span className="text-xs font-medium text-foreground">{rands(s.sellR)}</span>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {s.lines.map((l, i) => (
                        <tr key={`${l.catalogId}-${i}`} className="text-muted-foreground">
                          <td className="py-0.5 pr-2 font-mono text-[10px]">{l.sku}</td>
                          <td className="py-0.5 pr-2">{l.description}{l.approx && <span className="text-amber-600"> ~</span>}</td>
                          <td className="py-0.5 pr-2 text-right whitespace-nowrap">{l.qty} ×</td>
                          <td className="py-0.5 text-right whitespace-nowrap text-foreground">{rands(l.lineSellR)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div className="flex items-center justify-between border-t-2 border-border pt-2">
                <span className="text-sm font-semibold text-foreground">Total (sell)</span>
                <span className="text-base font-bold text-primary">{rands(bom.totalSellR)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Cost {rands(bom.totalCostR)} · sell = cost × {markup.toFixed(2)} · ~ = estimated (cabling priced as conductor-metres × rate card; edit a cable on the diagram to reprice).
                Labour + consumables not yet included.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
