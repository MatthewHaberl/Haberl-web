import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { MapPin, ShoppingBag, FileText, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default async function CustomerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: sites }, { data: orders }] = await Promise.all([
    supabase.from('sites').select('*').eq('customer_id', user!.id).limit(3),
    supabase.from('orders').select('*').eq('customer_id', user!.id).order('created_at', { ascending: false }).limit(3),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">My Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your installations and account</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-5 pb-5">
            <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sites?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Active sites</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5 pb-5">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ShoppingBag className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{orders?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Orders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5 pb-5">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">COC</p>
              <p className="text-xs text-muted-foreground">Docs available</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sites */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>My Installations</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/customer/sites">View all <ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!sites?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No installations on file yet. Contact Haberl to get set up.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {sites.map((site) => (
                <Link
                  key={site.id}
                  href={`/portal/customer/sites/${site.id}`}
                  className="flex items-center justify-between py-3 hover:text-accent transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{site.name}</p>
                    <p className="text-xs text-muted-foreground">{site.address}</p>
                  </div>
                  <Badge variant={site.status === 'active' ? 'success' : 'warning'}>
                    {site.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>Recent Orders</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/customer/orders">View all <ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!orders?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No orders yet. <Link href="/shop" className="text-accent hover:underline">Browse the shop</Link>
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">Order #{order.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">R {(order.total / 100).toFixed(2)}</p>
                    <Badge variant={order.status === 'paid' ? 'success' : 'default'}>{order.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
