import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Briefcase, ChevronRight, Calendar, Landmark, Plus, User } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { PIPELINE_STAGES, STAGE_META, stageIndex } from '@/lib/jobs/stages'
import type { JobStage, JobPriority } from '@/types/database'

const stageVariant = (stage: JobStage): 'default' | 'warning' | 'success' | 'destructive' => {
  if (stage === 'completed') return 'success'
  if (stage === 'cancelled') return 'destructive'
  if (stage === 'on_hold') return 'destructive'
  return 'warning'
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
    .select('*, site:sites(name, address), assignee:user_profiles!jobs_assigned_to_fkey(full_name)')
    .order('scheduled_date', { ascending: true })

  if (!isManager) query.eq('assigned_to', user!.id)

  const { data: jobs, error: jobsError } = await query

  const active  = (jobs?.filter((j) => j.stage !== 'completed' && j.stage !== 'cancelled') ?? [])
    .sort((a, b) => stageIndex(a.stage as JobStage) - stageIndex(b.stage as JobStage))
  const done    = jobs?.filter((j) => j.stage === 'completed') ?? []

  // Pipeline overview counts (active stages only)
  const stageCounts = PIPELINE_STAGES.filter((s) => s !== 'completed').map((s) => ({
    stage: s,
    count: active.filter((j) => j.stage === s).length,
  }))
  const onHoldCount = active.filter((j) => j.stage === 'on_hold').length

  function JobCard({ job }: { job: typeof jobs extends (infer T)[] | null ? T : never }) {
    return (
      <Link href={`/portal/employee/jobs/${job.id}`}>
        <Card className="hover:border-accent transition-colors cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="font-semibold text-sm leading-snug min-w-0 truncate">{job.title}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                {job.deposit_proof_url && !job.deposit_confirmed_at && (
                  <Badge variant="accent" className="gap-1">
                    <Landmark className="h-3 w-3" />
                    POP
                  </Badge>
                )}
                <Badge variant={priorityVariant[job.priority as JobPriority]}>{job.priority}</Badge>
                <Badge variant={stageVariant(job.stage as JobStage)}>
                  {STAGE_META[job.stage as JobStage]?.label ?? job.stage}
                </Badge>
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">
            {isManager ? 'All Jobs' : 'My Jobs'}
          </h1>
          <p className="text-muted-foreground mt-1">
          {active.length} active · {done.length} completed
          </p>
        </div>
        {isManager && (
          <Button asChild variant="accent" size="sm">
            <Link href="/portal/employee/jobs/new">
              <Plus className="h-3.5 w-3.5" />
              New job
            </Link>
          </Button>
        )}
      </div>

      {jobsError && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            Jobs could not load: {jobsError.message}
          </CardContent>
        </Card>
      )}

      {/* Pipeline overview */}
      {active.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {stageCounts.filter(({ count }) => count > 0).map(({ stage, count }) => (
            <div key={stage} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs">
              <span className="font-semibold">{count}</span>
              <span className="text-muted-foreground">{STAGE_META[stage].label}</span>
            </div>
          ))}
          {onHoldCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-xs">
              <span className="font-semibold text-destructive">{onHoldCount}</span>
              <span className="text-destructive">On hold</span>
            </div>
          )}
        </div>
      )}

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
