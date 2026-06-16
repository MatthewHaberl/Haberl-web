import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteEmail } from '@/lib/email/quotes'
import { getBaseUrl } from '@/lib/quotes/server'

export const runtime = 'nodejs'

/**
 * Send the quote to the customer: emails the tokenized public link, stamps
 * expiry, and flips status to 'sent'. `{ manual: true }` skips the email for
 * WhatsApp/in-person sharing but still stamps sent + expiry.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  let body: { manual?: boolean; resend?: boolean } = {}
  try {
    body = await req.json()
  } catch { /* empty body is fine */ }

  const { data: quote } = await supabase
    .from('quote_requests').select('*').eq('id', id).maybeSingle()
  if (!quote) return new Response('Quote not found', { status: 404 })
  if (!quote.quote_html) {
    return new Response('Generate and save the quote first', { status: 400 })
  }

  const { data: settings } = await supabase
    .from('company_settings').select('quote_expiry_days').eq('id', true).maybeSingle()
  const expiryDays = settings?.quote_expiry_days ?? 30
  const expiryDate = new Date(Date.now() + expiryDays * 86_400_000).toISOString().slice(0, 10)
  const shareUrl = `${getBaseUrl()}/q/${quote.share_token}`

  // Resend: re-email the existing quote as-is, without changing its status or
  // expiry. Lets an already sent / accepted / declined quote be emailed again.
  if (body.resend) {
    if (!quote.customer_email) {
      return NextResponse.json(
        { error: 'No customer email on this quote — use Copy link to share it yourself.', shareUrl },
        { status: 400 },
      )
    }
    const resendResult = await sendQuoteEmail(quote, getBaseUrl())
    if (!resendResult.sent) {
      return NextResponse.json({ error: resendResult.error ?? 'Email failed', shareUrl }, { status: 502 })
    }
    await supabase
      .from('quote_requests')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ ok: true, sent: true, resent: true, shareUrl })
  }

  async function markSent() {
    return supabase
      .from('quote_requests')
      .update({ status: 'sent', sent_at: new Date().toISOString(), expiry_date: expiryDate })
      .eq('id', id)
  }

  if (body.manual) {
    const { error } = await markSent()
    if (error) return new Response(error.message, { status: 400 })
    return NextResponse.json({ ok: true, sent: false, manual: true, shareUrl })
  }

  if (!quote.customer_email) {
    return NextResponse.json(
      { error: 'No customer email on this quote — add it in the survey, or use "Mark as sent" and share the link yourself.', shareUrl },
      { status: 400 },
    )
  }

  const result = await sendQuoteEmail({ ...quote, expiry_date: expiryDate }, getBaseUrl())
  if (!result.sent) {
    return NextResponse.json(
      { error: result.error ?? 'Email failed', shareUrl },
      { status: 502 },
    )
  }

  const { error } = await markSent()
  if (error) return new Response(error.message, { status: 400 })
  return NextResponse.json({ ok: true, sent: true, shareUrl })
}
