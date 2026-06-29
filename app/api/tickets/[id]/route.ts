import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess, canAccess } from '@/lib/auth/permissions'

export const runtime = 'nodejs'

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']
const DONE = ['resolved', 'closed']

/** Triage a ticket (status / admin note). Gated by the `tickets` section. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const access = await getUserAccess()
  if (!access) return new Response('Unauthorized', { status: 401 })
  if (!canAccess(access, 'tickets')) return new Response('Forbidden', { status: 403 })

  let body: { status?: string; admin_note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    patch.status = body.status
    patch.resolved_at = DONE.includes(body.status) ? new Date().toISOString() : null
    patch.resolved_by = DONE.includes(body.status) ? access.user.id : null
  }
  if (typeof body.admin_note === 'string') patch.admin_note = body.admin_note.slice(0, 2000)

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('portal_tickets').update(patch).eq('id', id)
  if (error) {
    console.error('[tickets] update failed:', error)
    return NextResponse.json({ error: 'Could not update ticket.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
