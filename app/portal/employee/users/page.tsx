import Link from 'next/link'
import type { Metadata } from 'next'
import { UserCog, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { UsersDirectory } from './UsersDirectory'
import type { DirectoryUser } from './shared'
import type { Role } from '@/types/database'

export const metadata: Metadata = { title: 'Users' }
export const dynamic = 'force-dynamic'

type CustomerRow = {
  id: string
  auth_user_id: string | null
  registered_at: string | null
  sites?: { count: number }[]
  quote_requests?: { count: number }[]
}

export default async function UsersPage() {
  await requireSection('users')
  const supabase = await createClient()

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, phone, role, created_at')
    .order('created_at', { ascending: true })

  const list = profiles ?? []
  const ids = list.map((p) => p.id)

  // How each login is connected: a linked CRM customer (with site/quote counts)
  // plus staff workload (assigned jobs, submitted quotes).
  const [customersRes, jobsRes, submittedRes] = ids.length
    ? await Promise.all([
        supabase
          .from('customers')
          .select('id, auth_user_id, registered_at, sites(count), quote_requests(count)')
          .in('auth_user_id', ids),
        supabase.from('jobs').select('assigned_to').in('assigned_to', ids),
        supabase.from('quote_requests').select('submitted_by').in('submitted_by', ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const custByUser = new Map<string, DirectoryUser['customer']>()
  for (const c of (customersRes.data ?? []) as CustomerRow[]) {
    if (!c.auth_user_id) continue
    custByUser.set(c.auth_user_id, {
      id: c.id,
      status: c.registered_at ? 'registered' : 'invited',
      sites: c.sites?.[0]?.count ?? 0,
      quotes: c.quote_requests?.[0]?.count ?? 0,
    })
  }

  const jobsCount = new Map<string, number>()
  for (const j of (jobsRes.data ?? []) as { assigned_to: string }[]) {
    jobsCount.set(j.assigned_to, (jobsCount.get(j.assigned_to) ?? 0) + 1)
  }
  const subCount = new Map<string, number>()
  for (const q of (submittedRes.data ?? []) as { submitted_by: string }[]) {
    subCount.set(q.submitted_by, (subCount.get(q.submitted_by) ?? 0) + 1)
  }

  const users: DirectoryUser[] = list.map((p) => ({
    id: p.id,
    full_name: p.full_name || '',
    email: p.email || '',
    phone: p.phone,
    role: p.role as Role,
    created_at: p.created_at,
    customer: custByUser.get(p.id) ?? null,
    jobsAssigned: jobsCount.get(p.id) ?? 0,
    quotesSubmitted: subCount.get(p.id) ?? 0,
  }))

  return (
    <PageShell width="wide">
      <PageHeader
        icon={UserCog}
        title="Users"
        description={`${users.length} ${users.length === 1 ? 'login' : 'logins'} on the site — roles, connections & access`}
        actions={
          <Link href="/portal/employee/users/permissions">
            <Button variant="outline" size="sm">
              <ShieldCheck className="h-4 w-4" />
              Permissions
            </Button>
          </Link>
        }
      />
      <UsersDirectory users={users} />
    </PageShell>
  )
}
