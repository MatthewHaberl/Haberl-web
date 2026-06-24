import { createClient } from '@/lib/supabase/server'
import { getCurrentCustomerId } from '@/lib/customers/current'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { MapPin, ChevronRight, Sun } from 'lucide-react'

const NO_CUSTOMER = '00000000-0000-0000-0000-000000000000'

export default async function SitesPage() {
  const supabase = await createClient()
  const customerId = (await getCurrentCustomerId()) ?? NO_CUSTOMER

  const { data: sites } = await supabase
    .from('sites')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">My Installations</h1>
        <p className="text-muted-foreground mt-1">All your registered sites and systems</p>
      </div>

      {!sites?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No installations found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Contact Haberl to register your site.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {sites.map((site) => (
            <Link key={site.id} href={`/portal/customer/sites/${site.id}`}>
              <Card className="hover:border-accent transition-colors cursor-pointer h-full">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <Sun className="h-5 w-5 text-accent" />
                    </div>
                    <Badge variant={site.status === 'active' ? 'success' : 'warning'}>
                      {site.status}
                    </Badge>
                  </div>
                  <h3 className="font-semibold mt-3 truncate">{site.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 min-w-0">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{site.address}</span>
                  </p>
                  {site.system_size_kw && (
                    <p className="text-sm mt-2">
                      <span className="font-medium">{site.system_size_kw} kW</span>{' '}
                      <span className="text-muted-foreground">{site.system_type}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-1 text-xs text-accent mt-3 font-medium">
                    View details <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
