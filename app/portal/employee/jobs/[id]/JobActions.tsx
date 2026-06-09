'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Circle } from 'lucide-react'
import type { Job, JobTask } from '@/types/database'

interface Props {
  initialJob?: Job
  initialTasks: JobTask[]
}

// Checklist only — stage progression lives in StagePipeline.
export function JobActions({ initialTasks }: Props) {
  const supabase = createClient()
  const [tasks, setTasks] = useState(initialTasks)

  async function toggleTask(taskId: string, completed: boolean) {
    const { error } = await supabase.from('job_tasks').update({
      completed: !completed,
      completed_at: !completed ? new Date().toISOString() : null,
    }).eq('id', taskId)
    if (!error) {
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, completed: !completed } : t))
    }
  }

  const completedCount = tasks.filter((t) => t.completed).length

  if (tasks.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Tasks — {completedCount}/{tasks.length} done
        </CardTitle>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all"
            style={{ width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%` }}
          />
        </div>
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
  )
}
