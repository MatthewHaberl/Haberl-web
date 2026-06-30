import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus } from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { NewJobForm } from './NewJobForm'
import { PageShell, PageHeader } from '@/components/layout/page'

type Assignee = {
  id: string
  full_name: string
  role: string
}

type CustomerOption = {
  id: string
  full_name: string
  sites: { id: string; name: string; address: string }[]
}

export default async function NewJobPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'field_worker'
  if (!['manager', 'admin'].includes(role)) redirect('/portal/employee/jobs')

  const [{ data: assignees }, { data: customers }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, full_name, role')
      .in('role', ['field_worker', 'manager', 'admin'])
      .order('full_name'),
    supabase
      .from('customers')
      .select('id, full_name, sites(id, name, address)')
      .is('archived_at', null)
      .order('full_name'),
  ])

  return (
    <PageShell width="form">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/portal/employee/jobs">
          <ChevronLeft className="h-4 w-4" />
          Jobs
        </Link>
      </Button>
      <PageHeader icon={Plus} title="New job" />

      <NewJobForm
        assignees={(assignees ?? []) as Assignee[]}
        customers={(customers ?? []) as CustomerOption[]}
        currentUserId={user.id}
      />
    </PageShell>
  )
}
