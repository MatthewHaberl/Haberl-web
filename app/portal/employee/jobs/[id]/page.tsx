import { createClient, getUser } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Calendar, ChevronLeft } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Job, JobTask, JobStatus } from '@/types/database'
import { JobActions } from './JobActions'

const statusVariant: Record<JobStatus, 'default' | 'warning' | 'success' | 'destructive'> = {
  pending: 'default', in_progress: 'warning', completed: 'success', cancelled: 'destructive',
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const [{ data: jobData }, { data: taskData }] = await Promise.all([
    supabase.from('jobs').select('*, site:sites(name, address), assignee:user_profiles(full_name)').eq('id', id).single(),
    supabase.from('job_tasks').select('*').eq('job_id', id).order('id'),
  ])

  if (!jobData) notFound()

  const job = jobData as Job
  const tasks = (taskData as JobTask[]) ?? []
  const site = job.site as { name: string; address: string } | null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/portal/employee/jobs">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">{job.title}</h1>
          {site && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3.5 w-3.5" />{site.name} — {site.address}
            </p>
          )}
        </div>
        <Badge variant={statusVariant[job.status]}>{job.status.replace('_', ' ')}</Badge>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {job.scheduled_date && (
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="text-sm font-medium">{formatDate(job.scheduled_date)}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {job.description && (
          <Card className="sm:col-span-2">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{job.description}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <JobActions initialJob={job} initialTasks={tasks} />
    </div>
  )
}
