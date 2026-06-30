import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { notFound } from 'next/navigation'
import type { PurchaseOrder, PurchaseOrderLine, Supplier } from '@/types/database'
import { getSharingContext } from '@/lib/records/sharing'
import { RecordShareControl } from '@/components/records/RecordShareControl'
import { PoDetail } from './PoDetail'

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, role } = await requireSection('procurement')
  const isManager = role === 'manager' || role === 'admin'
  const supabase = await createClient()

  const [{ data: po }, { data: lines }] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(*), job:jobs(id, title)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('purchase_order_lines')
      .select('*')
      .eq('po_id', id)
      .order('sort_order'),
  ])

  if (!po) notFound()

  // Ownership/sharing (migration 073): owner = created_by.
  const { staff, nameById, sharedWith } = await getSharingContext(supabase, 'procurement', id)
  const ownerId = (po as PurchaseOrder).created_by ?? null
  const shareControl = isManager ? (
    <RecordShareControl
      section="procurement"
      recordId={id}
      table="purchase_orders"
      ownerColumn="created_by"
      ownerId={ownerId}
      ownerName={ownerId ? nameById.get(ownerId) ?? 'Assigned' : null}
      staff={staff}
      sharedWith={sharedWith}
      currentUserId={user.id}
      canAssignOwner={isManager}
      canShare={isManager}
      ownerNoun="No owner set"
    />
  ) : null

  return (
    <PoDetail
      po={po as PurchaseOrder}
      supplier={(po.supplier as Supplier | null) ?? null}
      job={(po.job as { id: string; title: string } | null) ?? null}
      initialLines={(lines ?? []) as PurchaseOrderLine[]}
      shareControl={shareControl}
    />
  )
}
