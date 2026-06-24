import type { SupabaseClient, User } from '@supabase/supabase-js'
import { normalizeEmail } from './resolve'

/**
 * Sending a customer their portal invite is the ONE account email that is
 * gated: it never fires automatically when a customer is created from a lead,
 * a manual entry, or a quote draft. It is triggered explicitly — from the
 * "Send invite" button on the customer page, or automatically when a customer
 * accepts a quote online (a strong enough signal to onboard them).
 *
 * The actual email is sent by the caller (via sendCustomerPortalOnboardingEmail)
 * using the returned actionUrl. This function only mints the link and links the
 * auth user to the customer record.
 */

export type InviteResult =
  | { ok: true; status: 'invited'; email: string; customerName: string; actionUrl: string; authUserId: string | null }
  | { ok: true; status: 'existing'; email: string; customerName: string; actionUrl: string; authUserId: string | null }
  | { ok: true; status: 'skipped'; reason: string }
  | { ok: false; status: 'failed'; error: string }

export interface InvitableCustomer {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  auth_user_id: string | null
  registered_at: string | null
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 3; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) return null
    const match = data.users.find((u) => u.email?.toLowerCase() === email)
    if (match) return match
    if (data.users.length < 100) return null
  }
  return null
}

/**
 * Mint a portal invite (or recovery) link for a customer and link the auth
 * user to the customer record. `admin` MUST be the service-role client.
 */
export async function inviteCustomer(
  admin: SupabaseClient,
  customer: InvitableCustomer,
  baseUrl: string,
): Promise<InviteResult> {
  const email = normalizeEmail(customer.email)
  if (!email) {
    return { ok: true, status: 'skipped', reason: 'Customer has no valid email — add one before inviting.' }
  }

  const customerName = (customer.full_name ?? '').trim() || 'there'
  const base = baseUrl.replace(/\/$/, '')
  const redirectTo = `${base}/auth/set-password?next=/portal`
  const portalUrl = `${base}/portal`

  // An already-verified customer doesn't need an invite — point them at login.
  if (customer.registered_at) {
    return { ok: true, status: 'existing', email, customerName, actionUrl: portalUrl, authUserId: customer.auth_user_id }
  }

  // Determine whether an auth user already exists (linked, or a stray match).
  let authUserId = customer.auth_user_id
  if (!authUserId) {
    const existing = await findAuthUserByEmail(admin, email)
    if (existing) authUserId = existing.id
  }

  let actionUrl = redirectTo
  if (!authUserId) {
    // Brand new — invite creates the auth user. Metadata carries customer_id
    // so the handle_new_user trigger links it (we also link below to be sure).
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: { full_name: customerName, phone: customer.phone ?? undefined, customer_id: customer.id },
      },
    })
    if (error) return { ok: false, status: 'failed', error: error.message }
    authUserId = data.user?.id ?? null
    actionUrl = data.properties?.action_link ?? redirectTo
  } else {
    // Auth user already exists (invited before, or matched by email) — send a
    // recovery link so they can (re)set their password.
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
    if (error) return { ok: false, status: 'failed', error: error.message }
    actionUrl = data.properties?.action_link ?? redirectTo
  }

  const { error: linkError } = await admin
    .from('customers')
    .update({ auth_user_id: authUserId, invited_at: new Date().toISOString() })
    .eq('id', customer.id)
  if (linkError) return { ok: false, status: 'failed', error: linkError.message }

  return { ok: true, status: 'invited', email, customerName, actionUrl, authUserId }
}
