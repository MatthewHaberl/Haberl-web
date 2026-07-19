import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * The clause pages read exactly one edition: the in-force SANS 10142-1.
 * Draft editions (Ed 3.03 / Amdt 3) reuse the same clause refs, so every
 * sans_clauses query must scope to this id — an unscoped ref lookup turns
 * ambiguous the moment a second edition's clauses are loaded.
 */
export async function inForceDocId(supabase: ServerClient): Promise<string | null> {
  const { data } = await supabase
    .from('sans_documents')
    .select('id')
    .eq('code', '10142-1')
    .eq('status', 'in_force')
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}
