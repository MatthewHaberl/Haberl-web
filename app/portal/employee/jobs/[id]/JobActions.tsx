'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Circle } from 'lucide-react'
import { stageIndexIn, stageMetaFor, stagesFor, type JobPipelineKind } from '@/lib/jobs/stages'
import type { Job, JobStage, JobTask } from '@/types/database'

interface Props {
  initialJob?: Job
  initialTasks: JobTask[]
  stage: JobStage
  /** Which stage pipeline this job runs (W97) — 'full' solar or 'lite' scope work. */
  pipeline?: JobPipelineKind
}

interface StageGroup {
  key: string
  stage: JobStage | null
  label: string
  tasks: JobTask[]
}

function TaskRow({ task, onToggle, showStage = false, pipeline = 'full' }: {
  task: JobTask
  onToggle: (task: JobTask) => void
  showStage?: boolean
  pipeline?: JobPipelineKind
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(task)}
      className="flex items-start gap-3 text-left p-2 rounded-lg hover:bg-muted transition-colors w-full"
    >
      {task.completed
        ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
        : <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
      <span className={`text-sm ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
        {task.description}
        {showStage && task.stage && (
          <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            {stageMetaFor(pipeline, task.stage)?.label ?? task.stage}
          </span>
        )}
      </span>
    </button>
  )
}

// Checklist, focused on the stage the job is actually at. Everything for the
// current stage is open; earlier work that never got ticked is flagged; later
// stages collapse to a one-line preview so the crew can see what's coming
// without wading through it. Stage progression itself lives in StagePipeline.
export function JobActions({ initialTasks, stage, pipeline = 'full' }: Props) {
  const supabase = createClient()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showDone, setShowDone] = useState(false)
  // Ticks applied here, layered over the server list so the row flips instantly.
  // The server stays the source of truth — advancing a stage can also tick tasks
  // off (from the pipeline card above) and that arrives via initialTasks.
  const [ticked, setTicked] = useState<Record<string, boolean>>({})

  const tasks = useMemo(
    () => initialTasks.map((t) => t.id in ticked ? { ...t, completed: ticked[t.id] } : t),
    [initialTasks, ticked],
  )

  async function toggleTask(task: JobTask) {
    const completed = !task.completed
    setTicked((prev) => ({ ...prev, [task.id]: completed }))
    const { error } = await supabase.from('job_tasks').update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq('id', task.id)
    if (error) {
      setTicked((prev) => ({ ...prev, [task.id]: !completed }))
    }
  }

  const stages = stagesFor(pipeline)
  const currentIndex = stageIndexIn(stages, stage) // -1 when on hold or cancelled

  const { now, outstanding, upcoming, doneElsewhere } = useMemo(() => {
    const groupFor = (s: JobStage | null): StageGroup => ({
      key: s ?? 'unstaged',
      stage: s,
      label: s ? stageMetaFor(pipeline, s).label : 'Any stage',
      tasks: [],
    })

    const byStage = new Map<string, StageGroup>()
    for (const s of stages) byStage.set(s, groupFor(s))
    byStage.set('unstaged', groupFor(null))

    for (const task of tasks) {
      const key = task.stage && byStage.has(task.stage) ? task.stage : 'unstaged'
      byStage.get(key)!.tasks.push(task)
    }

    // Ad-hoc tasks (no stage) belong to no phase in particular — keep them with
    // the current stage so they never get buried.
    const nowTasks = [
      ...(byStage.get(stage)?.tasks ?? []),
      ...(byStage.get('unstaged')?.tasks ?? []),
    ]

    const outstandingTasks: JobTask[] = []
    const upcomingGroups: StageGroup[] = []
    const doneTasks: JobTask[] = []

    for (const s of stages) {
      if (s === stage) continue
      const group = byStage.get(s)!
      if (group.tasks.length === 0) continue
      const index = stageIndexIn(stages, s)
      const isPast = currentIndex !== -1 && index < currentIndex

      if (isPast) {
        for (const task of group.tasks) {
          if (task.completed) doneTasks.push(task)
          else outstandingTasks.push(task)
        }
      } else {
        const pending = group.tasks.filter((t) => !t.completed)
        if (pending.length === 0) doneTasks.push(...group.tasks)
        else upcomingGroups.push(group)
      }
    }

    return {
      now: nowTasks,
      outstanding: outstandingTasks,
      upcoming: upcomingGroups,
      doneElsewhere: doneTasks,
    }
  }, [tasks, stage, currentIndex, stages, pipeline])

  if (tasks.length === 0) return null

  const completedCount = tasks.filter((t) => t.completed).length
  const nowDone = now.filter((t) => t.completed).length
  const stageLabel = stageMetaFor(pipeline, stage)?.label ?? stage

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">
            Tasks — {stageLabel}
            {now.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {nowDone}/{now.length} at this stage
              </span>
            )}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{completedCount}/{tasks.length} overall</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all"
            style={{ width: `${(completedCount / tasks.length) * 100}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">

        {/* This stage */}
        {now.length > 0 ? (
          <div className="flex flex-col gap-1">
            {now.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-2">
            Nothing to tick off at the {stageLabel} stage.
          </p>
        )}

        {/* Earlier stages, still open */}
        {outstanding.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning px-2 pb-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Still open from earlier stages ({outstanding.length})
            </p>
            <div className="flex flex-col gap-1">
              {outstanding.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} showStage pipeline={pipeline} />)}
            </div>
          </div>
        )}

        {/* Later stages — one collapsed line each */}
        {upcoming.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground px-2 pb-1">Coming up</p>
            {upcoming.map((group) => {
              const open = expanded[group.key] ?? false
              const pending = group.tasks.filter((t) => !t.completed).length
              return (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [group.key]: !open }))}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    {open
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <span className="text-sm text-muted-foreground">{group.label}</span>
                    <span className="text-xs text-muted-foreground">
                      · {pending} {pending === 1 ? 'task' : 'tasks'}
                    </span>
                  </button>
                  {open && (
                    <div className="flex flex-col gap-1 pl-5">
                      {group.tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Everything already ticked outside this stage */}
        {doneElsewhere.length > 0 && (
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-2"
            >
              {showDone
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
              {showDone ? 'Hide' : 'Show'} {doneElsewhere.length} completed
            </button>
            {showDone && (
              <div className="flex flex-col gap-1 pl-5 pt-1">
                {doneElsewhere.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} showStage pipeline={pipeline} />)}
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  )
}
