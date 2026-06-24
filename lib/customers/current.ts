import { cache } from 'react'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * The customer record for the logged-in user, or null if they have none.
 *
 * Customer-portal pages resolve their data through this (sites, quotes, …)
 * instead of keying off auth.uid() directly, because a customer is now a
 * separate record linked to the login via auth_user_id. Mirrors the
 * current_customer_id() SQL helper used by RLS.
 *
 * Cached per request so layout + page share one lookup.
 */
export const getCurrentCustomer = cache(async () => {
  const user = await getUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data
})

export async function getCurrentCustomerId(): Promise<string | null> {
  const customer = await getCurrentCustomer()
  return customer?.id ?? null
}
