import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, MapPin, Mail, Phone } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Customers' }

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (!['manager', 'admin'].includes(profile?.role ?? '')) redirect('/portal/employee/jobs')

  const { data: customers } = await supabase
    .from('user_profiles')
    .select('*, sites(id, status)')
    .eq('role', 'customer')
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Customers</h1>
        <p className="text-muted-foreground mt-1">{customers?.length ?? 0} registered customers</p>
      </div>

      {!customers?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No customers yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Customers appear here once they register.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {customers.map((customer) => {
            const sites = (customer.sites as Array<{ id: string; status: string }>) ?? []
            const activeSites = sites.filter((s) => s.status === 'active').length

            return (
              <Card key={customer.id}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="font-semibold leading-snug">{customer.full_name}</p>
                    <Badge variant={activeSites > 0 ? 'success' : 'default'}>
                      {sites.length} site{sites.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <a href={`mailto:${customer.email}`} className="hover:text-foreground transition-colors truncate">
                        {customer.email}
                      </a>
                    </div>
                    {customer.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <a href={`tel:${customer.phone}`} className="hover:text-foreground transition-colors">
                          {customer.phone}
                        </a>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {activeSites} active site{activeSites !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                    Joined {formatDate(customer.created_at)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
