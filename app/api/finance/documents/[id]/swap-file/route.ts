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

type FileFields = { file_url: string; file_name: string | null; mime_type: string | null; file_size: number | null }
const FILE_COLS = 'file_url, file_name, mime_type, file_size'
const pick = (r: FileFields): FileFields =>
  ({ file_url: r.file_url, file_name: r.file_name, mime_type: r.mime_type, file_size: r.file_size })

/**
 * Swap ONLY the attached file between two documents. Use when the right details
 * and allocations are on each row but the wrong scan is attached (e.g. two
 * scans came in out of order). Allocations, supplier, total, type, etc. stay
 * with their row — just the four file columns change hands.
 *
 * Body: { other_id }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { id } = await params

  let body: { other_id?: unknown }
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
  const otherId = typeof body.other_id === 'string' ? body.other_id : ''
  if (!otherId) return new Response('Pick another document to swap with', { status: 400 })
  if (otherId === id) return new Response('Cannot swap a document with itself', { status: 400 })

  const admin = createAdminClient()

  const [{ data: a }, { data: b }] = await Promise.all([
    admin.from('fin_documents').select(FILE_COLS).eq('id', id).maybeSingle(),
    admin.from('fin_documents').select(FILE_COLS).eq('id', otherId).maybeSingle(),
  ])
  if (!a) return new Response('This document no longer exists', { status: 404 })
  if (!b) return new Response('The other document no longer exists', { status: 404 })

  const aFile = pick(a as FileFields)
  const bFile = pick(b as FileFields)

  // Two updates (no cross-row transaction at this layer). If the second fails,
  // roll the first back so we never leave both rows pointing at the same file.
  const { error: e1 } = await admin.from('fin_documents').update(bFile).eq('id', id)
  if (e1) {
    console.error('[finance/swap-file] update-a', e1)
    return new Response('Could not swap the files', { status: 500 })
  }
  const { error: e2 } = await admin.from('fin_documents').update(aFile).eq('id', otherId)
  if (e2) {
    console.error('[finance/swap-file] update-b', e2)
    await admin.from('fin_documents').update(aFile).eq('id', id) // revert
    return new Response('Could not swap the files', { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
