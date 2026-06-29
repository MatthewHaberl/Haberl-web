import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const TXN_TYPES = new Set([
  'unallocated', 'customer_payment', 'supplier_payment', 'company_expense', 'transfer', 'other',
])

/**
 * Allocate one or more bank transactions to a customer (or clear it).
 * Manager/admin only. Body: { ids: string[], customer_id: string|null, txn_type?: string }
 *
 * The customer statement derives payment-vs-charge from the amount sign, so
 * tagging the customer is enough; txn_type is optional extra classification.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  let body: { ids?: unknown; customer_id?: unknown; txn_type?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
  if (ids.length === 0) return new Response('No transactions selected', { status: 400 })
  if (ids.length > 2000) return new Response('Too many transactions in one request', { status: 400 })

  const customer_id =
    typeof body.customer_id === 'string' && body.customer_id.length > 0 ? body.customer_id : null

  const update: { allocated_customer_id: string | null; txn_type?: string } = {
    allocated_customer_id: customer_id,
  }
  if (typeof body.txn_type === 'string' && TXN_TYPES.has(body.txn_type)) {
    update.txn_type = body.txn_type
  } else if (customer_id === null) {
    update.txn_type = 'unallocated'
  }

  const { error, count } = await supabase
    .from('bank_transactions')
    .update(update, { count: 'exact' })
    .in('id', ids)
  if (error) {
    console.error('[finance/bank/allocate]', error)
    return new Response('Could not save the allocation', { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: count ?? ids.length })
}
