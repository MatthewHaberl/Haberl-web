import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * Called by the set-password page once a customer has set their password (i.e.
 * verified). Stamps registered_at on their customer record, flipping their
 * account status from "Invited" to "Registered". Idempotent.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  // Link by auth id, or by email if the trigger hasn't linked yet.
  const { data: linked, error: linkErr } = await admin
    .from('customers')
    .update({ registered_at: new Date().toISOString() })
    .eq('auth_user_id', user.id)
    .is('registered_at', null)
    .select('id')
  if (linkErr) console.error('[customers/me/confirm] link by auth id', linkErr)

  let linkedByEmail = false
  if ((linked?.length ?? 0) === 0 && user.email) {
    const { data: emailLinked, error: emailErr } = await admin
      .from('customers')
      .update({ auth_user_id: user.id, registered_at: new Date().toISOString() })
      .ilike('email', user.email)
      .is('auth_user_id', null)
      .select('id')
    if (emailErr) console.error('[customers/me/confirm] link by email', emailErr)
    linkedByEmail = (emailLinked?.length ?? 0) > 0
  }

  // `linked` tells the set-password page whether the account actually attached to
  // a customer record — a silent failure here otherwise looks like success while
  // the customer's portal shows no sites/jobs.
  const linkedOk = (linked?.length ?? 0) > 0 || linkedByEmail
  return NextResponse.json({ ok: true, linked: linkedOk })
}
