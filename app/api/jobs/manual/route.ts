import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { JobPriority } from '@/types/database'

export const runtime = 'nodejs'

const PRIORITIES = new Set<JobPriority>(['low', 'medium', 'high', 'urgent'])
const INSTALL_CHECKLIST = [
  'Deposit invoice sent to customer',
  'Deposit received & reconciled',
  'Starred equipment ordered from supplier',
  'Stock received - checked against picking list',
  'Installation date agreed with customer',
  'Body corporate / HOA approval confirmed (if applicable)',
  'Site prep check: roof access, DB space, monitoring signal',
  'Panels & mounting installed',
  'Inverter & battery mounted and wired',
  'DB integration, earthing & surge protection complete',
  'System commissioned - monitoring set up for customer',
  'COC issued and filed',
  'Handover pack sent (quote, COC, warranties, user guide)',
  'Follow-up call - 7 days after handover',
]

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden - only managers can create jobs', { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  const description = String(body.description ?? '').trim()
  const assignedTo = String(body.assignedTo ?? user.id)
  const scheduledDate = String(body.scheduledDate ?? '').trim()
  const priority = PRIORITIES.has(body.priority) ? body.priority as JobPriority : 'medium'

  if (!title) return new Response('Job title is required', { status: 400 })

  const admin = createAdminClient()
  const { data: assignee } = await admin
    .from('user_profiles')
    .select('id')
    .eq('id', assignedTo)
    .in('role', ['field_worker', 'manager', 'admin'])
    .maybeSingle()
  if (!assignee) return new Response('Choose a valid employee assignee', { status: 400 })

  const { data: job, error: jobError } = await admin
    .from('jobs')
    .insert({
      assigned_to: assignee.id,
      created_by: user.id,
      title,
      description: description || null,
      scheduled_date: scheduledDate || null,
      stage: 'scheduled',
      priority,
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return new Response(jobError?.message ?? 'Could not create job', { status: 400 })
  }

  const { error: tasksError } = await admin.from('job_tasks').insert(
    INSTALL_CHECKLIST.map((task) => ({ job_id: job.id, description: task })),
  )

  if (tasksError) {
    await admin.from('jobs').delete().eq('id', job.id)
    return new Response(`Checklist not created: ${tasksError.message}`, { status: 500 })
  }

  return NextResponse.json({ jobId: job.id })
}
