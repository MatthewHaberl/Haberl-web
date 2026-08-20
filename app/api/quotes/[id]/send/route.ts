import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteEmail } from '@/lib/email/quotes'
import { getBaseUrl } from '@/lib/quotes/server'
import { snapshotQuoteVersion } from '@/lib/quotes/versions'

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

  let body: {
    manual?: boolean
    resend?: boolean
    amendmentReason?: string
    /** How it actually went out, for the record (migration 127). */
    method?: 'email' | 'whatsapp' | 'manual'
  } = {}
  try {
    body = await req.json()
  } catch { /* empty body is fine */ }

  const { data: quote } = await supabase
    .from('quote_requests').select('*').eq('id', id).maybeSingle()
  if (!quote) return new Response('Quote not found', { status: 404 })
  // The share link is closed for archived/deleted quotes, so emailing one would
  // send the customer to a dead end. Restore it first.
  if (quote.archived_at) {
    return new Response('This quote is archived — restore it before sending', { status: 409 })
  }
  if (quote.deleted_at) {
    return new Response('This quote is deleted — restore it before sending', { status: 409 })
  }
  if (!quote.quote_html) {
    return new Response('Generate and save the quote first', { status: 400 })
  }

  /**
   * Why this send differs from the last one. Typed at reissue time and parked
   * on the row (migration 127) so it survives the reload between reissuing and
   * sending; an explicit reason in the request still wins.
   */
  const amendmentReason = body.amendmentReason?.trim() || quote.amendment_reason || null

  /**
   * How it went out. 'manual' covers copy-link and handing it over; the client
   * says 'whatsapp' when it opened a chat, because "they never got it" is
   * answered very differently for a WhatsApp share than for an email.
   */
  const sentMethod: 'email' | 'whatsapp' | 'manual' =
    body.method ?? (body.manual ? 'manual' : 'email')

  const sendRecord = {
    sent_at: new Date().toISOString(),
    sent_method: sentMethod,
    sent_by: user.id,
    // The reason has now been recorded against a version — it must not attach
    // itself to the NEXT send as well.
    amendment_reason: null,
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
      .update(sendRecord)
      .eq('id', id)
    // A resend of unchanged content is the SAME document sent twice, so this
    // returns the existing version rather than minting one. If the quote was
    // edited since, it correctly records the amendment (W56).
    const resendVersion = await snapshotQuoteVersion(quote, {
      sentBy: user.id,
      amendmentReason,
    })
    return NextResponse.json({ ok: true, sent: true, resent: true, shareUrl, version: resendVersion.version })
  }

  async function markSent() {
    return supabase
      .from('quote_requests')
      .update({ status: 'sent', expiry_date: expiryDate, ...sendRecord })
      .eq('id', id)
  }

  /**
   * Archive what the customer was just sent (W56). Best-effort by design: the
   * quote has already gone out, so a failed snapshot is logged, not surfaced as
   * a send failure.
   */
  async function recordVersion() {
    const result = await snapshotQuoteVersion(quote, {
      sentBy: user!.id,
      expiryDate,
      amendmentReason,
    })
    if (result.error) console.error('[quotes/send] version snapshot', { id, error: result.error })
    return result
  }

  if (body.manual) {
    const { error } = await markSent()
    if (error) return new Response(error.message, { status: 400 })
    const version = await recordVersion()
    return NextResponse.json({ ok: true, sent: false, manual: true, shareUrl, version: version.version })
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
  const version = await recordVersion()
  return NextResponse.json({ ok: true, sent: true, shareUrl, version: version.version })
}
