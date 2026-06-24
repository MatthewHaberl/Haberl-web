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
  const { data: linked } = await admin
    .from('customers')
    .update({ registered_at: new Date().toISOString() })
    .eq('auth_user_id', user.id)
    .is('registered_at', null)
    .select('id')

  if ((linked?.length ?? 0) === 0 && user.email) {
    await admin
      .from('customers')
      .update({ auth_user_id: user.id, registered_at: new Date().toISOString() })
      .ilike('email', user.email)
      .is('auth_user_id', null)
  }

  return NextResponse.json({ ok: true })
}
