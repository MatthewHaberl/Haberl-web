import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { inviteCustomer, type InvitableCustomer } from '@/lib/customers/invite'
import { sendCustomerPortalOnboardingEmail } from '@/lib/email/quotes'
import { getBaseUrl } from '@/lib/quotes/server'

export const runtime = 'nodejs'

/**
 * Manually send (or resend) a customer their portal invite. This is the gated
 * account email: customers created from leads, manual entry, or quote drafts
 * receive nothing until staff trigger it here.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const admin = createAdminClient()
  const { data: customer } = await admin
    .from('customers')
    .select('id, full_name, email, phone, auth_user_id, registered_at')
    .eq('id', id)
    .maybeSingle()
  if (!customer) return new Response('Customer not found', { status: 404 })

  const result = await inviteCustomer(admin, customer as InvitableCustomer, getBaseUrl())

  if (result.status === 'skipped') {
    return NextResponse.json({ error: result.reason }, { status: 400 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  if (result.status === 'existing') {
    return NextResponse.json({ ok: true, status: 'existing', message: 'This customer has already registered.' })
  }

  const email = await sendCustomerPortalOnboardingEmail({
    customerEmail: result.email,
    customerName: result.customerName,
    quoteNumber: null,
    actionUrl: result.actionUrl,
    isInvite: true,
  })

  if (!email.sent) {
    // The auth user + invite link exist; only the email failed. Surface the
    // link so staff can share it directly (same fallback as quote sending).
    return NextResponse.json(
      { ok: true, status: 'invited', sent: false, actionUrl: result.actionUrl, warning: email.error },
    )
  }

  return NextResponse.json({ ok: true, status: 'invited', sent: true })
}
