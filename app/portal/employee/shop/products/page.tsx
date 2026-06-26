import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, ExternalLink, Package } from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Products — Shop' }

const categoryVariant: Record<string, 'default' | 'accent' | 'success' | 'outline'> = {
  inverter: 'accent',
  battery:  'success',
  panel:    'default',
  other:    'outline',
}

export default async function ShopProductsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal/employee')

  const { data: products } = await supabase
    .from('products')
    .select('id, slug, name, sku, category, brand, price, compare_price, stock_qty, active, external_id, watts_ac, watts_dc, kwh')
    .order('category')
    .order('brand')
    .order('name')

  // Get cost from equipment_catalog for margin calculation
  const { data: catalog } = await supabase
    .from('equipment_catalog')
    .select('id, cost_rands')

  const costMap = new Map((catalog ?? []).map(c => [c.id, c.cost_rands]))

  const rows = (products ?? []).map(p => {
    const costRands = p.external_id ? (costMap.get(p.external_id) ?? null) : null
    const priceRands = p.price / 100
    const margin = costRands ? priceRands - costRands : null
    const marginPct = costRands ? ((priceRands - costRands) / costRands) * 100 : null
    return { ...p, costRands, priceRands, margin, marginPct }
  })

  const byCategory: Record<string, typeof rows> = {}
  for (const r of rows) {
    const cat = r.category ?? 'other'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(r)
  }

  const catOrder = ['inverter', 'battery', 'panel', 'other']
  const sortedCats = catOrder.filter(c => byCategory[c]?.length)

  return (
    <PageShell width="wide">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/portal/employee/shop"><ArrowLeft className="h-4 w-4" /> Shop</Link>
      </Button>
      <PageHeader
        icon={Package}
        title="Products"
        description={`${rows.length} products · showing cost, price, and margin`}
      />

      {sortedCats.map(cat => (
        <Card key={cat}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base capitalize flex items-center gap-2">
              {cat === 'inverter' ? 'Inverters' : cat === 'battery' ? 'Batteries' : cat === 'panel' ? 'Solar Panels' : 'Other Components'}
              <Badge variant={categoryVariant[cat] ?? 'outline'}>{byCategory[cat].length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">SKU</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Product</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Brand</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Cost</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Price</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Margin R</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Margin %</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {byCategory[cat].map(p => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.sku ?? '—'}</td>
                      <td className="px-4 py-2.5 max-w-[200px]">
                        <p className="truncate font-medium">{p.name}</p>
                        {(p.watts_ac || p.watts_dc || p.kwh) && (
                          <p className="text-xs text-muted-foreground">
                            {p.watts_ac ? `${(p.watts_ac/1000).toFixed(1)} kW AC` : p.watts_dc ? `${p.watts_dc} W` : `${p.kwh} kWh`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">{p.brand ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {p.costRands != null ? `R${p.costRands.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-primary">{formatCurrency(p.price)}</td>
                      <td className="px-4 py-2.5 text-right text-success hidden md:table-cell">
                        {p.margin != null ? `R${p.margin.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p.marginPct != null
                          ? <span className="text-success font-semibold">{p.marginPct.toFixed(0)}%</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={p.active ? 'success' : 'outline'} className="text-[10px]">
                          {p.active ? 'Active' : 'Hidden'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/shop" target="_blank">
            <ExternalLink className="h-4 w-4" /> Preview shop
          </Link>
        </Button>
      </div>
    </PageShell>
  )
}
