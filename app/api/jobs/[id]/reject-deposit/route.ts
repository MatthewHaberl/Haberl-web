import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendProofRejectedEmail } from '@/lib/email/quotes'
import { getBaseUrl } from '@/lib/quotes/server'

export const runtime = 'nodejs'

/**
 * Manager declines an uploaded proof of payment (wrong amount, missing
 * reference, unreadable file, or funds not reflected). Clears the live proof
 * pointer so the customer's quote page reverts to the upload prompt and the job
 * drops off the "deposits to confirm" briefing, retains the declined file path
 * as evidence, and emails the customer to upload a new one. The job stays in
 * deposit_pending — nothing advances.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden — only managers can decline deposits', { status: 403 })
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, quote_request_id, deposit_proof_url, deposit_confirmed_at')
    .eq('id', id)
    .maybeSingle()
  if (!job) return new Response('Job not found', { status: 404 })
  if (job.deposit_confirmed_at) {
    return new Response('This deposit is already confirmed — it cannot be declined', { status: 409 })
  }
  if (!job.deposit_proof_url) {
    return new Response('There is no proof of payment to decline', { status: 409 })
  }

  let body: { reason?: string }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const reason = String(body.reason ?? '').trim().slice(0, 500) || null

  const { error } = await supabase
    .from('jobs')
    .update({
      deposit_proof_rejected_at: new Date().toISOString(),
      deposit_proof_rejected_by: user.id,
      deposit_proof_rejected_reason: reason,
      deposit_proof_rejected_url: job.deposit_proof_url,
      deposit_proof_url: null,
      deposit_proof_uploaded_at: null,
    })
    .eq('id', id)
  if (error) return new Response(error.message, { status: 400 })

  // Ask-for-new-proof email — best effort, never blocks the decline
  let emailSent = false
  if (job.quote_request_id) {
    try {
      const { data: quote } = await supabase
        .from('quote_requests')
        .select('customer_name, customer_email, quote_number, total_amount, deposit_amount, share_token, expiry_date')
        .eq('id', job.quote_request_id)
        .maybeSingle()
      if (quote) {
        const result = await sendProofRejectedEmail(quote, reason, getBaseUrl())
        emailSent = result.sent
      }
    } catch (err) {
      console.error('[reject-deposit] re-request email failed', err)
    }
  }

  return NextResponse.json({ ok: true, emailSent })
}
