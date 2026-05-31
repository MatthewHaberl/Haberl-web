'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, MapPin, Calendar, ChevronLeft } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Job, JobTask, JobStatus } from '@/types/database'

const statusVariant: Record<JobStatus, 'default' | 'warning' | 'success' | 'destructive'> = {
  pending: 'default', in_progress: 'warning', completed: 'success', cancelled: 'destructive',
}

const nextStatus: Partial<Record<JobStatus, JobStatus>> = {
  pending: 'in_progress',
  in_progress: 'completed',
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [job, setJob] = useState<Job | null>(null)
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: jobData }, { data: taskData }] = await Promise.all([
      supabase.from('jobs').select('*, site:sites(name, address), assignee:user_profiles(full_name)').eq('id', id).single(),
      supabase.from('job_tasks').select('*').eq('job_id', id).order('id'),
    ])
    setJob(jobData as Job)
    setTasks((taskData as JobTask[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function toggleTask(taskId: string, completed: boolean) {
    await supabase.from('job_tasks').update({
      completed: !completed,
      completed_at: !completed ? new Date().toISOString() : null,
    }).eq('id', taskId)
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, completed: !completed } : t))
  }

  async function advanceStatus() {
    if (!job) return
    const next = nextStatus[job.status]
    if (!next) return
    await supabase.from('jobs').update({ status: next, completed_at: next === 'completed' ? new Date().toISOString() : null }).eq('id', job.id)
    setJob((j) => j ? { ...j, status: next } : j)
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>
  if (!job) return <div className="p-8 text-center text-muted-foreground">Job not found.</div>

  const site = job.site as { name: string; address: string } | null
  const completedCount = tasks.filter((t) => t.completed).length
  const next = nextStatus[job.status]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/portal/employee/jobs')}>
          <ChevronLeft className="h-4 w-4" />
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

      {/* Details */}
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

      {/* Task checklist */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Tasks — {completedCount}/{tasks.length} done
            </CardTitle>
            {tasks.length > 0 && (
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all"
                  style={{ width: `${(completedCount / tasks.length) * 100}%` }}
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => toggleTask(task.id, task.completed)}
                  className="flex items-start gap-3 text-left p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  {task.completed
                    ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    : <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
                  <span className={`text-sm ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                    {task.description}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advance status */}
      {next && (
        <Button variant="accent" size="lg" onClick={advanceStatus} className="w-full sm:w-auto">
          Mark as {next.replace('_', ' ')}
        </Button>
      )}
    </div>
  )
}
