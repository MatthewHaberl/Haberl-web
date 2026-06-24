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
