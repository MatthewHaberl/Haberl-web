'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { JobMaterial, Supplier } from '@/types/database'
import {
  buildBestPriceReport, offersBySku, OFFERS_SELECT,
  type BestPriceReport, type OfferRow, type SupplierOffer,
} from '@/lib/procurement/best-price'
import { ClipboardList, Loader2, ShoppingCart, X, TrendingDown, Split } from 'lucide-react'

const PO_STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  draft: 'default',
  sent: 'warning',
  partial: 'warning',
  received: 'success',
  cancelled: 'destructive',
}

interface Props {
  jobId: string
  materials: JobMaterial[]
  suppliers: Supplier[]
  existingPos: Array<{ id: string; po_number: string; status: string; supplier_name: string | null }>
  /** job_material ids already on a purchase order */
  orderedMaterialIds: string[]
}

export function CreatePoDialog({ jobId, materials, suppliers, existingPos, orderedMaterialIds }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [expectedDate, setExpectedDate] = useState('')
  const ordered = useMemo(() => new Set(orderedMaterialIds), [orderedMaterialIds])
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(materials.filter((m) => !ordered.has(m.id)).map((m) => m.id)),
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Best price across suppliers (SP5) ──────────────────────────────────────
  // The catalog already prices at the cheapest offer (migration 052), but the
  // buyer never saw WHO that was, or that a single-supplier PO leaves money on
  // the table. Offers are looked up by SKU — job materials are a frozen snapshot
  // with no catalog FK.
  const [report, setReport] = useState<BestPriceReport | null>(null)
  const [showPrices, setShowPrices] = useState(false)
  const skuKey = useMemo(
    () => [...new Set(materials.map((m) => m.sku).filter(Boolean))].sort().join('|'),
    [materials],
  )
  useEffect(() => {
    const skus = skuKey ? skuKey.split('|') : []
    if (skus.length === 0) return
    let active = true
    void createClient()
      .from('equipment_supplier_offers')
      .select(OFFERS_SELECT)
      .in('equipment_catalog.sku', skus)
      .then(({ data }) => {
        if (!active) return
        const byS = offersBySku((data ?? []) as unknown as OfferRow[])
        setReport(buildBestPriceReport(
          materials.map((m) => ({
            sku: m.sku, description: m.description,
            qty: m.qty_planned ?? 0, unitCostCents: m.unit_cost_cents ?? 0,
          })),
          byS,
        ))
      })
    return () => { active = false }
  }, [skuKey, materials])

  const lineBySku = useMemo(() => {
    const m = new Map<string, { cheapest: SupplierOffer | null; savingR: number }>()
    for (const l of report?.lines ?? []) if (l.sku) m.set(l.sku, { cheapest: l.cheapest, savingR: l.savingR })
    return m
  }, [report])

  /** Only baskets whose supplier is actually set up for POs can be ordered from. */
  const splittable = useMemo(() => {
    const byName = new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s]))
    return (report?.baskets ?? []).map((b) => ({ basket: b, supplier: byName.get(b.supplier.trim().toLowerCase()) ?? null }))
  }, [report, suppliers])

  /** Create one PO for a supplier from a set of job_material ids. */
  async function createPo(targetSupplierId: string, materialIds: string[], offset = 0): Promise<string> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { count } = await supabase
      .from('purchase_orders').select('*', { count: 'exact', head: true })
    const poNumber = `PO-${new Date().getFullYear()}-${String((count ?? 0) + 1 + offset).padStart(3, '0')}`

    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        po_number: poNumber,
        job_id: jobId,
        supplier_id: targetSupplierId,
        expected_date: expectedDate || null,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()
    if (poError || !po) throw new Error(poError?.message ?? 'Could not create the purchase order')

    const ids = new Set(materialIds)
    const lines = materials
      .filter((m) => ids.has(m.id))
      .map((m, index) => ({
        po_id: po.id,
        job_material_id: m.id,
        sku: m.sku ?? '',
        description: m.description ?? '',
        qty_ordered: m.qty_planned ?? 0,
        // Buy at this supplier's price when they have an offer for the SKU;
        // otherwise keep the cost the BOM booked.
        unit_cost_cents: unitCostCentsFor(m, targetSupplierId),
        sort_order: index,
      }))
    const { error: linesError } = await supabase.from('purchase_order_lines').insert(lines)
    if (linesError) throw new Error(linesError.message)
    return po.id
  }

  /** This supplier's offer price for a line, in cents; falls back to the BOM cost. */
  function unitCostCentsFor(m: JobMaterial, targetSupplierId: string): number {
    const supplierName = suppliers.find((s) => s.id === targetSupplierId)?.name?.trim().toLowerCase()
    const line = report?.lines.find((l) => l.sku && l.sku === m.sku)
    const offer = supplierName ? line?.offers.find((o) => o.supplier.trim().toLowerCase() === supplierName) : undefined
    return offer ? Math.round(offer.costRands * 100) : (m.unit_cost_cents ?? 0)
  }

  async function create() {
    if (!supplierId) { setError('Pick a supplier first — add one under Settings → Suppliers.'); return }
    if (selected.size === 0) { setError('Select at least one line.'); return }
    setBusy(true)
    setError('')
    try {
      const poId = await createPo(supplierId, [...selected])
      router.push(`/portal/employee/procurement/${poId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the purchase order')
      setBusy(false)
    }
  }

  /** Split the selected lines into one PO per cheapest supplier. */
  async function createSplit() {
    const usable = splittable.filter((s) => s.supplier)
    if (usable.length === 0) { setError('None of the cheapest suppliers are set up yet — add them under Settings → Suppliers.'); return }
    setBusy(true)
    setError('')
    try {
      let firstPoId = ''
      let offset = 0
      for (const { basket, supplier } of usable) {
        // Only lines still selected and not already on a PO go onto the split.
        const ids = materials
          .filter((m) => selected.has(m.id) && m.sku && basket.skus.includes(m.sku))
          .map((m) => m.id)
        if (ids.length === 0) continue
        const poId = await createPo(supplier!.id, ids, offset)
        offset += 1
        if (!firstPoId) firstPoId = poId
      }
      if (!firstPoId) { setError('No selected lines matched a cheaper supplier.'); setBusy(false); return }
      router.push(`/portal/employee/procurement/${firstPoId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not split the purchase order')
      setBusy(false)
    }
  }

  const unordered = materials.filter((m) => !ordered.has(m.id))
  const rands = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-accent" />
            <div>
              <p className="text-sm font-semibold">Procurement</p>
              <p className="text-xs text-muted-foreground">
                {existingPos.length
                  ? `${existingPos.length} purchase order${existingPos.length === 1 ? '' : 's'} on this job`
                  : 'No purchase orders yet — create one from the materials list'}
                {unordered.length > 0 && ` · ${unordered.length} line${unordered.length === 1 ? '' : 's'} not yet ordered`}
              </p>
            </div>
          </div>
          {!open && (
            <Button variant="accent" size="sm" onClick={() => setOpen(true)} disabled={materials.length === 0}>
              <ClipboardList className="h-3.5 w-3.5" /> Create purchase order
            </Button>
          )}
        </div>

        {existingPos.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {existingPos.map((po) => (
              <Link
                key={po.id}
                href={`/portal/employee/procurement/${po.id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-accent transition-colors"
              >
                <span className="font-mono">{po.po_number}</span>
                {po.supplier_name && <span className="text-muted-foreground">{po.supplier_name}</span>}
                <Badge variant={PO_STATUS_VARIANT[po.status] ?? 'default'}>{po.status}</Badge>
              </Link>
            ))}
          </div>
        )}

        {open && (
          <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Supplier *</span>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {suppliers.length === 0 && <option value="">No suppliers — add one in Settings</option>}
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Required by</span>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                />
              </label>
            </div>

            {/* Best price across suppliers — what a single-supplier PO costs you. */}
            {report && report.savingR > 0 && (
              <div className="flex flex-col gap-2 rounded-md border border-success/40 bg-success/5 px-3 py-2">
                <div className="flex items-start gap-2">
                  <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <p className="text-xs text-foreground">
                    Buying each line from whoever is cheapest saves{' '}
                    <strong className="text-success">{rands(report.savingR)}</strong>{' '}
                    on this job ({rands(report.currentTotalR)} → {rands(report.optimisedTotalR)}) across{' '}
                    {report.baskets.length} supplier{report.baskets.length === 1 ? '' : 's'}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {splittable.map(({ basket, supplier }) => (
                    <span
                      key={basket.supplier}
                      title={supplier ? `${basket.lineCount} line(s)` : 'Not in Settings → Suppliers yet — add them to order from here'}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        supplier ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground line-through'
                      }`}
                    >
                      {basket.supplier} · {basket.lineCount} · {rands(basket.totalCostR)}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowPrices((v) => !v)}
                    className="text-[10px] font-medium text-primary hover:underline"
                  >
                    {showPrices ? 'Hide' : 'Show'} per-line prices
                  </button>
                </div>
                {splittable.some((s) => !s.supplier) && (
                  <p className="text-[10px] text-muted-foreground">
                    Struck-through suppliers aren&apos;t set up yet —{' '}
                    <Link href="/portal/employee/settings/suppliers" className="text-primary hover:underline">add them</Link>{' '}
                    to include them in a split order.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col rounded-md border border-border divide-y divide-border max-h-72 overflow-y-auto bg-background">
              {materials.map((m) => {
                const alreadyOrdered = ordered.has(m.id)
                const best = m.sku ? lineBySku.get(m.sku) : undefined
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer ${alreadyOrdered ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => toggle(m.id)}
                      className="h-4 w-4 accent-[#f97316]"
                    />
                    <span className="font-mono text-xs text-muted-foreground w-28 shrink-0 truncate">{m.sku || '—'}</span>
                    <span className="flex-1 min-w-0 truncate">{m.description}</span>
                    {showPrices && best?.cheapest && (
                      <span
                        className={`shrink-0 text-[10px] ${best.savingR > 0 ? 'text-success font-medium' : 'text-muted-foreground'}`}
                        title={`${best.cheapest.supplier} @ ${rands(best.cheapest.costRands)} each`}
                      >
                        {best.cheapest.supplier} {rands(best.cheapest.costRands)}
                        {best.savingR > 0 && ` (−${rands(best.savingR)})`}
                      </span>
                    )}
                    <span className="font-medium shrink-0">×{m.qty_planned}</span>
                    {alreadyOrdered && <span className="text-[10px] text-muted-foreground shrink-0">on a PO</span>}
                  </label>
                )
              })}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="accent" size="sm" onClick={create} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
                Create PO ({selected.size} line{selected.size === 1 ? '' : 's'})
              </Button>
              {report && report.savingR > 0 && splittable.some((s) => s.supplier) && (
                <Button variant="outline" size="sm" onClick={createSplit} disabled={busy} title="One PO per supplier, each line bought from whoever is cheapest">
                  <Split className="h-3.5 w-3.5" /> Split by cheapest — save {rands(report.savingR)}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
