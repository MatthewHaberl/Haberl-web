import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAdminNotice } from '@/lib/email/quotes'
import { getBaseUrl, getCompanySettings } from '@/lib/quotes/server'

export const runtime = 'nodejs'

/** Public lead capture (name/phone/suburb). Honeypot-guarded, service-role insert. */
export async function POST(req: Request) {
  let body: { name?: string; phone?: string; suburb?: string; note?: string; website?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request', { status: 400 })
  }

  // Honeypot: bots fill the hidden field — accept silently, store nothing
  if (body.website && String(body.website).trim().length > 0) {
    return NextResponse.json({ ok: true })
  }

  const name = String(body.name ?? '').trim().slice(0, 120)
  const phone = String(body.phone ?? '').trim().slice(0, 30)
  const phoneDigits = phone.replace(/\D/g, '')
  if (name.length < 2) return new Response('Please give us your name', { status: 400 })
  if (phoneDigits.length < 9) return new Response('Please give us a valid phone number', { status: 400 })

  const suburb = String(body.suburb ?? '').trim().slice(0, 120) || null
  const note = String(body.note ?? '').trim().slice(0, 1000) || null

  const supabase = createAdminClient()
  const { error } = await supabase.from('leads').insert({ name, phone, suburb, note, source: 'website' })
  if (error) {
    console.error('[public/leads]', error)
    return new Response('Could not save your request — please call us instead', { status: 500 })
  }

  try {
    const settings = await getCompanySettings(supabase)
    await sendAdminNotice(
      settings?.contact_email ?? null,
      `New website lead — ${name}`,
      [
        `<strong>${name}</strong> requested a callback.`,
        `Phone: <a href="tel:${phoneDigits}">${phone}</a>`,
        ...(suburb ? [`Suburb: ${suburb}`] : []),
        ...(note ? [`Note: ${note}`] : []),
      ],
      `${getBaseUrl()}/portal/employee/quotes`,
      'Open quotes & leads',
    )
  } catch (err) {
    console.error('[public/leads] admin notice failed', err)
  }

  return NextResponse.json({ ok: true })
}
