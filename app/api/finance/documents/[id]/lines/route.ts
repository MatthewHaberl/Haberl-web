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

function readLine(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  if ('description' in body) out.description = String(body.description ?? '')
  if ('qty' in body) {
    const n = Number(body.qty)
    out.qty = Number.isFinite(n) ? n : 1
  }
  if ('line_total_cents' in body) {
    const n = Number(body.line_total_cents)
    out.line_total_cents = Number.isFinite(n) ? Math.round(n) : 0
  }
  return out
}

/** Add a line to the document. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: document_id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase } = g

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const { data: last } = await supabase
    .from('fin_line_items').select('line_no').eq('document_id', document_id)
    .order('line_no', { ascending: false }).limit(1).maybeSingle()
  const nextNo = ((last?.line_no as number | null) ?? 0) + 1

  const line = readLine(body)
  const { data: row, error } = await supabase
    .from('fin_line_items')
    .insert({ document_id, line_no: nextNo, description: '', qty: 1, line_total_cents: 0, ...line })
    .select('id')
    .single()
  if (error) {
    console.error('[finance/lines] add', error)
    return new Response('Could not add the line', { status: 500 })
  }
  return NextResponse.json({ ok: true, id: row?.id })
}

/** Update an existing line. Body must include { id }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: document_id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase } = g

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
  const lineId = typeof body.id === 'string' ? body.id : ''
  if (!lineId) return new Response('Missing line id', { status: 400 })

  const update = readLine(body)
  if (Object.keys(update).length === 0) return new Response('Nothing to update', { status: 400 })

  const { error } = await supabase
    .from('fin_line_items').update(update)
    .eq('id', lineId).eq('document_id', document_id)
  if (error) {
    console.error('[finance/lines] update', error)
    return new Response('Could not save the line', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** Remove a line: DELETE ...?line_id=uuid */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: document_id } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase } = g

  const lineId = new URL(req.url).searchParams.get('line_id')
  if (!lineId) return new Response('Missing line_id', { status: 400 })

  const { error } = await supabase
    .from('fin_line_items').delete().eq('id', lineId).eq('document_id', document_id)
  if (error) {
    console.error('[finance/lines] delete', error)
    return new Response('Could not remove the line', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
