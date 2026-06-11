'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { buildQuoteWorkbook } from '@/lib/solar/export-quote-workbook'
import {
  type AnyQuoteData,
  type MultiOptionQuoteData,
  type OptionQuoteData,
  type QuoteData,
  type SupplierBomItem,
} from '@/lib/solar/render-quote'
import type { ComplianceCheck, ComplianceStatus } from '@/lib/solar/compliance'
import { AlertTriangle, CheckCircle2, Download, Info, PackageCheck, Printer, ShieldCheck, ShoppingCart, XCircle } from 'lucide-react'

interface PackInfo {
  pack_size: number
  pack_unit: string
}

function isMultiOption(data: AnyQuoteData): data is MultiOptionQuoteData {
  return (data as MultiOptionQuoteData).type === 'multi-option'
}

function formatRands(value: number) {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  quoteData: AnyQuoteData | null
  quoteNumber: string | null
  customerName: string
  siteAddress: string
  onGoToQuoteTab: () => void
}

export function BomTab({ quoteData, quoteNumber, customerName, siteAddress, onGoToQuoteTab }: Props) {
  const options: OptionQuoteData[] = useMemo(() => {
    if (!quoteData) return []
    if (isMultiOption(quoteData)) return quoteData.options
    return [{ ...(quoteData as QuoteData), tier: 'recommended', tierLabel: 'Quote' } as OptionQuoteData]
  }, [quoteData])

  const [selectedTier, setSelectedTier] = useState<string>(() => {
    const recommended = options.find((o) => o.tier === 'recommended')
    return (recommended ?? options[0])?.tier ?? 'recommended'
  })

  const activeOption = options.find((o) => o.tier === selectedTier) ?? options[0] ?? null
  const bom: SupplierBomItem[] = useMemo(() => activeOption?.supplierBom ?? [], [activeOption])

  // Order-quantities view: needed qty rounded up to purchasable packs
  const [view, setView] = useState<'pricing' | 'order'>('pricing')
  const [packSizes, setPackSizes] = useState<Map<string, PackInfo>>(new Map())

  useEffect(() => {
    let active = true
    async function loadPacks() {
      const supabase = createClient()
      const { data } = await supabase.from('bom_pack_sizes').select('sku, pack_size, pack_unit')
      if (!active || !data) return
      setPackSizes(new Map(data.map((row) => [row.sku, { pack_size: Number(row.pack_size), pack_unit: row.pack_unit }])))
    }
    void loadPacks()
    return () => { active = false }
  }, [])

  async function savePackSize(sku: string, packSize: number, packUnit: string) {
    const supabase = createClient()
    if (packSize > 0) {
      await supabase.from('bom_pack_sizes').upsert({ sku, pack_size: packSize, pack_unit: packUnit || 'pack', updated_at: new Date().toISOString() })
      setPackSizes((prev) => new Map(prev).set(sku, { pack_size: packSize, pack_unit: packUnit || 'pack' }))
    } else {
      await supabase.from('bom_pack_sizes').delete().eq('sku', sku)
      setPackSizes((prev) => { const next = new Map(prev); next.delete(sku); return next })
    }
  }

  const orderTotals = useMemo(() => {
    let surplusCost = 0
    let linesWithPacks = 0
    for (const item of bom) {
      const pack = packSizes.get(item.sku)
      if (!pack || pack.pack_size <= 1) continue
      linesWithPacks++
      const orderQty = Math.ceil(item.quantity / pack.pack_size) * pack.pack_size
      surplusCost += (orderQty - item.quantity) * item.unitCostRands
    }
    return { surplusCost, linesWithPacks }
  }, [bom, packSizes])

  const sections = useMemo(() => {
    const grouped = new Map<string, SupplierBomItem[]>()
    for (const item of bom) {
      const list = grouped.get(item.section) ?? []
      list.push(item)
      grouped.set(item.section, list)
    }
    return Array.from(grouped.entries())
  }, [bom])

  const totals = useMemo(() => bom.reduce(
    (acc, item) => ({
      cost: acc.cost + item.lineCostRands,
      sell: acc.sell + item.lineSellRands,
    }),
    { cost: 0, sell: 0 },
  ), [bom])

  function handleDownloadWorkbook() {
    if (!quoteData) return
    const workbook = buildQuoteWorkbook(quoteData)
    const blob = new Blob([workbook.bytes.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = workbook.filename
    link.click()
    URL.revokeObjectURL(url)
  }

  // Price-free picking list for the warehouse / van loading — never exposes cost or markup
  function handlePrintPickingList() {
    const rows = sections.map(([section, items]) => `
      <tr class="section"><td colspan="4">${section}</td></tr>
      ${items.map((item) => `
        <tr>
          <td class="check">&#9744;</td>
          <td>${item.sku || '—'}</td>
          <td>${item.description}</td>
          <td class="qty">${item.quantity}</td>
        </tr>
      `).join('')}
    `).join('')

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Picking List ${quoteNumber ?? ''}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  th { background: #f3f3f3; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr.section td { background: #e8e8e8; font-weight: bold; }
  td.check { width: 28px; text-align: center; font-size: 14px; }
  td.qty { width: 50px; text-align: center; font-weight: bold; }
  .sign { margin-top: 28px; display: flex; gap: 48px; }
  .sign div { flex: 1; border-top: 1px solid #999; padding-top: 4px; color: #555; }
</style></head><body>
  <h1>Picking List ${quoteNumber ? `— ${quoteNumber}` : ''}${activeOption && options.length > 1 ? ` (${activeOption.tierLabel})` : ''}</h1>
  <div class="meta">${customerName}${siteAddress ? ` · ${siteAddress}` : ''} · Printed ${new Date().toLocaleDateString('en-ZA')}</div>
  <table>
    <thead><tr><th></th><th>SKU</th><th>Description</th><th>Qty</th></tr></thead>
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

  if (!quoteData || bom.length === 0) {
    return (
      <Card className="max-w-3xl">
        <CardContent className="py-10 text-center text-muted-foreground">
          <PackageCheck className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground mb-1">No bill of materials yet</p>
          <p className="text-sm">
            Calculate and save a quote in the <button
              type="button"
              onClick={onGoToQuoteTab}
              className="text-accent underline"
            >Quote tab</button> — the full BOM will appear here automatically.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-primary">Bill of Materials</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every component the calculator priced into this quote. Print the picking list (no prices)
            for the warehouse and site checks, or export the supplier workbook.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handlePrintPickingList}>
            <Printer className="h-3.5 w-3.5" /> Print picking list
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadWorkbook}>
            <Download className="h-3.5 w-3.5" /> Supplier workbook (.xlsx)
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {options.length > 1 && options.map((option) => (
          <button
            key={option.tier}
            type="button"
            onClick={() => setSelectedTier(option.tier)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors
              ${option.tier === selectedTier
                ? 'border-accent text-accent bg-accent/10'
                : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {option.tierLabel}
          </button>
        ))}
        <div className="ml-auto flex gap-1 rounded-md border border-border p-0.5">
          {([['pricing', 'Pricing'], ['order', 'Order quantities']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'pricing' ? (
        <Card>
          <CardContent className="pt-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left py-2 pr-3">SKU</th>
                  <th className="text-left py-2 pr-3">Description</th>
                  <th className="text-center py-2 px-3">Qty</th>
                  <th className="text-right py-2 px-3">Unit Cost</th>
                  <th className="text-right py-2 px-3">Line Cost</th>
                  <th className="text-right py-2 pl-3">Line Sell</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(([section, items]) => (
                  <SectionRows key={section} section={section} items={items} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td colSpan={4} className="py-2 pr-3 text-right">Totals</td>
                  <td className="py-2 px-3 text-right">{formatRands(totals.cost)}</td>
                  <td className="py-2 pl-3 text-right">{formatRands(totals.sell)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 pb-4 flex flex-col gap-3 overflow-x-auto">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingCart className="h-4 w-4 text-accent shrink-0" />
              <p className="text-muted-foreground">
                Needed quantities rounded up to whole packs — the <strong className="text-foreground">surplus</strong> column
                is what you&apos;d over-buy. Set a pack size on any line (admin) to round it.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left py-2 pr-3">SKU</th>
                  <th className="text-left py-2 pr-3">Description</th>
                  <th className="text-center py-2 px-3">Needed</th>
                  <th className="text-center py-2 px-3">Pack size</th>
                  <th className="text-center py-2 px-3">Order</th>
                  <th className="text-right py-2 pl-3">Surplus</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(([section, items]) => (
                  <OrderSectionRows
                    key={section}
                    section={section}
                    items={items}
                    packSizes={packSizes}
                    onSavePack={savePackSize}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td colSpan={5} className="py-2 pr-3 text-right">Surplus value (cost) across {orderTotals.linesWithPacks} pack-rounded line{orderTotals.linesWithPacks === 1 ? '' : 's'}</td>
                  <td className="py-2 pl-3 text-right">{formatRands(orderTotals.surplusCost)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        <Badge variant="warning" className="mr-2">Internal</Badge>
        Cost columns are internal only — the printed picking list and customer quote never include them.
      </p>

      <CompliancePanel
        checks={activeOption?.complianceChecks ?? []}
        warnings={activeOption?.calculationWarnings ?? []}
      />
    </div>
  )
}

const COMPLIANCE_STYLE: Record<ComplianceStatus, { icon: React.ElementType; className: string; label: string }> = {
  pass:    { icon: CheckCircle2,  className: 'text-success',          label: 'Pass' },
  info:    { icon: Info,          className: 'text-muted-foreground', label: 'Site check' },
  warning: { icon: AlertTriangle, className: 'text-warning',          label: 'Warning' },
  blocker: { icon: XCircle,       className: 'text-destructive',      label: 'Blocker' },
}

function CompliancePanel({ checks, warnings }: { checks: ComplianceCheck[]; warnings: string[] }) {
  if (checks.length === 0 && warnings.length === 0) {
    return (
      <Card>
        <CardContent className="py-5 text-sm text-muted-foreground">
          No compliance results stored on this quote — recalculate to run the SANS 10142-1 checks.
        </CardContent>
      </Card>
    )
  }

  const blockers = checks.filter((c) => c.status === 'blocker').length
  const warningCount = checks.filter((c) => c.status === 'warning').length
  const order: ComplianceStatus[] = ['blocker', 'warning', 'info', 'pass']
  const sorted = [...checks].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" /> SANS 10142-1 &amp; Design Rule Checks
          </h3>
          <div className="flex items-center gap-2 text-xs">
            {blockers > 0 && <Badge variant="destructive">{blockers} blocker{blockers === 1 ? '' : 's'}</Badge>}
            {warningCount > 0 && <Badge variant="warning">{warningCount} warning{warningCount === 1 ? '' : 's'}</Badge>}
            {blockers === 0 && warningCount === 0 && <Badge variant="success">All checks passing</Badge>}
            <a href="/portal/employee/settings/rules" className="text-accent underline underline-offset-2">
              All rules
            </a>
          </div>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {sorted.map((check) => {
            const style = COMPLIANCE_STYLE[check.status]
            const Icon = style.icon
            return (
              <div key={check.id} className="flex gap-3 py-2 text-sm">
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${style.className}`} />
                <div className="min-w-0">
                  <p className="font-medium leading-snug">
                    {check.title}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{check.reference}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                </div>
              </div>
            )
          })}
        </div>

        {warnings.length > 0 && (
          <div className="rounded-md bg-warning/10 border border-warning/40 px-3 py-2">
            <p className="text-xs font-semibold mb-1">Calculator notes</p>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OrderSectionRows({
  section, items, packSizes, onSavePack,
}: {
  section: string
  items: SupplierBomItem[]
  packSizes: Map<string, PackInfo>
  onSavePack: (sku: string, packSize: number, packUnit: string) => void
}) {
  return (
    <>
      <tr className="bg-muted/60">
        <td colSpan={6} className="py-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {section}
        </td>
      </tr>
      {items.map((item, i) => {
        const pack = item.sku ? packSizes.get(item.sku) : undefined
        const hasPack = !!pack && pack.pack_size > 1
        const orderQty = hasPack ? Math.ceil(item.quantity / pack!.pack_size) * pack!.pack_size : item.quantity
        const packs = hasPack ? Math.ceil(item.quantity / pack!.pack_size) : null
        const surplus = orderQty - item.quantity
        return (
          <tr key={`${item.sku}-${i}`} className="border-b border-border last:border-0">
            <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.sku || '—'}</td>
            <td className="py-1.5 pr-3">{item.description}</td>
            <td className="py-1.5 px-3 text-center font-medium">{item.quantity}</td>
            <td className="py-1.5 px-3 text-center">
              {item.sku ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={pack?.pack_size ?? ''}
                    placeholder="—"
                    onBlur={(e) => {
                      const value = Number(e.target.value) || 0
                      if (value !== (pack?.pack_size ?? 0)) onSavePack(item.sku, value, pack?.pack_unit ?? 'pack')
                    }}
                    className="h-7 w-16 rounded border border-border bg-background px-1.5 text-xs text-center"
                    title="Units per pack (0 clears) — saved for all quotes"
                  />
                  {pack?.pack_unit && <span className="text-[10px] text-muted-foreground">{pack.pack_unit}</span>}
                </span>
              ) : '—'}
            </td>
            <td className="py-1.5 px-3 text-center font-semibold">
              {orderQty}
              {packs != null && <span className="ml-1 text-[10px] font-normal text-muted-foreground">({packs}×{pack!.pack_size})</span>}
            </td>
            <td className={`py-1.5 pl-3 text-right tabular-nums ${surplus > 0 ? 'text-amber-700 font-medium' : 'text-muted-foreground'}`}>
              {surplus > 0 ? `+${Math.round(surplus * 10) / 10}` : '0'}
            </td>
          </tr>
        )
      })}
    </>
  )
}

function SectionRows({ section, items }: { section: string; items: SupplierBomItem[] }) {
  return (
    <>
      <tr className="bg-muted/60">
        <td colSpan={6} className="py-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {section}
        </td>
      </tr>
      {items.map((item, i) => (
        <tr key={`${item.sku}-${i}`} className="border-b border-border last:border-0">
          <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.sku || '—'}</td>
          <td className="py-1.5 pr-3">{item.description}</td>
          <td className="py-1.5 px-3 text-center font-medium">{item.quantity}</td>
          <td className="py-1.5 px-3 text-right text-muted-foreground">{formatRands(item.unitCostRands)}</td>
          <td className="py-1.5 px-3 text-right">{formatRands(item.lineCostRands)}</td>
          <td className="py-1.5 pl-3 text-right">{formatRands(item.lineSellRands)}</td>
        </tr>
      ))}
    </>
  )
}
