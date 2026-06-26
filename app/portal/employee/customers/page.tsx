import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, MapPin, Mail, Phone, Building2, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { customerAccountStatus, type Customer, type CustomerAccountStatus } from '@/types/database'
import { AddCustomerDialog } from './AddCustomerDialog'
import { PageShell, PageHeader } from '@/components/layout/page'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Customers' }
export const dynamic = 'force-dynamic'

type CustomerRow = Customer & {
  sites?: { count: number }[]
  quote_requests?: { count: number }[]
}

const STATUS_META: Record<CustomerAccountStatus, { label: string; variant: 'success' | 'accent' | 'outline' }> = {
  registered: { label: 'Registered', variant: 'success' },
  invited:    { label: 'Invited',    variant: 'accent' },
  prospect:   { label: 'Prospect',   variant: 'outline' },
}

const FILTERS: { key: string; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'prospect',   label: 'Prospects' },
  { key: 'invited',    label: 'Invited' },
  { key: 'registered', label: 'Registered' },
  { key: 'archived',   label: 'Archived' },
]

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: statusFilter = 'all' } = await searchParams
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user!.id).single()
  if (!['manager', 'admin'].includes(profile?.role ?? '')) redirect('/portal/employee/jobs')

  const { data } = await supabase
    .from('customers')
    .select('*, sites(count), quote_requests(count)')
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as CustomerRow[]
  // Archived customers are hidden everywhere except their own filter.
  const all = rows.filter((c) => !c.archived_at)
  const archived = rows.filter((c) => c.archived_at)
  const customers =
    statusFilter === 'archived' ? archived
    : statusFilter === 'all'    ? all
    : all.filter((c) => customerAccountStatus(c) === statusFilter)

  return (
    <PageShell width="wide">
      <PageHeader
        icon={Users}
        title="Customers"
        description={`${all.length} ${all.length === 1 ? 'customer' : 'customers'} · leads, quotes & registered accounts`}
        actions={<AddCustomerDialog />}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const count =
            f.key === 'all'      ? all.length
            : f.key === 'archived' ? archived.length
            : all.filter((c) => customerAccountStatus(c) === f.key).length
          // Hide the Archived chip entirely until something is archived.
          if (f.key === 'archived' && count === 0) return null
          const active = statusFilter === f.key
          return (
            <Link
              key={f.key}
              href={f.key === 'all' ? '/portal/employee/customers' : `/portal/employee/customers?status=${f.key}`}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label} <span className="opacity-70">{count}</span>
            </Link>
          )
        })}
      </div>

      {!customers.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No customers here</p>
            <p className="text-sm text-muted-foreground mt-1">
              Convert a lead, create a quote, or add a customer to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {customers.map((customer) => {
            const status = customerAccountStatus(customer)
            const meta = STATUS_META[status]
            const siteCount = customer.sites?.[0]?.count ?? 0
            const quoteCount = customer.quote_requests?.[0]?.count ?? 0

            return (
              <Link key={customer.id} href={`/portal/employee/customers/${customer.id}`}>
                <Card className="hover:border-accent transition-colors cursor-pointer h-full">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex items-center gap-1.5">
                        {customer.is_business && <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <p className="font-semibold leading-snug truncate">{customer.full_name || 'Unknown'}</p>
                      </div>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {customer.email ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{customer.email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="italic">No email yet</span>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span>{customer.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{siteCount} site{siteCount !== 1 ? 's' : ''}</span>
                        <span>· {quoteCount} quote{quoteCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground">Added {formatDate(customer.created_at)}</p>
                      <span className="flex items-center gap-1 text-xs text-accent font-medium">
                        View <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
