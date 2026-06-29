import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function guard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: new Response('Forbidden', { status: 403 }) }
  }
  return { supabase, user }
}

/** List auto-allocation rules with their customer names. */
export async function GET() {
  const g = await guard()
  if (g.error) return g.error
  const { data, error } = await g.supabase
    .from('bank_alloc_rules')
    .select('id, pattern, target, customer_id, category, note, customer:customers!customer_id(full_name)')
    .order('created_at')
  if (error) return new Response('Could not load rules', { status: 500 })
  return NextResponse.json({ rules: data ?? [] })
}

/** Create a rule. Body: { pattern, target, customer_id?, category?, note? } */
export async function POST(req: Request) {
  const g = await guard()
  if (g.error) return g.error
  const { supabase, user } = g

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const pattern = typeof body.pattern === 'string' ? body.pattern.trim() : ''
  if (!pattern) return new Response('Pattern is required', { status: 400 })
  const target = body.target === 'company' ? 'company' : 'customer'
  const customer_id = typeof body.customer_id === 'string' && body.customer_id ? body.customer_id : null
  if (target === 'customer' && !customer_id) return new Response('Customer rules need a customer', { status: 400 })
  const category = target === 'company' && typeof body.category === 'string' ? body.category : null
  const note = typeof body.note === 'string' && body.note ? body.note : null

  const { error } = await supabase.from('bank_alloc_rules').insert({
    pattern, target, customer_id, category, note, created_by: user.id,
  })
  if (error) { console.error('[bank/rules POST]', error); return new Response('Could not save rule', { status: 500 }) }
  return NextResponse.json({ ok: true })
}

/** Delete a rule. Query: ?id= */
export async function DELETE(req: Request) {
  const g = await guard()
  if (g.error) return g.error
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return new Response('id is required', { status: 400 })
  const { error } = await g.supabase.from('bank_alloc_rules').delete().eq('id', id)
  if (error) return new Response('Could not delete rule', { status: 500 })
  return NextResponse.json({ ok: true })
}
