import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPasswordResetEmail } from '@/lib/email/auth'
import { normalizeEmail } from '@/lib/customers/resolve'
import { getBaseUrl, getClientIp } from '@/lib/quotes/server'

export const runtime = 'nodejs'

const IP_WINDOW_MS = 60_000
const MAX_PER_IP_WINDOW = 5
const ipHits = new Map<string, number[]>()

function checkIpRateLimit(ip: string) {
  const now = Date.now()
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS)
  if (recent.length >= MAX_PER_IP_WINDOW) return false
  ipHits.set(ip, [...recent, now])
  return true
}

/**
 * Public password-reset request. Mints a Supabase recovery link server-side and
 * emails it via Resend — the reliable path the invite flow already uses, NOT
 * Supabase's built-in auth SMTP (rate-limited, won't reach external inboxes).
 *
 * Always responds 200 with the same body whether or not the account exists, so
 * the endpoint can't be used to enumerate registered emails.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req)
  if (!checkIpRateLimit(ip)) {
    return new Response('Too many requests — please try again shortly', { status: 429 })
  }

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request', { status: 400 })
  }

  const email = normalizeEmail(body.email)
  if (!email) {
    // Don't reveal validation outcome — same generic success either way.
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()
  const redirectTo = `${getBaseUrl()}/auth/reset-password`

  // generateLink returns an error if no auth user exists for this email — we
  // swallow it so the response is identical for known and unknown addresses.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (error || !data?.properties?.action_link) {
    if (error) console.warn('[forgot-password] no reset link minted:', error.message)
    return NextResponse.json({ ok: true })
  }

  // Best-effort name for the greeting; never blocks the reset.
  const { data: customer } = await admin
    .from('customers')
    .select('full_name')
    .ilike('email', email)
    .maybeSingle()

  const sendResult = await sendPasswordResetEmail({
    email,
    name: customer?.full_name ?? null,
    actionUrl: data.properties.action_link,
  })

  if (!sendResult.sent) {
    console.error('[forgot-password] reset email failed to send:', sendResult.error)
  }

  return NextResponse.json({ ok: true })
}
