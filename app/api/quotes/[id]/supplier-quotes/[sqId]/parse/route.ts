import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseAndStoreLines } from '@/lib/quotes/supplier-quote-parse'

export const runtime = 'nodejs'
export const maxDuration = 180

/** Re-read a stored supplier quote's document (replaces its lines). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; sqId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { id: quoteId, sqId } = await params
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('supplier_quotes')
    .select('id, storage_path, mime_type')
    .eq('id', sqId)
    .eq('quote_request_id', quoteId)
    .maybeSingle()
  if (!row) return new Response('Not found', { status: 404 })

  const result = await parseAndStoreLines(admin, row)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })

  const [{ data: fresh }, { data: lines }] = await Promise.all([
    admin.from('supplier_quotes').select('*').eq('id', row.id).single(),
    admin.from('supplier_quote_lines').select('*').eq('supplier_quote_id', row.id).order('line_no'),
  ])
  return NextResponse.json({
    ok: true,
    quote: fresh,
    lines: lines ?? [],
    warning: result.warning,
    method: result.method,
  })
}
