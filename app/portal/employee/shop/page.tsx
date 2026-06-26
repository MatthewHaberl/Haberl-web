import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import {
  ShoppingBag, Package, Tag, Percent, Truck, BarChart2, ArrowRight, TrendingUp, FileText, Images
} from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Shop Management' }

export default async function ShopAdminPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal/employee')

  const [
    { count: productCount },
    { count: orderCount },
    { count: priceListCount },
    { count: discountCount },
    { count: pendingDocsCount },
    { count: pendingImagesCount },
    { data: recentOrders },
    { data: revenueData },
  ] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('price_lists').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('discount_codes').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('product_documents').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('product_images').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('orders').select('id, status, total, created_at, customer:user_profiles(full_name)').order('created_at', { ascending: false }).limit(5),
    supabase.from('orders').select('total').eq('status', 'paid'),
  ])

  const totalRevenue = (revenueData ?? []).reduce((s, o) => s + (o.total ?? 0), 0)

  const sections = [
    { label: 'Products', desc: `${productCount ?? 0} active products`, href: '/portal/employee/shop/products', icon: Package, badge: String(productCount ?? 0) },
    { label: 'Price Lists', desc: `${priceListCount ?? 0} active lists`, href: '/portal/employee/shop/price-lists', icon: Tag, badge: String(priceListCount ?? 0) },
    { label: 'Discount Codes', desc: `${discountCount ?? 0} active codes`, href: '/portal/employee/shop/discounts', icon: Percent, badge: String(discountCount ?? 0) },
    { label: 'Shipping Zones', desc: 'Weight-based delivery rates', href: '/portal/employee/shop/shipping', icon: Truck, badge: null },
    { label: 'Orders', desc: `${orderCount ?? 0} total orders`, href: '/portal/employee/shop/orders', icon: ShoppingBag, badge: String(orderCount ?? 0) },
    { label: 'Product Relationships', desc: '"Goes with this" recommendations', href: '/portal/employee/shop/relationships', icon: BarChart2, badge: null },
    { label: 'Product Documents', desc: `${pendingDocsCount ?? 0} pending review`, href: '/portal/employee/shop/product-docs', icon: FileText, badge: pendingDocsCount ? String(pendingDocsCount) : null },
    { label: 'Product Images', desc: `${pendingImagesCount ?? 0} pending review`, href: '/portal/employee/shop/product-images', icon: Images, badge: pendingImagesCount ? String(pendingImagesCount) : null },
  ]

  return (
    <PageShell width="wide">
      <PageHeader
        icon={ShoppingBag}
        title="Shop Management"
        description="Products, pricing, discounts, shipping, and orders"
      />

      {/* Revenue summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-accent/30">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Total revenue</p>
            <p className="text-2xl font-bold text-accent mt-1">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">All orders</p>
            <p className="text-2xl font-bold mt-1">{orderCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Active products</p>
            <p className="text-2xl font-bold mt-1">{productCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Price lists</p>
            <p className="text-2xl font-bold mt-1">{priceListCount ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Section nav cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map(s => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full hover:border-accent transition-colors cursor-pointer">
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <s.icon className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold">{s.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.badge !== null && <Badge variant="default">{s.badge}</Badge>}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <Link href="/portal/employee/shop/orders" className="text-xs text-accent hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {!recentOrders?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No orders yet</p>
          ) : (
            <div className="divide-y divide-border">
              {(recentOrders as unknown as Array<{ id: string; status: string; total: number | null; created_at: string; customer?: { full_name: string } | null }>).map((o) => (
                <div key={o.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {(o.customer as { full_name: string } | null)?.full_name ?? 'Customer'}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">#{o.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold">{o.total != null ? formatCurrency(o.total) : '—'}</span>
                    <Badge variant={o.status === 'paid' ? 'success' : o.status === 'cancelled' ? 'destructive' : 'warning'}>
                      {o.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
