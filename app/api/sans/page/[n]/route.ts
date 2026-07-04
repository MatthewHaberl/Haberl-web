import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Serves a rendered page of the licensed SANS PDF from the private
 * 'sans-pages' bucket. Storage RLS restricts the bucket to admin, so the
 * signed-URL creation itself fails for anyone else — no extra gating needed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  const { n } = await params
  const page = parseInt(n, 10)
  if (!Number.isFinite(page) || page < 1 || page > 999) {
    return NextResponse.json({ error: 'bad page' }, { status: 400 })
  }
  const supabase = await createClient()
  const name = `pg-${String(page).padStart(3, '0')}.png`
  const { data, error } = await supabase.storage.from('sans-pages').createSignedUrl(name, 600)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'not available' }, { status: 404 })
  }
  return NextResponse.redirect(data.signedUrl)
}
