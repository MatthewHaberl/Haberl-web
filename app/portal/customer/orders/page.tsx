import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { formatDate, formatCurrency } from '@/lib/utils'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { OrderStatus } from '@/types/database'

const statusVariant: Record<OrderStatus, 'default' | 'warning' | 'success' | 'destructive' | 'outline'> = {
  pending:    'warning',
  paid:       'success',
  processing: 'default',
  shipped:    'default',
  delivered:  'success',
  cancelled:  'destructive',
}

export default async function OrdersPage() {
  const user = await getUser()
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('*, items:order_items(*, product:products(name))')
    .eq('customer_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <PageShell width="content">
      <PageHeader
        icon={ShoppingBag}
        title="My Orders"
        description={`${orders?.length ?? 0} orders total`}
        actions={
          <Button variant="accent" asChild>
            <Link href="/shop">Shop now</Link>
          </Button>
        }
      />

      {!orders?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No orders yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              <Link href="/shop" className="text-accent hover:underline">Browse the shop</Link> to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Order #{order.id.slice(0, 8).toUpperCase()}</CardTitle>
                  <Badge variant={statusVariant[order.status as OrderStatus]}>{order.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col divide-y divide-border mb-4">
                  {((order.items as Array<{ product: { name: string } | null; quantity: number; unit_price: number }>) ?? []).map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 py-2">
                      <p className="text-sm min-w-0 truncate">{item.product?.name ?? 'Product'} × {item.quantity}</p>
                      <p className="text-sm font-medium shrink-0">{formatCurrency(item.unit_price * item.quantity)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm font-semibold border-t border-border pt-3">
                  <span>Total</span>
                  <span className="text-accent">{formatCurrency(order.total)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
