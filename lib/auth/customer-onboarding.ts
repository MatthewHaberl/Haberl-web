import type { SupabaseClient, User } from '@supabase/supabase-js'

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

function normalizeEmail(email: unknown): string | null {
  const normalized = String(email ?? '').trim().toLowerCase()
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  return normalized
}

async function findCustomerProfile(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .ilike('email', email)
    .eq('role', 'customer')
    .maybeSingle()

  if (error) throw error
  return data as { id: string; full_name: string | null } | null
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 3; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) return null

    const match = data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) return match
    if (data.users.length < 100) return null
  }

  return null
}

async function upsertCustomerProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: Record<string, any>,
) {
  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      email,
      full_name: String(quote.customer_name ?? '').trim(),
      phone: quote.customer_phone ?? null,
      role: 'customer',
    }, { onConflict: 'id' })

  if (error) throw error
}

export async function ensureCustomerPortalAccess(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: Record<string, any>,
  baseUrl: string,
): Promise<CustomerPortalAccess> {
  const email = normalizeEmail(quote.customer_email)
  if (!email) {
    return { ok: true, status: 'skipped', reason: 'Quote has no valid customer email' }
  }

  const customerName = String(quote.customer_name ?? 'there').trim() || 'there'
  const portalUrl = `${baseUrl.replace(/\/$/, '')}/portal`

  try {
    const profile = await findCustomerProfile(supabase, email)
    if (profile) {
      return {
        ok: true,
        status: 'existing',
        email,
        customerName: profile.full_name?.trim() || customerName,
        actionUrl: portalUrl,
        profileId: profile.id,
      }
    }

    const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/set-password?next=/portal`
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: {
          full_name: customerName,
          phone: quote.customer_phone ?? undefined,
          accepted_quote_id: quote.id,
          quote_number: quote.quote_number ?? undefined,
        },
      },
    })

    if (error) {
      const existingAuthUser = await findAuthUserByEmail(supabase, email)
      if (existingAuthUser) {
        await upsertCustomerProfile(supabase, existingAuthUser.id, email, quote)
        return {
          ok: true,
          status: 'existing',
          email,
          customerName,
          actionUrl: portalUrl,
          profileId: existingAuthUser.id,
        }
      }

      return { ok: false, status: 'failed', error: error.message }
    }

    if (data.user?.id) {
      await upsertCustomerProfile(supabase, data.user.id, email, quote)
    }

    return {
      ok: true,
      status: 'invited',
      email,
      customerName,
      actionUrl: data.properties?.action_link ?? redirectTo,
      profileId: data.user?.id ?? null,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Customer onboarding failed',
    }
  }
}
