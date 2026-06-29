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
  return { supabase }
}

function shift(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Find bank transactions that could be this invoice: the EXACT amount (the
 * document total, matched either sign) within ±days of the document date.
 * Also returns the currently-linked transaction, if any.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase } = g

  const days = Math.min(60, Math.max(0, parseInt(new URL(req.url).searchParams.get('days') ?? '7', 10) || 7))

  const { data: doc } = await supabase
    .from('fin_documents').select('total_cents, doc_date').eq('id', id).maybeSingle()
  if (!doc) return new Response('Document not found', { status: 404 })
  const total = (doc as { total_cents: number | null }).total_cents
  const docDate = (doc as { doc_date: string | null }).doc_date

  // already-linked txn(s)
  const { data: linked } = await supabase
    .from('bank_transactions')
    .select('id, txn_date, description, amount_cents, account_label')
    .eq('matched_document_id', id)

  if (total == null) {
    return NextResponse.json({ ok: true, total: null, candidates: [], linked: linked ?? [], reason: 'no_total' })
  }

  let cq = supabase
    .from('bank_transactions')
    .select('id, txn_date, description, amount_cents, account_label, matched_document_id')
    .or(`amount_cents.eq.${total},amount_cents.eq.${-total}`)
    .order('txn_date', { ascending: true })
    .limit(50)
  if (docDate) {
    cq = cq.gte('txn_date', shift(docDate, -days)).lte('txn_date', shift(docDate, days))
  }
  const { data: candidates } = await cq

  return NextResponse.json({
    ok: true,
    total,
    doc_date: docDate,
    days,
    candidates: candidates ?? [],
    linked: linked ?? [],
  })
}

/** Link a bank transaction to this document. Body: { txn_id }. One doc ↔ one txn. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase } = g

  let body: { txn_id?: unknown }
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
  const txnId = typeof body.txn_id === 'string' ? body.txn_id : ''
  if (!txnId) return new Response('Missing txn_id', { status: 400 })

  // clear any previous link to this document, then set the chosen one
  await supabase.from('bank_transactions').update({ matched_document_id: null }).eq('matched_document_id', id)
  const { error } = await supabase
    .from('bank_transactions').update({ matched_document_id: id }).eq('id', txnId)
  if (error) {
    console.error('[finance/match] link', error)
    return new Response('Could not link the transaction', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** Unlink whatever transaction is matched to this document. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase } = g

  const { error } = await supabase
    .from('bank_transactions').update({ matched_document_id: null }).eq('matched_document_id', id)
  if (error) {
    console.error('[finance/match] unlink', error)
    return new Response('Could not unlink', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
