import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { NewJobForm } from './NewJobForm'

type Assignee = {
  id: string
  full_name: string
  role: string
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

  const { data: assignees } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .in('role', ['field_worker', 'manager', 'admin'])
    .order('full_name')

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/portal/employee/jobs">
            <ChevronLeft className="h-4 w-4" />
            Jobs
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-primary">New job</h1>
      </div>

      <NewJobForm assignees={(assignees ?? []) as Assignee[]} currentUserId={user.id} />
    </div>
  )
}
