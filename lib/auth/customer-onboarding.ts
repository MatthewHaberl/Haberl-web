import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOrCreateCustomer, normalizeEmail } from '@/lib/customers/resolve'
import { inviteCustomer, type InvitableCustomer } from '@/lib/customers/invite'

/**
 * Quote-acceptance onboarding. Accepting a quote online is a strong enough
 * signal to onboard the customer automatically, so this resolves (or creates)
 * the CRM customer record for the quote and sends them a portal invite.
 *
 * Every OTHER way a customer is created (lead conversion, manual entry, quote
 * draft) does NOT call this — those customers receive no account email until
 * staff press "Send invite". See lib/customers/invite.ts.
 *
 * `supabase` is the service-role client (the public accept route uses it).
 */

export type CustomerPortalAccess =
  | {
      ok: true
      status: 'existing' | 'invited'
      email: string
      customerName: string
      actionUrl: string
      profileId: string | null
    }
  | {
      ok: true
      status: 'skipped'
      reason: string
    }
  | {
      ok: false
      status: 'failed'
      error: string
    }

async function loadCustomer(supabase: SupabaseClient, id: string): Promise<InvitableCustomer | null> {
  const { data } = await supabase
    .from('customers')
    .select('id, full_name, email, phone, auth_user_id, registered_at')
    .eq('id', id)
    .maybeSingle()
  return (data as InvitableCustomer | null) ?? null
}

export async function ensureCustomerPortalAccess(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: Record<string, any>,
  baseUrl: string,
): Promise<CustomerPortalAccess> {
  const email = normalizeEmail(quote.customer_email)

  try {
    // Resolve the customer for this quote. Quotes created via the new flow
    // already carry customer_id; older / external ones are resolved by email.
    let customerId: string | null = quote.customer_id ?? null
    if (!customerId) {
      if (!email) {
        return { ok: true, status: 'skipped', reason: 'Quote has no valid customer email' }
      }
      const resolved = await resolveOrCreateCustomer(supabase, {
        full_name: quote.customer_name,
        email,
        phone: quote.customer_phone,
        address: quote.customer_address ?? quote.address,
        is_business: quote.is_business ?? false,
        contact_name: quote.contact_name,
        source: 'quote',
      })
      customerId = resolved.id
      // Best-effort backlink so the quote and customer stay joined.
      await supabase.from('quote_requests').update({ customer_id: customerId }).eq('id', quote.id)
    }

    const customer = customerId ? await loadCustomer(supabase, customerId) : null
    if (!customer) {
      return { ok: false, status: 'failed', error: 'Could not resolve a customer record for this quote' }
    }

    const result = await inviteCustomer(supabase, customer, baseUrl)

    if (result.status === 'skipped') return { ok: true, status: 'skipped', reason: result.reason }
    if (!result.ok) return { ok: false, status: 'failed', error: result.error }

    return {
      ok: true,
      status: result.status,
      email: result.email,
      customerName: result.customerName,
      actionUrl: result.actionUrl,
      profileId: result.authUserId,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Customer onboarding failed',
    }
  }
}
