import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/** Apply every auto-allocation rule to the still-loose transactions. */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data, error } = await supabase.rpc('apply_bank_alloc_rules')
  if (error) { console.error('[bank/rules/apply]', error); return new Response('Could not apply rules', { status: 500 }) }
  return NextResponse.json(data ?? { customer_applied: 0, company_applied: 0 })
}
