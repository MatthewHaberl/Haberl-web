import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Part = {
  target: 'customer' | 'company'
  customer_id: string | null
  category: string | null
  amount_cents: number
  note: string | null
}

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

/** List the split/company allocations on a transaction. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { data, error } = await g.supabase
    .from('bank_txn_allocations')
    .select('id, target, customer_id, category, amount_cents, note, allocated:customers!customer_id(full_name)')
    .eq('txn_id', id)
    .order('created_at')
  if (error) return new Response('Could not load allocations', { status: 500 })
  return NextResponse.json({ allocations: data ?? [] })
}

/**
 * Replace the split/company allocations on a transaction.
 * Body: { parts: Part[] }. Amounts are POSITIVE cents (magnitude of each part).
 * Setting any parts clears the whole-txn customer so it can't double count.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase, user } = g

  let body: { parts?: unknown }
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
  if (!Array.isArray(body.parts)) return new Response('parts must be an array', { status: 400 })

  const parts: Part[] = []
  for (const raw of body.parts) {
    if (typeof raw !== 'object' || raw === null) continue
    const p = raw as Record<string, unknown>
    const target = p.target === 'company' ? 'company' : 'customer'
    const amount_cents = Math.round(Number(p.amount_cents))
    if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
      return new Response('Each part needs a positive amount', { status: 400 })
    }
    const customer_id = typeof p.customer_id === 'string' && p.customer_id ? p.customer_id : null
    if (target === 'customer' && !customer_id) {
      return new Response('Customer parts need a customer', { status: 400 })
    }
    parts.push({
      target,
      customer_id: target === 'customer' ? customer_id : null,
      category: target === 'company' && typeof p.category === 'string' ? p.category : null,
      amount_cents,
      note: typeof p.note === 'string' && p.note ? p.note : null,
    })
  }
  if (parts.length === 0) return new Response('No valid parts', { status: 400 })

  // Replace the set: delete the old rows, insert the new, clear the whole-txn field.
  const { error: delErr } = await supabase.from('bank_txn_allocations').delete().eq('txn_id', id)
  if (delErr) { console.error('[bank/split delete]', delErr); return new Response('Could not save', { status: 500 }) }

  const { error: insErr } = await supabase.from('bank_txn_allocations').insert(
    parts.map((p) => ({ ...p, txn_id: id, created_by: user.id })),
  )
  if (insErr) { console.error('[bank/split insert]', insErr); return new Response('Could not save', { status: 500 }) }

  await supabase.from('bank_transactions').update({ allocated_customer_id: null }).eq('id', id)

  return NextResponse.json({ ok: true, parts: parts.length })
}

/** Remove all split/company allocations on a transaction (back to whole/unallocated). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { error } = await g.supabase.from('bank_txn_allocations').delete().eq('txn_id', id)
  if (error) return new Response('Could not clear', { status: 500 })
  return NextResponse.json({ ok: true })
}
