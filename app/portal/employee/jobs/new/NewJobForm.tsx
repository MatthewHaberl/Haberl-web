'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PIPELINE_STAGES, STAGE_META } from '@/lib/jobs/stages'
import type { JobPriority, JobStage } from '@/types/database'

type Assignee = {
  id: string
  full_name: string
  role: string
}

type CustomerOption = {
  id: string
  full_name: string
  sites: { id: string; name: string; address: string }[]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

export function NewJobForm({
  assignees,
  customers,
  currentUserId,
}: {
  assignees: Assignee[]
  customers: CustomerOption[]
  currentUserId: string
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState(assignees.some((a) => a.id === currentUserId) ? currentUserId : assignees[0]?.id ?? '')
  const [customerId, setCustomerId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [priority, setPriority] = useState<JobPriority>('medium')
  const [stage, setStage] = useState<JobStage>('scheduled')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedCustomer = customers.find((c) => c.id === customerId)
  const sites = selectedCustomer?.sites ?? []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/jobs/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, assignedTo, customerId, siteId, scheduledDate, priority, stage }),
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
            <Select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              required
            >
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.full_name} ({assignee.role.replace('_', ' ')})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer">
              <Select
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value)
                  setSiteId('')
                }}
              >
                <option value="">— No customer —</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Site">
              <Select
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                disabled={!customerId}
              >
                <option value="">{customerId ? (sites.length ? 'Auto (first / new site)' : 'New site') : '—'}</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} — {site.address}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {customerId && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Linking a customer makes this job visible in their portal. Leave the site on
              “Auto” to attach to their existing site, or create one automatically.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scheduled date">
              <Input type="date" min={new Date().toISOString().split('T')[0]} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
            </Field>
            <Field label="Priority">
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value as JobPriority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
          </div>

          <Field label="Starting stage">
            <Select value={stage} onChange={(event) => setStage(event.target.value as JobStage)}>
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_META[s].label}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted-foreground">
              You can move backward or forward through the stages later from the job.
            </span>
          </Field>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
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
