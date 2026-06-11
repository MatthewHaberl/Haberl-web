import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidShareToken } from './public'

/** Resolve a quote_requests row from a public share token (service role). */
export async function getQuoteByToken(token: string): Promise<{
  supabase: SupabaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: Record<string, any> | null
}> {
  const supabase = createAdminClient()
  if (!isValidShareToken(token)) return { supabase, quote: null }
  const { data } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('share_token', token)
    .maybeSingle()
  return { supabase, quote: data ?? null }
}

export async function getCompanySettings(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('company_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle()
  return data
}

export function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
