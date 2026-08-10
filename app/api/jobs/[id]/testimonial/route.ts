import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/quotes/server'
import { getJobCustomerContact } from '@/lib/testimonials/server'
import { sendTestimonialRequest } from '@/lib/email/testimonials'

export const runtime = 'nodejs'

/** Staff-only: only a manager or admin may ask a customer for a testimonial. */
async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Not signed in', { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') {
    return { error: new Response('Not allowed', { status: 403 }) }
  }
  return { user }
}

/**
 * Request a testimonial for a job (S7).
 *
 * Idempotent by design: the unique index on job_id means one job has one
 * request and one link forever, so pressing the button twice re-sends the same
 * link rather than creating a second row the customer could fill in twice.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const { error: authError } = await requireStaff()
  if (authError) return authError

  const admin = createAdminClient()
  const contact = await getJobCustomerContact(jobId)

  const { data: existing } = await admin
    .from('job_testimonials')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle()

  // Already submitted — don't pester someone who has already done the favour.
  if (existing?.status === 'submitted' || existing?.status === 'approved') {
    return NextResponse.json({ ok: true, alreadySubmitted: true, testimonial: existing })
  }

  let row = existing
  if (!row) {
    const { data, error } = await admin
      .from('job_testimonials')
      .insert({ job_id: jobId, customer_id: contact.customerId })
      .select('*')
      .single()
    if (error || !data) {
      console.error('[testimonial/request] insert', error)
      return new Response('Could not create the request', { status: 500 })
    }
    row = data
  } else {
    // A repeat press is a reminder — stamped so we can see it was chased.
    await admin
      .from('job_testimonials')
      .update({ reminded_at: new Date().toISOString() })
      .eq('id', row.id)
  }

  if (!contact.email) {
    // The link still exists and can be shared by hand (WhatsApp, in person).
    return NextResponse.json({
      ok: true, emailed: false,
      reason: 'No email address on this job — copy the link and send it yourself.',
      testimonial: row,
    })
  }

  const result = await sendTestimonialRequest({
    to: contact.email,
    customerName: contact.name,
    token: row.share_token,
    baseUrl: getBaseUrl(),
    reminder: Boolean(existing),
  })

  return NextResponse.json({
    ok: true,
    emailed: result.sent,
    reason: result.error,
    testimonial: row,
  })
}

/** Staff review: approve / decline / publish, or edit the internal note. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const { user, error: authError } = await requireStaff()
  if (authError) return authError

  const body = await req.json().catch(() => ({})) as {
    status?: 'approved' | 'declined'
    published?: boolean
    internal_notes?: string
  }

  const patch: Record<string, unknown> = {}
  if (body.status === 'approved' || body.status === 'declined') {
    patch.status = body.status
    patch.reviewed_at = new Date().toISOString()
    patch.reviewed_by = user!.id
    // Declining always unpublishes — a rejected testimonial must not stay live.
    if (body.status === 'declined') patch.published = false
  }
  if (typeof body.published === 'boolean') patch.published = body.published
  if (typeof body.internal_notes === 'string') patch.internal_notes = body.internal_notes
  if (Object.keys(patch).length === 0) return new Response('Nothing to update', { status: 400 })

  const admin = createAdminClient()

  // Publishing is gated on the customer's own consent, not on staff opinion —
  // the whole point of storing consent separately is that it can veto this.
  if (patch.published === true) {
    const { data: current } = await admin
      .from('job_testimonials')
      .select('consent_publish')
      .eq('job_id', jobId)
      .maybeSingle()
    if (!current?.consent_publish) {
      return new Response('This customer did not agree to their review being published', { status: 409 })
    }
  }

  const { data, error } = await admin
    .from('job_testimonials')
    .update(patch)
    .eq('job_id', jobId)
    .select('*')
    .single()
  if (error) {
    console.error('[testimonial/review] update', error)
    return new Response('Could not save', { status: 500 })
  }
  return NextResponse.json({ ok: true, testimonial: data })
}
