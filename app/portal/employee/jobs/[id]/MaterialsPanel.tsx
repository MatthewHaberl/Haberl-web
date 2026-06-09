'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { JobMaterial } from '@/types/database'
import { Loader2, Package, Printer } from 'lucide-react'

type QtyField = 'qty_loaded' | 'qty_used' | 'qty_returned'

const QTY_FIELDS: { field: QtyField; label: string }[] = [
  { field: 'qty_loaded', label: 'Loaded' },
  { field: 'qty_used', label: 'Used' },
  { field: 'qty_returned', label: 'Returned' },
]

function formatRands(cents: number) {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  jobTitle: string
  materials: JobMaterial[]
  showPrices: boolean
}

export function MaterialsPanel({ jobTitle, materials: initialMaterials, showPrices }: Props) {
  const supabase = createClient()
  const [materials, setMaterials] = useState(initialMaterials)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const sections = useMemo(() => {
    const grouped = new Map<string, JobMaterial[]>()
    for (const item of materials) {
      const list = grouped.get(item.section) ?? []
      list.push(item)
      grouped.set(item.section, list)
    }
    return Array.from(grouped.entries())
  }, [materials])

  // Variance: what left the warehouse but was neither installed nor returned
  function variance(item: JobMaterial) {
    if (item.qty_loaded <= 0) return 0
    return item.qty_loaded - item.qty_used - item.qty_returned
  }

  const totalVariance = materials.reduce((sum, item) => sum + Math.max(variance(item), 0), 0)
  const varianceCostCents = materials.reduce(
    (sum, item) => sum + Math.max(variance(item), 0) * item.unit_cost_cents, 0,
  )

  async function updateQty(id: string, field: QtyField, value: number) {
    setSavingId(id)
    setError('')
    const { error: dbError } = await supabase
      .from('job_materials')
      .update({ [field]: value })
      .eq('id', id)
    if (dbError) setError(dbError.message)
    else setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)))
    setSavingId(null)
  }

  function handlePrint() {
    const rows = sections.map(([section, items]) => `
      <tr class="section"><td colspan="5">${section || 'General'}</td></tr>
      ${items.map((item) => `
        <tr>
          <td class="check">&#9744;</td>
          <td>${item.sku || '—'}</td>
          <td>${item.description}</td>
          <td class="qty">${item.qty_planned}</td>
          <td class="qty"></td>
        </tr>
      `).join('')}
    `).join('')

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Picking List — ${jobTitle}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  th { background: #f3f3f3; font-size: 11px; text-transform: uppercase; }
  tr.section td { background: #e8e8e8; font-weight: bold; }
  td.check { width: 28px; text-align: center; font-size: 14px; }
  td.qty { width: 60px; text-align: center; font-weight: bold; }
  .sign { margin-top: 28px; display: flex; gap: 48px; }
  .sign div { flex: 1; border-top: 1px solid #999; padding-top: 4px; color: #555; }
</style></head><body>
  <h1>Picking List</h1>
  <div class="meta">${jobTitle} · Printed ${new Date().toLocaleDateString('en-ZA')}</div>
  <table>
    <thead><tr><th></th><th>SKU</th><th>Description</th><th>Plan</th><th>Loaded</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sign">
    <div>Packed by / date</div>
    <div>Checked on site by / date</div>
  </div>
<script>window.onload = function () { window.print() }</script>
</body></html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  if (materials.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium text-foreground mb-1">No materials on this job</p>
          <p className="text-sm">Jobs created from an accepted quote get the BOM copied here automatically.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-accent" /> Materials — {materials.length} lines
          </CardTitle>
          <div className="flex items-center gap-3">
            {totalVariance > 0 && (
              <span className="text-xs font-medium text-destructive">
                {totalVariance} unit{totalVariance === 1 ? '' : 's'} unaccounted
                {showPrices ? ` (${formatRands(varianceCostCents)})` : ''}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" /> Picking list
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Track each line from warehouse to site: planned → loaded → used → returned.
          Anything loaded but not used or returned counts as site loss.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
              <th className="text-left py-2 pr-3">Item</th>
              <th className="text-center py-2 px-2">Plan</th>
              {QTY_FIELDS.map(({ label }) => (
                <th key={label} className="text-center py-2 px-2">{label}</th>
              ))}
              <th className="text-center py-2 px-2">Var</th>
              {showPrices && <th className="text-right py-2 pl-2">Line Cost</th>}
            </tr>
          </thead>
          <tbody>
            {sections.map(([section, items]) => (
              <SectionGroup
                key={section || 'general'}
                section={section}
                items={items}
                showPrices={showPrices}
                savingId={savingId}
                onQtyChange={updateQty}
                variance={variance}
              />
            ))}
          </tbody>
        </table>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </CardContent>
    </Card>
  )
}

function SectionGroup({ section, items, showPrices, savingId, onQtyChange, variance }: {
  section: string
  items: JobMaterial[]
  showPrices: boolean
  savingId: string | null
  onQtyChange: (id: string, field: QtyField, value: number) => void
  variance: (item: JobMaterial) => number
}) {
  return (
    <>
      <tr className="bg-muted/60">
        <td colSpan={showPrices ? 7 : 6} className="py-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {section || 'General'}
        </td>
      </tr>
      {items.map((item) => {
        const itemVariance = variance(item)
        return (
          <tr key={item.id} className="border-b border-border last:border-0">
            <td className="py-1.5 pr-3">
              <span className="block">{item.description}</span>
              {item.sku && <span className="text-xs font-mono text-muted-foreground">{item.sku}</span>}
            </td>
            <td className="py-1.5 px-2 text-center font-medium">{item.qty_planned}</td>
            {QTY_FIELDS.map(({ field }) => (
              <td key={field} className="py-1.5 px-1 text-center">
                <input
                  type="number"
                  min={0}
                  defaultValue={item[field]}
                  disabled={savingId === item.id}
                  onBlur={(e) => {
                    const value = Math.max(0, Number(e.target.value) || 0)
                    if (value !== item[field]) onQtyChange(item.id, field, value)
                  }}
                  className="w-14 h-7 rounded border border-border bg-background text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                />
              </td>
            ))}
            <td className={`py-1.5 px-2 text-center font-medium ${itemVariance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {savingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : itemVariance || '—'}
            </td>
            {showPrices && (
              <td className="py-1.5 pl-2 text-right text-muted-foreground">
                {formatRands(item.qty_planned * item.unit_cost_cents)}
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}
