import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { DEFAULT_WORK_TYPES, type WorkType } from '@/lib/quotes/work-types'
import { WorkTypesEditor } from './WorkTypesEditor'
import { PageShell, PageHeader } from '@/components/layout/page'

export default async function WorkTypesPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  // Writes are admin-only at the RLS level (105_work_types.sql) — gate the page
  // to match rather than show a form whose every save is rejected.
  if (profile?.role !== 'admin') redirect('/portal/employee/settings')

  // Inactive ones included: this is where they get switched back on.
  const { data } = await supabase
    .from('work_types').select('*').order('sort_order')

  return (
    <PageShell width="form">
      <PageHeader
        icon={ListChecks}
        title="Work types"
        description="The cards on step 1 of a new quote. Each one names the job and seeds the sections its quote starts with — a starting template, still editable on the quote itself."
      />
      <WorkTypesEditor initial={(data?.length ? data : DEFAULT_WORK_TYPES) as WorkType[]} />
    </PageShell>
  )
}
