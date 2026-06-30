import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, Mail, Phone, MapPin, FileText, Briefcase, UserRound, ChevronRight, ExternalLink, Eye, Lock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { SCOPEABLE_SECTIONS, defaultRecordScope, PORTAL_SECTIONS, sectionDefaultAllowed } from '@/lib/auth/sections'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { RoleSelect } from '../RoleSelect'
import { AccessSelect } from '../AccessSelect'
import { VisibilitySelect } from '../VisibilitySelect'
import { ROLE_META } from '../shared'
import type { Role, RecordScope } from '@/types/database'

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
  const isStaff = role !== 'customer'

  // Per-user record-visibility overrides (migration 071), keyed by section.
  const { data: visRows } = isStaff
    ? await supabase
        .from('user_section_visibility')
        .select('section, scope')
        .eq('user_id', id)
    : { data: [] }
  const scopeBySection = new Map<string, RecordScope>(
    (visRows ?? []).map((v) => [v.section as string, v.scope as RecordScope]),
  )

  // Per-user SECTION-ACCESS overrides (migration 084) + the role-level default
  // each one diverges from (so the dial can show "Default (On/Off)").
  const { data: accessRows } = isStaff
    ? await supabase
        .from('user_section_permissions')
        .select('section, allowed')
        .eq('user_id', id)
    : { data: [] }
  const accessBySection = new Map<string, boolean>(
    (accessRows ?? []).map((a) => [a.section as string, a.allowed as boolean]),
  )

  let roleAllows: (key: string) => boolean = () => true // admin ⇒ all sections
  if (isStaff && role !== 'admin') {
    const { data: rolePerms } = await supabase
      .from('role_permissions').select('section, allowed').eq('role', role)
    const roleMap = new Map<string, boolean>(
      (rolePerms ?? []).map((p) => [p.section as string, p.allowed as boolean]),
    )
    roleAllows = (key) => (roleMap.has(key) ? !!roleMap.get(key) : sectionDefaultAllowed(key, role))
  }
  // Everyone needs their home; access control stays role-driven — see migration 084.
  const overridableSections = PORTAL_SECTIONS.filter(
    (s) => s.key !== 'dashboard' && s.key !== 'users',
  )

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

      {/* Section access — which sections this person can open at all */}
      {isStaff && (
        <Card>
          <CardContent className="pt-5">
            <div className="mb-1 flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Section access</h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Turn individual sections on or off for this person, overriding{' '}
              {role === 'admin' ? 'their admin access (everything)' : 'their role'}. Leave on{' '}
              <em>Default</em> to follow the role. (Access control stays role-driven, so admins can
              never be locked out.)
            </p>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {overridableSections.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.description}</span>
                  </span>
                  <AccessSelect
                    userId={profile.id}
                    section={s.key}
                    current={accessBySection.has(s.key) ? (accessBySection.get(s.key) ? 'allow' : 'block') : null}
                    defaultAllowed={roleAllows(s.key)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Record visibility — what this person sees inside each section */}
      {isStaff && (
        <Card>
          <CardContent className="pt-5">
            <div className="mb-1 flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Record visibility</h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Inside each section, choose whether this person sees <strong>all</strong> records or
              <strong> only their own</strong> (the ones they captured, were referred, or were shared
              with). Leave on <em>Default</em> to follow their role.
            </p>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {SCOPEABLE_SECTIONS.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm font-medium">{s.label}</span>
                  <VisibilitySelect
                    userId={profile.id}
                    section={s.key}
                    current={scopeBySection.get(s.key) ?? null}
                    defaultScope={defaultRecordScope(role, s.key)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
