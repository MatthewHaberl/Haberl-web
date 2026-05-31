import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Briefcase, ChevronRight, Calendar, User } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { JobStatus, JobPriority } from '@/types/database'

const statusVariant: Record<JobStatus, 'default' | 'warning' | 'success' | 'destructive'> = {
  pending:     'default',
  in_progress: 'warning',
  completed:   'success',
  cancelled:   'destructive',
}

const priorityVariant: Record<JobPriority, 'default' | 'warning' | 'destructive' | 'outline'> = {
  low:    'outline',
  medium: 'default',
  high:   'warning',
  urgent: 'destructive',
}

export default async function JobsPage() {
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const role = profile?.role ?? 'field_worker'
  const isManager = role === 'manager' || role === 'admin'

  // Managers see all jobs; field workers see only theirs
  const query = supabase
    .from('jobs')
    .select('*, site:sites(name, address), assignee:user_profiles(full_name)')
    .order('scheduled_date', { ascending: true })

  if (!isManager) query.eq('assigned_to', user!.id)

  const { data: jobs } = await query

  const active  = jobs?.filter((j) => j.status !== 'completed' && j.status !== 'cancelled') ?? []
  const done    = jobs?.filter((j) => j.status === 'completed') ?? []

  function JobCard({ job }: { job: typeof jobs extends (infer T)[] | null ? T : never }) {
    return (
      <Link href={`/portal/employee/jobs/${job.id}`}>
        <Card className="hover:border-accent transition-colors cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="font-semibold text-sm leading-snug min-w-0 truncate">{job.title}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant={priorityVariant[job.priority as JobPriority]}>{job.priority}</Badge>
                <Badge variant={statusVariant[job.status as JobStatus]}>{job.status.replace('_', ' ')}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {(job.site as { name: string; address: string } | null)?.name} — {(job.site as { name: string; address: string } | null)?.address}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {job.scheduled_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(job.scheduled_date)}
                </span>
              )}
              {isManager && (job.assignee as { full_name: string } | null)?.full_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {(job.assignee as { full_name: string }).full_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-accent mt-2 font-medium">
              Open job <ChevronRight className="h-3 w-3" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">
          {isManager ? 'All Jobs' : 'My Jobs'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {active.length} active · {done.length} completed
        </p>
      </div>

      {!active.length && !done.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No jobs found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Active ({active.length})
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {active.map((job) => <JobCard key={job.id} job={job} />)}
              </div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Completed ({done.length})
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {done.map((job) => <JobCard key={job.id} job={job} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
