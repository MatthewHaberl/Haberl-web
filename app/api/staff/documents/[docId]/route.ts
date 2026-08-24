import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStaffDocType } from '@/lib/staff/documents'

export const runtime = 'nodejs'

/** Staff paperwork is manager/admin only, reads included. */
async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: new Response('Forbidden', { status: 403 }) }
  }
  return { user }
}

/** Open the file itself through a short-lived signed URL. */
export async function GET(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const gate = await requireManager()
  if (gate.error) return gate.error
  const { docId } = await params

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('staff_documents')
    .select('file_url, file_name')
    .eq('id', docId)
    .maybeSingle()
  if (!doc) return new Response('Not found', { status: 404 })

  // ?download=1 makes the browser save it under its original name instead of
  // rendering it in a tab — what you want for a Word contract, not for an ID photo.
  const download = new URL(req.url).searchParams.get('download')
  const { data: signed, error } = await admin.storage
    .from('staff-docs')
    .createSignedUrl(doc.file_url, 60, download ? { download: doc.file_name } : undefined)
  if (error || !signed) return new Response('Could not generate link', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}

/** Correct the details on a document without re-uploading it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const gate = await requireManager()
  if (gate.error) return gate.error
  const { docId } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const update: Record<string, unknown> = {}
  const setStr = (k: string) => {
    if (k in body) {
      const v = body[k]
      update[k] = typeof v === 'string' && v.trim() ? v.trim() : null
    }
  }
  setStr('doc_number')
  setStr('issued_on') // 'YYYY-MM-DD' or null
  setStr('expires_on')
  setStr('notes')

  if ('title' in body) {
    const t = typeof body.title === 'string' ? body.title.trim() : ''
    if (!t) return new Response('A document needs a name', { status: 400 })
    update.title = t
  }
  if ('doc_type' in body) {
    const t = String(body.doc_type)
    if (!isStaffDocType(t)) return new Response('Bad doc_type', { status: 400 })
    update.doc_type = t
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { error } = await admin.from('staff_documents').update(update).eq('id', docId)
  if (error) {
    console.error('[staff/docs] patch', error)
    return new Response('Could not save the change', { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** Remove the record and the file behind it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const gate = await requireManager()
  if (gate.error) return gate.error
  const { docId } = await params

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('staff_documents')
    .select('file_url')
    .eq('id', docId)
    .maybeSingle()
  if (!doc) return new Response('Not found', { status: 404 })

  const { error } = await admin.from('staff_documents').delete().eq('id', docId)
  if (error) {
    console.error('[staff/docs] delete', error)
    return new Response('Could not delete the document', { status: 500 })
  }
  // Row first, object second: a failed object delete leaves rubbish in the
  // bucket, where the reverse would leave a row pointing at nothing.
  await admin.storage.from('staff-docs').remove([doc.file_url])

  return NextResponse.json({ ok: true })
}
