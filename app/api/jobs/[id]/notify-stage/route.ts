import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendJobStageEmail } from '@/lib/email/jobs'

export const runtime = 'nodejs'

/**
 * Fire a customer-facing email for a job's CURRENT stage (read from the DB, not
 * trusted from the client). Best-effort: called fire-and-forget from the stage
 * pipeline after a stage change. Only the notable stages actually send.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['field_worker', 'manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, stage, scheduled_date, quote_request_id')
    .eq('id', id)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  let customer: { customer_name: string | null; customer_email: string | null; quote_number: string | null } = {
    customer_name: null, customer_email: null, quote_number: null,
  }
  if (job.quote_request_id) {
    const { data: qr } = await supabase
      .from('quote_requests')
      .select('customer_name, customer_email, quote_number')
      .eq('id', job.quote_request_id)
      .maybeSingle()
    if (qr) customer = qr
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
  const result = await sendJobStageEmail(job.stage, {
    customer_name: customer.customer_name,
    customer_email: customer.customer_email,
    quote_number: customer.quote_number,
    scheduled_date: job.scheduled_date,
  }, baseUrl)

  return NextResponse.json({ ok: true, sent: result.sent })
}
