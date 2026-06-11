'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { JobMaterial, Supplier } from '@/types/database'
import { ClipboardList, Loader2, ShoppingCart, X } from 'lucide-react'

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

  async function create() {
    if (!supplierId) { setError('Pick a supplier first — add one under Settings → Suppliers.'); return }
    if (selected.size === 0) { setError('Select at least one line.'); return }
    setBusy(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const { count } = await supabase
        .from('purchase_orders').select('*', { count: 'exact', head: true })
      const poNumber = `PO-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(3, '0')}`

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          job_id: jobId,
          supplier_id: supplierId,
          expected_date: expectedDate || null,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single()
      if (poError || !po) throw new Error(poError?.message ?? 'Could not create the purchase order')

      const lines = materials
        .filter((m) => selected.has(m.id))
        .map((m, index) => ({
          po_id: po.id,
          job_material_id: m.id,
          sku: m.sku ?? '',
          description: m.description ?? '',
          qty_ordered: m.qty_planned ?? 0,
          unit_cost_cents: m.unit_cost_cents ?? 0,
          sort_order: index,
        }))
      const { error: linesError } = await supabase.from('purchase_order_lines').insert(lines)
      if (linesError) throw new Error(linesError.message)

      router.push(`/portal/employee/procurement/${po.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the purchase order')
      setBusy(false)
    }
  }

  const unordered = materials.filter((m) => !ordered.has(m.id))

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

            <div className="flex flex-col rounded-md border border-border divide-y divide-border max-h-72 overflow-y-auto bg-background">
              {materials.map((m) => {
                const alreadyOrdered = ordered.has(m.id)
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
                    <span className="font-medium shrink-0">×{m.qty_planned}</span>
                    {alreadyOrdered && <span className="text-[10px] text-muted-foreground shrink-0">on a PO</span>}
                  </label>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="accent" size="sm" onClick={create} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
                Create PO ({selected.size} line{selected.size === 1 ? '' : 's'})
              </Button>
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
