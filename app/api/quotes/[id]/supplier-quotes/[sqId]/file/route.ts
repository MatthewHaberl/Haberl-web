import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPLIER_QUOTES_BUCKET } from '@/lib/quotes/supplier-quote-parse'

export const runtime = 'nodejs'

/** Redirect staff to a short-lived signed URL for the original quote document. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; sqId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['field_worker', 'manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { id: quoteId, sqId } = await params
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('supplier_quotes')
    .select('storage_path')
    .eq('id', sqId)
    .eq('quote_request_id', quoteId)
    .maybeSingle()
  if (!row?.storage_path) return new Response('No document stored for this supplier quote', { status: 404 })

  const { data: signed, error } = await admin.storage
    .from(SUPPLIER_QUOTES_BUCKET)
    .createSignedUrl(row.storage_path, 60 * 10)
  if (error || !signed?.signedUrl) {
    console.error('[supplier-quotes] sign', error)
    return new Response('Could not open the document', { status: 500 })
  }
  return NextResponse.redirect(signed.signedUrl)
}
