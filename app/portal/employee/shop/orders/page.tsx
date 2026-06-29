import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, ShoppingBag } from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'
import type { OrderStatus } from '@/types/database'

export const metadata: Metadata = { title: 'Orders — Shop' }

const statusVariant: Record<OrderStatus, 'default' | 'warning' | 'success' | 'destructive' | 'outline' | 'accent'> = {
  pending:    'warning',
  paid:       'success',
  processing: 'accent',
  shipped:    'default',
  delivered:  'success',
  cancelled:  'destructive',
}

export default async function OrdersPage() {
  await requireSection('shop')
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, status, subtotal, tax, total, created_at, payfast_payment_id,
      customer:user_profiles(id, full_name, email),
      items:order_items(id, quantity, unit_price, total_price, product:products(name, sku))
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  const totalRevenue = (orders ?? []).filter(o => o.status === 'paid').reduce((s, o) => s + (o.total ?? 0), 0)
  const pendingCount = (orders ?? []).filter(o => o.status === 'pending').length

  return (
    <PageShell width="wide">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
      </Button>
      <PageHeader
        icon={ShoppingBag}
        title="Orders"
        description={`${orders?.length ?? 0} orders · ${formatCurrency(totalRevenue)} paid revenue · ${pendingCount} pending`}
      />

      {!orders?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No orders yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map(order => {
            const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer
            const items = (order.items ?? []) as unknown as Array<{
              id: string; quantity: number; unit_price: number; total_price: number
              product: { name: string; sku: string | null } | null
            }>

            return (
              <Card key={order.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base font-mono">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </CardTitle>
                        <Badge variant={statusVariant[order.status as OrderStatus]}>{order.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {customer?.full_name ?? 'Unknown customer'}
                        {customer?.email && ` · ${customer.email}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-primary">{formatCurrency(order.total)}</p>
                      {order.payfast_payment_id && (
                        <p className="text-xs text-muted-foreground font-mono">PayFast: {order.payfast_payment_id}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium">{item.product?.name ?? 'Product'}</p>
                          {item.product?.sku && <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>}
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="font-medium">{formatCurrency(item.total_price)}</p>
                          <p className="text-xs text-muted-foreground">×{item.quantity} @ {formatCurrency(item.unit_price)}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 bg-muted/30 text-sm font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
