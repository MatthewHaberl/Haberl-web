import { NextResponse } from 'next/server'
import { sendAdminNotice } from '@/lib/email/quotes'
import { parseBriefingRecipients } from '@/lib/quotes/daily-briefing'
import { publicQuoteState } from '@/lib/quotes/public'
import { getBaseUrl, getClientIp, getCompanySettings, getQuoteByToken } from '@/lib/quotes/server'
import { normalizePhone } from '@/lib/customers/phone'
import { checkIpRateLimit, escapeHtml } from '@/lib/public/throttle'

export const runtime = 'nodejs'

const MAX_PER_PHONE_DAY = 3

/**
 * "This quote is no longer current — send me an updated one." Lands as a normal
 * lead so it shows up on the staff to-do list and gets chased like any other,
 * tagged back to the quote it came from and assigned to whoever quoted them.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { supabase, quote } = await getQuoteByToken(token)
  if (!quote) return new Response('Quote not found', { status: 404 })

  // A live quote doesn't need renewing — accepting it is still the right action.
  const state = publicQuoteState(quote)
  if (state === 'open' || state === 'accepted') {
    return new Response('This quote is still current — open it to accept', { status: 409 })
  }

  let body: { name?: string; phone?: string; email?: string; address?: string; note?: string; website?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request', { status: 400 })
  }

  // Honeypot: bots fill the hidden field; accept silently and store nothing.
  if (body.website && String(body.website).trim().length > 0) {
    return NextResponse.json({ ok: true })
  }

  if (!checkIpRateLimit(getClientIp(req))) {
    return new Response('Too many requests — please try again shortly', { status: 429 })
  }

  const name = String(body.name ?? '').trim().slice(0, 120)
  const phone = String(body.phone ?? '').trim().slice(0, 30)
  const phoneDigits = phone.replace(/\D/g, '')
  if (name.length < 2) return new Response('Please give us your name', { status: 400 })
  if (phoneDigits.length < 9) return new Response('Please give us a valid phone number', { status: 400 })

  const email = String(body.email ?? '').trim().slice(0, 200) || null
  const address = String(body.address ?? '').trim().slice(0, 200) || null
  const note = String(body.note ?? '').trim().slice(0, 1000) || null

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentPhoneCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('phone_normalized', normalizePhone(phone))
    .gte('created_at', since)
  if ((recentPhoneCount ?? 0) >= MAX_PER_PHONE_DAY) {
    return new Response('We already have your request — we will contact you shortly', { status: 429 })
  }

  const previous = quote.quote_number ? `quote ${quote.quote_number}` : 'an earlier quote'
  const leadNote = [
    `Asked for an updated version of ${previous}.`,
    email ? `Email: ${email}` : null,
    note,
  ].filter(Boolean).join('\n')

  const { error } = await supabase.from('leads').insert({
    name,
    phone,
    suburb: address,
    note: leadNote,
    source: 'requote',
    customer_id: quote.customer_id ?? null,
    // Back to whoever quoted them last — they already know the site.
    owner_id: quote.generated_by ?? quote.submitted_by ?? null,
  })
  if (error) {
    console.error('[public/renew]', error)
    return new Response('Could not save your request — please call us instead', { status: 500 })
  }

  // They're clearly active again: un-archive the customer so this request can't
  // be filtered off the to-do list as archived work.
  if (quote.customer_id) {
    const { error: reviveError } = await supabase
      .from('customers')
      .update({ archived_at: null, archived_by: null })
      .eq('id', quote.customer_id)
      .not('archived_at', 'is', null)
    if (reviveError) console.error('[public/renew] customer revive', reviveError)
  }

  try {
    const settings = await getCompanySettings(supabase)
    await sendAdminNotice(
      parseBriefingRecipients(settings?.briefing_emails, settings?.contact_email),
      `Updated quote requested — ${name.replace(/[\r\n]/g, ' ')}`,
      [
        `<strong>${escapeHtml(name)}</strong> followed an old quote link and asked for fresh pricing.`,
        `Previous: <strong>${escapeHtml(quote.quote_number ?? 'unnumbered quote')}</strong> (${state})`,
        `Phone: <a href="tel:${phoneDigits}">${escapeHtml(phone)}</a>`,
        ...(email ? [`Email: ${escapeHtml(email)}`] : []),
        ...(address ? [`Address: ${escapeHtml(address)}`] : []),
        ...(note ? [`What changed: ${escapeHtml(note)}`] : []),
      ],
      `${getBaseUrl()}/portal/employee/leads`,
      'Open leads — call now',
    )
  } catch (err) {
    console.error('[public/renew] admin notice failed', err)
  }

  return NextResponse.json({ ok: true })
}
