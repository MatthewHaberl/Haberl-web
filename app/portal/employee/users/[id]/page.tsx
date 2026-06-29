import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, Mail, Phone, MapPin, FileText, Briefcase, UserRound, ChevronRight, ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { RoleSelect } from '../RoleSelect'
import { ROLE_META } from '../shared'
import type { Role } from '@/types/database'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'User' }

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('users')
  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, phone, role, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!profile) notFound()

  const role = profile.role as Role
  const meta = ROLE_META[role]

  // Linked CRM customer (this login is also a customer) + their sites/quotes.
  const { data: customer } = await supabase
    .from('customers')
    .select('id, full_name, registered_at, invited_at')
    .eq('auth_user_id', id)
    .maybeSingle()

  const { data: sites } = customer
    ? await supabase
        .from('sites')
        .select('id, name, address, status')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
    : { data: [] }

  const { data: customerQuotes } = customer
    ? await supabase
        .from('quote_requests')
        .select('id, quote_number, status, created_at')
        .eq('customer_id', customer.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] }

  // Staff connections.
  const { data: assignedJobs } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_date')
    .eq('assigned_to', id)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: submittedQuotes } = await supabase
    .from('quote_requests')
    .select('id, quote_number, status, created_at')
    .eq('submitted_by', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <PageShell width="content">
      <Link
        href="/portal/employee/users"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All users
      </Link>

      <PageHeader
        icon={UserRound}
        title={profile.full_name || 'Unnamed user'}
        description={meta.description}
      />

      {/* Identity + role */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={meta.variant}>{meta.label}</Badge>
              {customer && (
                <Badge variant="outline">
                  {customer.registered_at ? 'Also a customer' : 'Also a customer (invited)'}
                </Badge>
              )}
            </div>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 shrink-0" />{profile.email || 'No email'}
            </span>
            {profile.phone && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />{profile.phone}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Joined {formatDate(profile.created_at)}</span>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
            <RoleSelect userId={profile.id} role={role} />
          </div>
        </CardContent>
      </Card>

      {/* Customer connection */}
      {customer && (
        <Card>
          <CardContent className="pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Customer record</h2>
              <Link
                href={`/portal/employee/customers/${customer.id}`}
                className="flex items-center gap-1 text-xs font-medium text-accent"
              >
                Open customer <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ConnList
              empty="No sites yet"
              icon={MapPin}
              items={(sites ?? []).map((s) => ({
                href: `/portal/employee/customers/${customer.id}`,
                label: s.name || s.address || 'Site',
                meta: s.status,
              }))}
            />
            <div className="mt-4">
              <ConnList
                empty="No quotes yet"
                icon={FileText}
                items={(customerQuotes ?? []).map((q) => ({
                  href: `/portal/employee/quotes-v2/${q.id}`,
                  label: q.quote_number || 'Quote',
                  meta: q.status,
                }))}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff connections */}
      {(assignedJobs?.length || submittedQuotes?.length) ? (
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-3 font-semibold">Staff activity</h2>
            <ConnList
              empty="No assigned jobs"
              icon={Briefcase}
              items={(assignedJobs ?? []).map((j) => ({
                href: `/portal/employee/jobs/${j.id}`,
                label: j.title || 'Job',
                meta: j.status,
              }))}
            />
            <div className="mt-4">
              <ConnList
                empty="No quotes created"
                icon={FileText}
                items={(submittedQuotes ?? []).map((q) => ({
                  href: `/portal/employee/quotes-v2/${q.id}`,
                  label: q.quote_number || 'Quote',
                  meta: q.status,
                }))}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}

function ConnList({
  items,
  icon: Icon,
  empty,
}: {
  items: { href: string; label: string; meta?: string | null }[]
  icon: React.ComponentType<{ className?: string }>
  empty: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground/70">{empty}</p>
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {items.map((it, i) => (
        <li key={i}>
          <Link
            href={it.href}
            className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{it.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs capitalize text-muted-foreground">
              {it.meta?.replace(/_/g, ' ')}
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
