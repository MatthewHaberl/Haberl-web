import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAdminNotice } from '@/lib/email/quotes'
import { getBaseUrl, getClientIp, getCompanySettings } from '@/lib/quotes/server'
import { parseBriefingRecipients } from '@/lib/quotes/daily-briefing'
import { normalizePhone } from '@/lib/customers/phone'

export const runtime = 'nodejs'

const IP_WINDOW_MS = 60_000
const MAX_LEADS_PER_IP_WINDOW = 5
const MAX_LEADS_PER_PHONE_DAY = 3
const ipHits = new Map<string, number[]>()

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function checkIpRateLimit(ip: string) {
  const now = Date.now()
  const recent = (ipHits.get(ip) ?? []).filter((timestamp) => now - timestamp < IP_WINDOW_MS)
  if (recent.length >= MAX_LEADS_PER_IP_WINDOW) return false
  ipHits.set(ip, [...recent, now])
  return true
}

/** Public lead capture (name/phone/suburb). Honeypot-guarded, service-role insert. */
export async function POST(req: Request) {
  let body: { name?: string; phone?: string; suburb?: string; note?: string; website?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request', { status: 400 })
  }

  // Honeypot: bots fill the hidden field; accept silently and store nothing.
  if (body.website && String(body.website).trim().length > 0) {
    return NextResponse.json({ ok: true })
  }

  const ip = getClientIp(req)
  if (!checkIpRateLimit(ip)) {
    return new Response('Too many requests - please try again shortly', { status: 429 })
  }

  const name = String(body.name ?? '').trim().slice(0, 120)
  const phone = String(body.phone ?? '').trim().slice(0, 30)
  const phoneDigits = phone.replace(/\D/g, '')
  if (name.length < 2) return new Response('Please give us your name', { status: 400 })
  if (phoneDigits.length < 9) return new Response('Please give us a valid phone number', { status: 400 })

  const suburb = String(body.suburb ?? '').trim().slice(0, 120) || null
  const note = String(body.note ?? '').trim().slice(0, 1000) || null

  const supabase = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  // Throttle on the canonical number so "079 033 6247" and "0790336247" count
  // as the same person rather than slipping past as two.
  const { count: recentPhoneCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('phone_normalized', normalizePhone(phone))
    .gte('created_at', since)

  if ((recentPhoneCount ?? 0) >= MAX_LEADS_PER_PHONE_DAY) {
    return new Response('We already have your request - we will contact you shortly', { status: 429 })
  }

  const { error } = await supabase.from('leads').insert({ name, phone, suburb, note, source: 'website' })
  if (error) {
    console.error('[public/leads]', error)
    return new Response('Could not save your request - please call us instead', { status: 500 })
  }

  try {
    const settings = await getCompanySettings(supabase)
    const safeName = escapeHtml(name)
    const safePhone = escapeHtml(phone)
    const safeSuburb = suburb ? escapeHtml(suburb) : null
    const safeNote = note ? escapeHtml(note) : null

    await sendAdminNotice(
      parseBriefingRecipients(settings?.briefing_emails, settings?.contact_email),
      `New website lead - ${name.replace(/[\r\n]/g, ' ')}`,
      [
        `<strong>${safeName}</strong> requested a callback.`,
        `Phone: <a href="tel:${phoneDigits}">${safePhone}</a>`,
        ...(safeSuburb ? [`Suburb: ${safeSuburb}`] : []),
        ...(safeNote ? [`Note: ${safeNote}`] : []),
        `<span style="color:#6b7280;">Calling back within ~5 minutes dramatically improves your odds of reaching them.</span>`,
      ],
      `${getBaseUrl()}/portal/employee/leads`,
      'Open leads — call now',
    )
  } catch (err) {
    console.error('[public/leads] admin notice failed', err)
  }

  return NextResponse.json({ ok: true })
}
