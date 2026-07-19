import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inForceDocId } from '@/lib/sans/documents'

/** Clause peek: metadata + summary for staff, verbatim body when RLS allows (admin). */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref: raw } = await params
  const ref = decodeURIComponent(raw)
  const supabase = await createClient()
  const docId = await inForceDocId(supabase)
  if (!docId) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: clause } = await supabase
    .from('sans_clauses')
    .select('id, clause_ref, title, plain_summary, page_number, doc_page')
    .eq('document_id', docId)
    .eq('clause_ref', ref)
    .maybeSingle()
  if (!clause) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: body } = await supabase
    .from('sans_clause_bodies')
    .select('body')
    .eq('clause_id', clause.id)
    .maybeSingle()

  return NextResponse.json({
    ref: clause.clause_ref,
    title: clause.title,
    summary: clause.plain_summary,
    page: clause.page_number,
    body: (body as { body: string } | null)?.body ?? null,
  })
}
