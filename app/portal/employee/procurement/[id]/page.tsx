import { createClient, getUser } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import type { PurchaseOrder, PurchaseOrderLine, Supplier } from '@/types/database'
import { PoDetail } from './PoDetail'

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    redirect('/portal/employee')
  }

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

  return (
    <PoDetail
      po={po as PurchaseOrder}
      supplier={(po.supplier as Supplier | null) ?? null}
      job={(po.job as { id: string; title: string } | null) ?? null}
      initialLines={(lines ?? []) as PurchaseOrderLine[]}
    />
  )
}
