import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess, canAccess } from '@/lib/auth/permissions'
import { parseZarAmount } from '@/lib/utils'
import { FIN_PAID_BY } from '@/lib/finance/types'

export const runtime = 'nodejs'

const PAID_BY = new Set(FIN_PAID_BY.map((p) => p.value as string))

/**
 * Gate for a single receipt: the person who took the photo, or a manager.
 * Reads the row with the service role so the check is the same one whatever
 * the caller's RLS would have allowed, and returns it for the handler to use.
 */
async function loadReceipt(id: string) {
  const access = await getUserAccess()
  if (!access) return { error: new Response('Unauthorized', { status: 401 }) }
  if (!canAccess(access, 'receipts')) return { error: new Response('Forbidden', { status: 403 }) }

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('fin_documents')
    .select('id, file_url, file_name, doc_type, uploaded_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc || doc.doc_type !== 'receipt') return { error: new Response('Not found', { status: 404 }) }

  const isOwner = doc.uploaded_by === access.user.id
  const isManager = access.role === 'manager' || access.role === 'admin'
  if (!isOwner && !isManager) return { error: new Response('Not found', { status: 404 }) }

  return { access, doc, isManager }
}

/** Open the photo full-size through a short-lived signed URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await loadReceipt(id)
  if (gate.error) return gate.error

  const { data: signed, error } = await createAdminClient().storage
    .from('financial-docs')
    .createSignedUrl(gate.doc.file_url, 60)
  if (error || !signed) return new Response('Could not open the photo', { status: 500 })
  return NextResponse.redirect(signed.signedUrl)
}

/**
 * Fill in or correct the details on a receipt. Written with the caller's own
 * client so RLS is the gate: a field worker may only touch their own receipt,
 * and only until the office has allocated it (migration 139b).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await loadReceipt(id)
  if (gate.error) return gate.error

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
  setStr('doc_date')   // 'YYYY-MM-DD' or null
  setStr('notes')
  if ('job_id' in body) {
    const v = body.job_id
    update.job_id = typeof v === 'string' && v ? v : null
  }
  if ('paid_by' in body) {
    const v = String(body.paid_by)
    if (!PAID_BY.has(v)) return new Response('Bad paid_by', { status: 400 })
    update.paid_by = v
  }
  if ('total' in body) {
    const raw = body.total
    if (raw === null || raw === '') update.total_cents = null
    else {
      // en-ZA amounts use a comma decimal ("1 500,50").
      const n = parseZarAmount(String(raw))
      if (!Number.isFinite(n) || n < 0) return new Response('Bad amount', { status: 400 })
      update.total_cents = Math.round(n * 100)
    }
  }

  if (Object.keys(update).length === 0) return new Response('Nothing to update', { status: 400 })

  const supabase = await createClient()
  // .select() matters: RLS refusing the row is not an error, it is zero rows —
  // without this the call would look like a silent success.
  const { data, error } = await supabase
    .from('fin_documents').update(update).eq('id', id).select('id')
  if (error) {
    console.error('[receipts] patch', error)
    return new Response('Could not save the change', { status: 500 })
  }
  if (!data || data.length === 0) {
    return new Response('This receipt has been filed by the office — ask them to change it', { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

/** Bin a photo that came out blurred. Blocked once the office has filed it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await loadReceipt(id)
  if (gate.error) return gate.error

  const admin = createAdminClient()
  const { count } = await admin
    .from('fin_allocations')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', id)
  if ((count ?? 0) > 0 && !gate.isManager) {
    return new Response('This receipt has been filed by the office — ask them to remove it', { status: 403 })
  }

  await admin.storage.from('financial-docs').remove([gate.doc.file_url])
  const { error } = await admin.from('fin_documents').delete().eq('id', id)
  if (error) {
    console.error('[receipts] delete', error)
    return new Response('Could not delete the receipt', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
