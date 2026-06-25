'use client'

import { useEffect, useMemo, useState } from 'react'
import { PackageCheck, ChevronDown, ChevronRight, AlertTriangle, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_PRICING, mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { consolidateBom, designToBom } from '@/lib/solar/design-bom'
import { useDesign } from './DesignProvider'
import { useCatalog } from './useCatalog'

function rands(n: number) {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const UNPRICED_HINT: Record<string, string> = {
  'no-product': 'No catalog product chosen yet — pick one or get a supplier quote',
  'product-missing': 'Selected product is no longer in the catalog — re-pick it',
  'no-cost': 'Product has no cost captured yet',
  'ok': '',
}

export function DesignBomPanel() {
  const { design, gridSupply, dispatch } = useDesign()
  const { items, loading } = useCatalog()
  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const [open, setOpen] = useState(true)
  // Consolidated SUMs identical items across the whole design (cleanest to read);
  // Itemised lists every occurrence per location. A click apart, like BomTab's view.
  const [view, setView] = useState<'consolidated' | 'itemised'>('consolidated')
  const markup = pricing.markup

  useEffect(() => {
    let active = true
    createClient()
      .from('company_settings').select('*').eq('id', true).maybeSingle()
      .then(({ data }) => { if (active && data) setPricing(mapSettingsToPricing(data)) })
    return () => { active = false }
  }, [])

  const catalog = useMemo(() => {
    const m = new Map<string, EquipmentCatalogItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const itemised = useMemo(() => designToBom(design, catalog, markup, { gridSupply, pricing }), [design, catalog, markup, gridSupply, pricing])
  const consolidated = useMemo(() => consolidateBom(itemised), [itemised])
  const bom = view === 'consolidated' ? consolidated : itemised

  // Export just the unpriced lines as a CSV to send to a supplier for quoting.
  // Always uses the consolidated lines so each item to quote appears once.
  function exportQuoteCsv() {
    const reason: Record<string, string> = {
      'no-product': 'No product chosen', 'product-missing': 'Product not in catalog', 'no-cost': 'No cost captured', 'ok': '',
    }
    const rows: string[][] = [['Section', 'Item', 'Ref', 'Qty', 'Reason']]
    for (const s of consolidated.sections) for (const l of s.lines) {
      if (!l.priced) rows.push([s.name, l.description, l.sku, String(l.qty), reason[l.status] ?? ''])
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'items-to-quote.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

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
        <span className="flex items-center gap-2">
          {bom.needsPricing > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">{bom.needsPricing} to price</span>
          )}
          <span className="text-sm font-bold text-primary">{rands(bom.totalSellR)}</span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-2">
            <div className="flex gap-0.5 rounded-md border border-border p-0.5">
              {([['consolidated', 'Consolidated'], ['itemised', 'Itemised']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    view === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={id === 'consolidated' ? 'Identical items summed across the whole design' : 'Every occurrence listed per location'}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Install access</span>
              <select
                value={design.storeys ?? 1}
                onChange={(e) => dispatch({ type: 'setStoreys', storeys: Number(e.target.value) })}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value={1}>Single storey</option>
                <option value={2}>Double storey (+premium)</option>
                <option value={3}>Triple storey (+premium)</option>
              </select>
            </div>
          </div>
          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading catalog…</p>
          ) : bom.sections.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Pick catalog products in the sections above and the priced BOM builds here.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {bom.needsPricing > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span><strong>{bom.needsPricing}</strong> item(s) need a price — shown as <span className="font-semibold">Quote</span> below. Send these to your supplier so the customer is quoted correctly.</span>
                  </p>
                  <button
                    type="button"
                    onClick={exportQuoteCsv}
                    className="self-start flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" /> Download items to quote (CSV)
                  </button>
                </div>
              )}
              {bom.sections.map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between border-b border-border pb-1 mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.name}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      {s.needsPricing > 0 && <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">{s.needsPricing} to price</span>}
                      <span className="font-medium text-foreground">{rands(s.sellR)}</span>
                    </span>
                  </div>
                  <table className="w-full table-fixed text-xs">
                    <colgroup>
                      <col className="w-[4.5rem]" />
                      <col />
                      <col className="w-8" />
                      <col className="w-[5.25rem]" />
                    </colgroup>
                    <tbody>
                      {s.lines.map((l, i) => (
                        <tr key={`${l.catalogId}-${i}`} className={l.priced ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}>
                          <td className="truncate py-0.5 pr-2 align-top font-mono text-[10px]" title={l.sku}>{l.sku}</td>
                          <td className="py-0.5 pr-2 align-top">{l.description}{l.approx && <span className="text-amber-600 dark:text-amber-400" title="estimated quantity"> ~</span>}</td>
                          <td className="py-0.5 pr-1 text-right align-top tabular-nums whitespace-nowrap text-muted-foreground">{l.qty}×</td>
                          <td className="py-0.5 text-right align-top tabular-nums whitespace-nowrap">
                            {l.priced ? (
                              <span className="text-foreground">{rands(l.lineSellR)}</span>
                            ) : (
                              <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400" title={UNPRICED_HINT[l.status]}>Quote</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div className="flex items-center justify-between border-t-2 border-border pt-2">
                <span className="text-sm font-semibold text-foreground">Total (priced)</span>
                <span className="text-base font-bold text-primary">{rands(bom.totalSellR)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Priced cost {rands(bom.totalCostR)} · sell = cost × {markup.toFixed(2)} · ~ = estimated (cabling = conductor-metres × rate card; add a measured route on a cable to firm it up).
                Total excludes items marked <span className="font-semibold text-amber-700 dark:text-amber-400">Quote</span>. Labour + consumables from your pricing settings; storey premium not yet included.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
