import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: new Response('Forbidden', { status: 403 }) }
  }
  return { user }
}

/** Open the original file via a short-lived signed URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { id } = await params

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('fin_documents').select('file_url').eq('id', id).maybeSingle()
  if (!doc) return new Response('Not found', { status: 404 })

  const { data: signed, error } = await admin.storage
    .from('financial-docs').createSignedUrl(doc.file_url, 60)
  if (error || !signed) return new Response('Could not generate link', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}

const DOC_TYPES = new Set(['supplier_invoice', 'receipt', 'sales_invoice', 'pro_forma', 'credit_note', 'bank_statement', 'other'])

/** Edit the document header fields (fix an incorrect import). Manager/admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { id } = await params

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const update: Record<string, unknown> = {}
  const setStr = (k: string) => {
    if (k in body) {
      const v = body[k]
      update[k] = typeof v === 'string' && v.trim() ? v.trim() : null
    }
  }
  setStr('supplier_name')
  setStr('doc_number')
  setStr('doc_date')   // 'YYYY-MM-DD' or null
  setStr('notes')

  if ('doc_type' in body) {
    const t = String(body.doc_type)
    if (!DOC_TYPES.has(t)) return new Response('Bad doc_type', { status: 400 })
    update.doc_type = t
  }
  if ('status' in body) {
    const s = String(body.status)
    if (!['open', 'unsure', 'discarded'].includes(s)) return new Response('Bad status', { status: 400 })
    update.status = s
  }
  if ('total_cents' in body) {
    const v = body.total_cents
    if (v === null || v === '') update.total_cents = null
    else {
      const n = Number(v)
      if (!Number.isFinite(n)) return new Response('Bad total', { status: 400 })
      update.total_cents = Math.round(n)
    }
  }

  if (Object.keys(update).length === 0) return new Response('Nothing to update', { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('fin_documents').update(update).eq('id', id)
  if (error) {
    console.error('[finance/docs] patch', error)
    return new Response('Could not save changes', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** Delete the file and its record. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { id } = await params

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('fin_documents').select('file_url').eq('id', id).maybeSingle()
  if (!doc) return new Response('Not found', { status: 404 })

  await admin.storage.from('financial-docs').remove([doc.file_url])
  const { error } = await admin.from('fin_documents').delete().eq('id', id)
  if (error) {
    console.error('[finance/docs] delete', error)
    return new Response('Delete failed', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
