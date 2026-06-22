import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { WORKFLOW_DIAGRAMS } from './diagrams'
import { WorkflowMap, type CatchPoint } from './WorkflowMap'

export default async function WorkflowPage() {
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const role = profile?.role
  if (role !== 'admin' && role !== 'manager') {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          The workflow map is available to managers and admins.
        </CardContent>
      </Card>
    )
  }

  // Resilient: if the catch-points table isn't migrated yet, treat as empty.
  const { data } = await supabase
    .from('quote_catch_points')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <WorkflowMap
      diagrams={WORKFLOW_DIAGRAMS}
      initialCatchPoints={(data ?? []) as CatchPoint[]}
      currentUserId={user!.id}
    />
  )
}
