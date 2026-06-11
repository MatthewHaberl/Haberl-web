import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight, PackageSearch, Truck } from 'lucide-react'

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  draft: 'default',
  sent: 'warning',
  partial: 'warning',
  received: 'success',
  cancelled: 'destructive',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent — awaiting stock',
  partial: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled',
}

export default async function ProcurementPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    redirect('/portal/employee')
  }

  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, po_number, status, expected_date, created_at, supplier:suppliers(name), job:jobs(id, title)')
    .order('created_at', { ascending: false })

  const orders = pos ?? []
  const open = orders.filter((po) => ['draft', 'sent', 'partial'].includes(po.status))
  const closed = orders.filter((po) => ['received', 'cancelled'].includes(po.status))

  function PoRow({ po }: { po: (typeof orders)[number] }) {
    const supplier = po.supplier as unknown as { name: string } | null
    const job = po.job as unknown as { id: string; title: string } | null
    const overdue =
      po.expected_date &&
      ['sent', 'partial'].includes(po.status) &&
      new Date(`${po.expected_date}T23:59:59`).getTime() < Date.now()
    return (
      <Link href={`/portal/employee/procurement/${po.id}`}>
        <Card className="hover:border-accent transition-colors">
          <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono text-sm font-semibold">{po.po_number}</p>
                <Badge variant={STATUS_VARIANT[po.status] ?? 'default'}>{STATUS_LABEL[po.status] ?? po.status}</Badge>
                {overdue && <Badge variant="destructive">Overdue</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {supplier?.name ?? 'No supplier'}
                {job ? ` · ${job.title}` : ''}
                {po.expected_date ? ` · required ${new Date(po.expected_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}` : ''}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Procurement</h1>
          <p className="text-muted-foreground mt-1">
            {open.length} open order{open.length === 1 ? '' : 's'} · purchase orders are created from a
            job&apos;s materials list
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/portal/employee/settings/suppliers">
            <Truck className="h-3.5 w-3.5" /> Suppliers
          </Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <PackageSearch className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No purchase orders yet</p>
            <p className="text-muted-foreground text-sm mt-1 max-w-md mx-auto">
              Open a job and click <strong>Create purchase order</strong> — the materials list becomes
              the order, and receiving is checked in here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Open ({open.length})</h2>
              {open.map((po) => <PoRow key={po.id} po={po} />)}
            </div>
          )}
          {closed.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Completed ({closed.length})</h2>
              {closed.map((po) => <PoRow key={po.id} po={po} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
