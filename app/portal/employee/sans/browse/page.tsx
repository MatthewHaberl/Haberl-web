import Link from 'next/link'
import { ListTree, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page'
import { CHAPTER_BLURBS, FRONT_MATTER_TITLES, isAnnexRef } from '@/lib/sans/refs'
import type { SansClause } from '@/types/database'

/** Top-level table of contents: front matter, chapters 1–8, annexes. */
export default async function SansBrowsePage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sans_clauses')
    .select('id, clause_ref, title, kind, page_number, plain_summary, sort_key')
    .is('parent_ref', null)
    .order('sort_key')

  const top = (data as SansClause[] | null) ?? []
  const frontMatter = top.filter((c) => FRONT_MATTER_TITLES[c.clause_ref.toLowerCase()])
  const chapters = top.filter((c) => /^\d+$/.test(c.clause_ref))
  const annexes = top.filter((c) => isAnnexRef(c.clause_ref))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="The Standard"
        description="SANS 10142-1:2024 Edition 3.2 — the full clause tree. Click into any chapter."
        icon={ListTree}
      />

      {top.length === 0 && (
        <p className="text-sm text-muted-foreground">
          The clause library is empty — the content pipeline hasn&apos;t loaded Edition 3.2 yet.
        </p>
      )}

      {chapters.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {chapters.map((c) => (
            <Link
              key={c.id}
              href={`/portal/employee/sans/clause/${encodeURIComponent(c.clause_ref)}`}
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
                href={`/portal/employee/sans/clause/${encodeURIComponent(c.clause_ref)}`}
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

      {frontMatter.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Front matter</h2>
          <div className="flex flex-wrap gap-2">
            {frontMatter.map((c) => (
              <Link
                key={c.id}
                href={`/portal/employee/sans/clause/${encodeURIComponent(c.clause_ref)}`}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-primary"
              >
                {FRONT_MATTER_TITLES[c.clause_ref.toLowerCase()] ?? c.title ?? c.clause_ref}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
