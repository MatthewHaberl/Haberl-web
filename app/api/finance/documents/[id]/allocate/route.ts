import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const DIRECTIONS = new Set(['charge', 'reimburse'])
const BASES = new Set(['whole', 'percent', 'items', 'custom'])

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

/** Create an allocation on a document. Amount is resolved server-side from the basis. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: document_id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase, user } = g

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const target = body.target === 'company' ? 'company' : 'customer'
  const customer_id = typeof body.customer_id === 'string' && body.customer_id ? body.customer_id : null
  const direction = String(body.direction || '')
  const basis = String(body.basis || '')
  const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null
  if (target === 'customer') {
    if (!customer_id) return new Response('Pick a customer', { status: 400 })
    if (!DIRECTIONS.has(direction)) return new Response('Bad direction', { status: 400 })
  }
  if (!BASES.has(basis)) return new Response('Bad basis', { status: 400 })

  // Load the document total and its lines to resolve the amount.
  const { data: doc } = await supabase
    .from('fin_documents').select('id, total_cents').eq('id', document_id).maybeSingle()
  if (!doc) return new Response('Document not found', { status: 404 })
  const { data: linesRaw } = await supabase
    .from('fin_line_items').select('id, line_total_cents').eq('document_id', document_id)
  const lines = (linesRaw ?? []) as { id: string; line_total_cents: number }[]
  const lineSum = lines.reduce((s, l) => s + (l.line_total_cents ?? 0), 0)
  const base = (doc as { total_cents: number | null }).total_cents ?? lineSum

  let amount_cents = 0
  let percent: number | null = null
  let line_item_ids: string[] | null = null

  if (basis === 'whole') {
    amount_cents = base
  } else if (basis === 'percent') {
    percent = Number(body.percent)
    if (!Number.isFinite(percent) || percent <= 0) return new Response('Bad percent', { status: 400 })
    amount_cents = Math.round((base * percent) / 100)
  } else if (basis === 'items') {
    const ids = Array.isArray(body.line_item_ids)
      ? body.line_item_ids.filter((x): x is string => typeof x === 'string') : []
    if (ids.length === 0) return new Response('Select at least one line', { status: 400 })
    const valid = new Set(lines.map((l) => l.id))
    line_item_ids = ids.filter((i) => valid.has(i))
    if (line_item_ids.length === 0) return new Response('No valid lines selected', { status: 400 })
    amount_cents = lines.filter((l) => line_item_ids!.includes(l.id))
      .reduce((s, l) => s + (l.line_total_cents ?? 0), 0)
  } else { // custom
    const n = Number(body.custom_cents)
    if (!Number.isFinite(n) || n === 0) return new Response('Enter an amount', { status: 400 })
    amount_cents = Math.round(n)
  }

  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null

  const { data: row, error } = await supabase
    .from('fin_allocations')
    .insert({
      document_id,
      target,
      customer_id: target === 'customer' ? customer_id : null,
      direction: target === 'customer' ? direction : null,
      category: target === 'company' ? category : null,
      basis, percent, line_item_ids, amount_cents, note,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[finance/allocate]', error)
    return new Response('Could not save the allocation', { status: 500 })
  }
  return NextResponse.json({ ok: true, id: row?.id, amount_cents })
}

/** Remove an allocation: DELETE ...?allocation_id=uuid */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase } = g

  const allocationId = new URL(req.url).searchParams.get('allocation_id')
  if (!allocationId) return new Response('Missing allocation_id', { status: 400 })

  const { error } = await supabase.from('fin_allocations').delete().eq('id', allocationId)
  if (error) {
    console.error('[finance/allocate] delete', error)
    return new Response('Could not remove the allocation', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
