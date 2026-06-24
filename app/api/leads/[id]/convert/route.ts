import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveOrCreateCustomer } from '@/lib/customers/resolve'

export const runtime = 'nodejs'

/**
 * Convert a lead into a CRM customer. Leads carry no email, so this creates a
 * phone-only prospect record (no account email is sent — staff invite later
 * from the customer page once an email is captured). Idempotent: a lead already
 * linked to a customer returns that customer.
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

  const { data: lead } = await supabase
    .from('leads').select('*').eq('id', id).maybeSingle()
  if (!lead) return new Response('Lead not found', { status: 404 })

  if (lead.customer_id) {
    return NextResponse.json({ ok: true, customerId: lead.customer_id, alreadyConverted: true })
  }

  const { id: customerId } = await resolveOrCreateCustomer(supabase, {
    full_name: lead.name,
    phone: lead.phone,
    address: lead.suburb,
    notes: lead.note,
    source: 'lead',
    created_by: user.id,
  })

  const { error: updateError } = await supabase
    .from('leads')
    .update({ customer_id: customerId, status: 'converted' })
    .eq('id', id)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, customerId })
}
