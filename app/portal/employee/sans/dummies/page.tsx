import Link from 'next/link'
import { Lightbulb, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page'
import { CHAPTER_BLURBS, isAnnexRef } from '@/lib/sans/refs'
import type { SansClause } from '@/types/database'

/** "SANS for Dummies" — pick a chapter, read it in plain English. Laid out to
 *  mirror The Standard (chapters, then a separate Annexes grid) so the two tabs
 *  feel like the same book. */
export default async function SansDummiesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sans_clauses')
    .select('id, clause_ref, title, plain_summary, sort_key')
    .is('parent_ref', null)
    .order('sort_key')

  const top = (data as SansClause[] | null) ?? []
  const chapters = top.filter((c) => /^\d+$/.test(c.clause_ref))
  const annexes = top.filter((c) => isAnnexRef(c.clause_ref))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SANS in Plain Language"
        description="The whole standard, chapter by chapter, in plain English — laid out exactly like The Standard tab. Open any chapter to read it top to bottom, or read it side-by-side with the verbatim text."
        icon={Lightbulb}
      />

      {top.length === 0 && (
        <p className="text-sm text-muted-foreground">The clause library is empty — content pipeline pending.</p>
      )}

      {chapters.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {chapters.map((c) => (
            <Link
              key={c.id}
              href={`/portal/employee/sans/dummies/${encodeURIComponent(c.clause_ref)}`}
              className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent"
            >
              <p className="font-semibold text-foreground group-hover:text-primary">
                <span className="mr-2 font-mono text-accent">{c.clause_ref}</span>
                {c.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {CHAPTER_BLURBS[c.clause_ref] ?? c.plain_summary}
              </p>
            </Link>
          ))}
        </div>
      )}

      {annexes.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Annexes</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {annexes.map((c) => (
              <Link
                key={c.id}
                href={`/portal/employee/sans/dummies/${encodeURIComponent(c.clause_ref)}`}
                className="group flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-accent"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span className="text-sm">
                  <span className="font-mono font-semibold text-accent">{c.clause_ref}</span>{' '}
                  <span className="font-medium text-foreground group-hover:text-primary">{c.title}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
