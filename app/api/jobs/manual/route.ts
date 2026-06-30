import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PIPELINE_STAGES } from '@/lib/jobs/stages'
import type { JobPriority, JobStage } from '@/types/database'

export const runtime = 'nodejs'

const PRIORITIES = new Set<JobPriority>(['low', 'medium', 'high', 'urgent'])
const STAGES = new Set<JobStage>(PIPELINE_STAGES)
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
  const customerId = String(body.customerId ?? '').trim()
  const siteIdInput = String(body.siteId ?? '').trim()
  const scheduledDate = String(body.scheduledDate ?? '').trim()
  const priority = PRIORITIES.has(body.priority) ? body.priority as JobPriority : 'medium'
  const stage = STAGES.has(body.stage) ? body.stage as JobStage : 'scheduled'

  if (!title) return new Response('Job title is required', { status: 400 })

  const admin = createAdminClient()
  const { data: assignee } = await admin
    .from('user_profiles')
    .select('id')
    .eq('id', assignedTo)
    .in('role', ['field_worker', 'manager', 'admin'])
    .maybeSingle()
  if (!assignee) return new Response('Choose a valid employee assignee', { status: 400 })

  // Resolve the site to link the job to a customer. If a specific site was
  // chosen, validate it belongs to that customer; otherwise find-or-create one
  // so the job shows up in the customer's portal.
  let siteId: string | null = null
  if (customerId) {
    const { data: customer } = await admin
      .from('customers')
      .select('id, full_name')
      .eq('id', customerId)
      .is('archived_at', null)
      .maybeSingle()
    if (!customer) return new Response('Choose a valid customer', { status: 400 })

    if (siteIdInput) {
      const { data: site } = await admin
        .from('sites')
        .select('id')
        .eq('id', siteIdInput)
        .eq('customer_id', customerId)
        .maybeSingle()
      if (!site) return new Response('Chosen site does not belong to that customer', { status: 400 })
      siteId = site.id
    } else {
      const { data: existingSite } = await admin
        .from('sites')
        .select('id')
        .eq('customer_id', customerId)
        .order('created_at')
        .limit(1)
        .maybeSingle()
      if (existingSite) {
        siteId = existingSite.id
      } else {
        const { data: newSite, error: siteError } = await admin
          .from('sites')
          .insert({
            customer_id: customerId,
            name: `${customer.full_name} - Site 1`,
            address: '',
            system_type: 'Solar PV',
            status: 'pending',
          })
          .select('id')
          .single()
        if (siteError || !newSite) {
          return new Response(`Could not create site: ${siteError?.message ?? 'unknown error'}`, { status: 500 })
        }
        siteId = newSite.id
      }
    }
  }

  const { data: job, error: jobError } = await admin
    .from('jobs')
    .insert({
      assigned_to: assignee.id,
      created_by: user.id,
      site_id: siteId,
      title,
      description: description || null,
      scheduled_date: scheduledDate || null,
      stage,
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
