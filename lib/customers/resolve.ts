import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from './phone'

/**
 * Resolve a customer record for a contact, creating one if none exists.
 *
 * Matching order:
 *   1. by email (case-insensitive) — the strongest key when present
 *   2. by normalized phone — catches leads / phone-only prospects, where the
 *      same number written with or without spaces would otherwise duplicate
 *   3. otherwise create a fresh record
 *
 * Used wherever a customer first enters the system as a real contact:
 * converting a lead, drafting a quote, or accepting a quote online. Callers
 * pass an RLS-scoped client (staff context) or the service-role client.
 */

export interface CustomerInput {
  full_name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  is_business?: boolean | null
  contact_name?: string | null
  notes?: string | null
  source?: string
  created_by?: string | null
}

export function normalizeEmail(email: unknown): string | null {
  const normalized = String(email ?? '').trim().toLowerCase()
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  return normalized
}

export async function findCustomerByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (error) throw error
  return (data as { id: string } | null) ?? null
}

/**
 * Match by canonical phone (customers.phone_normalized, migration 053).
 * limit(1) keeps this safe even while duplicate numbers still exist in the
 * data — it returns one match rather than erroring on "multiple rows".
 */
export async function findCustomerByPhone(
  supabase: SupabaseClient,
  normalizedPhone: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('phone_normalized', normalizedPhone)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as { id: string } | null) ?? null
}

export async function resolveOrCreateCustomer(
  supabase: SupabaseClient,
  input: CustomerInput,
): Promise<{ id: string; created: boolean }> {
  const email = normalizeEmail(input.email)
  const phoneNorm = normalizePhone(input.phone)

  if (email) {
    const existing = await findCustomerByEmail(supabase, email)
    if (existing) return { id: existing.id, created: false }
  }

  if (phoneNorm) {
    const existing = await findCustomerByPhone(supabase, phoneNorm)
    if (existing) return { id: existing.id, created: false }
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      full_name: (input.full_name ?? '').trim() || 'Unknown',
      email,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      is_business: input.is_business ?? false,
      contact_name: input.contact_name?.trim() || null,
      notes: input.notes?.trim() || null,
      source: input.source ?? 'manual',
      created_by: input.created_by ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // Lost a race — fetch the winner instead of surfacing the error.
    if (email) {
      const existing = await findCustomerByEmail(supabase, email)
      if (existing) return { id: existing.id, created: false }
    }
    if (phoneNorm) {
      const existing = await findCustomerByPhone(supabase, phoneNorm)
      if (existing) return { id: existing.id, created: false }
    }
    throw error
  }

  return { id: (data as { id: string }).id, created: true }
}
