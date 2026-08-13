import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPLIER_QUOTES_BUCKET } from '@/lib/quotes/supplier-quote-parse'

export const runtime = 'nodejs'

async function guard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) return null
  return user
}

/** Remove a supplier quote: its lines (FK cascade), row, and stored document. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; sqId: string }> },
) {
  const user = await guard()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id: quoteId, sqId } = await params
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('supplier_quotes')
    .select('id, storage_path')
    .eq('id', sqId)
    .eq('quote_request_id', quoteId)
    .maybeSingle()
  if (!row) return new Response('Not found', { status: 404 })

  const { error } = await admin.from('supplier_quotes').delete().eq('id', row.id)
  if (error) {
    console.error('[supplier-quotes] delete', error)
    return new Response('Could not delete the supplier quote', { status: 500 })
  }
  if (row.storage_path) {
    // Best-effort — an orphaned object is preferable to a row that won't delete.
    await admin.storage.from(SUPPLIER_QUOTES_BUCKET).remove([row.storage_path])
  }
  return NextResponse.json({ ok: true })
}
