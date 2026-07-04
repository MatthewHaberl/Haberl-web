import { BookMarked } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page'
import { GlossaryList } from '@/components/sans/GlossaryList'
import type { SansClause } from '@/types/database'

/** Every defined term of section 3 as a filterable glossary. */
export default async function SansGlossaryPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sans_clauses')
    .select('id, clause_ref, title, plain_summary')
    .eq('kind', 'definition')
    .order('title')
    .limit(1000)

  const terms = ((data as SansClause[] | null) ?? []).filter((t) => t.title)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Glossary"
        description={`Every defined term in the standard (section 3) in plain language — ${terms.length} terms. The clause number takes you to the official wording.`}
        icon={BookMarked}
      />
      <GlossaryList terms={terms.map((t) => ({ id: t.id, ref: t.clause_ref, term: t.title as string, summary: t.plain_summary }))} />
    </div>
  )
}
