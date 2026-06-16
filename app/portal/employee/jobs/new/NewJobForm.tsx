'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { JobPriority } from '@/types/database'

type Assignee = {
  id: string
  full_name: string
  role: string
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

export function NewJobForm({ assignees, currentUserId }: { assignees: Assignee[]; currentUserId: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState(assignees.some((a) => a.id === currentUserId) ? currentUserId : assignees[0]?.id ?? '')
  const [scheduledDate, setScheduledDate] = useState('')
  const [priority, setPriority] = useState<JobPriority>('medium')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/jobs/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, assignedTo, scheduledDate, priority }),
      })
      if (!response.ok) {
        setError(await response.text() || `Could not create job (HTTP ${response.status})`)
        return
      }
      const payload = await response.json()
      router.push(`/portal/employee/jobs/${payload.jobId}`)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Job title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Solar installation - customer name" />
          </Field>

          <Field label="Assigned to">
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.full_name} ({assignee.role.replace('_', ' ')})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scheduled date">
              <Input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as JobPriority)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" variant="accent" disabled={saving || !title.trim() || !assignedTo}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Create job
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
