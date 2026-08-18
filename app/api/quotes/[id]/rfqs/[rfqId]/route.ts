import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RfqStatus } from '@/lib/quotes/supplier-rfq'

export const runtime = 'nodejs'

/** Editable header fields — status is set by the send route, not by hand. */
const EDITABLE = new Set(['supplier_id', 'supplier_name', 'message'])
const CANCELLABLE: RfqStatus[] = ['draft', 'sent']

async function requireManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) as Response }
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: new Response('Forbidden', { status: 403 }) as Response }
  }
  return { userId: user.id }
}

/** Edit the RFQ header — who it's going to, and the note above the table. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; rfqId: string }> },
) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const { id: quoteId, rfqId } = await params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE.has(key)) patch[key] = value
  }
  // Cancelling is the one status move the UI owns.
  if (body.status === 'cancelled') patch.status = 'cancelled'
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { data: rfq } = await admin
    .from('supplier_rfqs').select('status').eq('id', rfqId).eq('quote_request_id', quoteId).maybeSingle()
  if (!rfq) return new Response('RFQ not found', { status: 404 })
  if (patch.status === 'cancelled' && !CANCELLABLE.includes(rfq.status as RfqStatus)) {
    return NextResponse.json({ error: `This RFQ is already ${rfq.status}.` }, { status: 409 })
  }

  const { data, error } = await admin
    .from('supplier_rfqs').update(patch).eq('id', rfqId).select('*').single()
  if (error) {
    console.error('[rfqs] patch', error)
    return new Response('Could not update the RFQ', { status: 500 })
  }
  return NextResponse.json({ ok: true, rfq: data })
}

/**
 * Delete an RFQ. Only while it's a draft — once it has gone to a supplier the
 * record of what we asked for stays; cancel it instead (PATCH status).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; rfqId: string }> },
) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const { id: quoteId, rfqId } = await params
  const admin = createAdminClient()
  const { data: rfq } = await admin
    .from('supplier_rfqs').select('status').eq('id', rfqId).eq('quote_request_id', quoteId).maybeSingle()
  if (!rfq) return new Response('RFQ not found', { status: 404 })
  if (rfq.status !== 'draft') {
    return NextResponse.json(
      { error: "This RFQ has already gone out — cancel it instead so there's a record of what was asked." },
      { status: 409 },
    )
  }

  const { error } = await admin.from('supplier_rfqs').delete().eq('id', rfqId)
  if (error) {
    console.error('[rfqs] delete', error)
    return new Response('Could not delete the RFQ', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
