import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendDepositReceiptEmail } from '@/lib/email/quotes'

export const runtime = 'nodejs'

/**
 * Manager confirms the EFT deposit landed. Advances deposit_pending →
 * procurement (the jobs trigger logs the stage change to the customer
 * timeline) and emails the customer a receipt.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden — only managers can confirm deposits', { status: 403 })
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, stage, quote_request_id, deposit_confirmed_at')
    .eq('id', id)
    .maybeSingle()
  if (!job) return new Response('Job not found', { status: 404 })
  if (job.deposit_confirmed_at) return NextResponse.json({ ok: true, alreadyConfirmed: true })

  const { error } = await supabase
    .from('jobs')
    .update({
      deposit_confirmed_at: new Date().toISOString(),
      deposit_confirmed_by: user.id,
      ...(job.stage === 'deposit_pending' ? { stage: 'procurement' } : {}),
    })
    .eq('id', id)
  if (error) return new Response(error.message, { status: 400 })

  // Receipt email — best effort, never blocks the confirmation
  let emailSent = false
  if (job.quote_request_id) {
    try {
      const { data: quote } = await supabase
        .from('quote_requests')
        .select('customer_name, customer_email, quote_number, total_amount, deposit_amount, share_token, expiry_date')
        .eq('id', job.quote_request_id)
        .maybeSingle()
      if (quote) {
        const result = await sendDepositReceiptEmail(quote)
        emailSent = result.sent
      }
    } catch (err) {
      console.error('[confirm-deposit] receipt email failed', err)
    }
  }

  return NextResponse.json({ ok: true, emailSent })
}
