import Link from 'next/link'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page'
import type { SansClause } from '@/types/database'

/** Search hits from clause metadata/summaries, plus verbatim-text hits for admin. */
export default async function SansSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = (q ?? '').trim()
  const supabase = await createClient()

  let results: SansClause[] = []
  let bodyHitIds = new Set<string>()

  if (query) {
    // Direct clause-ref lookup ("6.7.5") beats full-text when it matches.
    const refPattern = /^[0-9A-Za-z]+(\.[0-9]+)*$/.test(query)
    const [meta, refHits, bodies] = await Promise.all([
      supabase
        .from('sans_clauses')
        .select('*')
        .textSearch('search', query, { type: 'websearch' })
        .order('sort_key')
        .limit(60),
      refPattern
        ? supabase.from('sans_clauses').select('*').ilike('clause_ref', `${query}%`).order('sort_key').limit(30)
        : Promise.resolve({ data: [] as SansClause[] }),
      supabase
        .from('sans_clause_bodies')
        .select('clause_id')
        .textSearch('search', query, { type: 'websearch' })
        .limit(60),
    ])

    const byId = new Map<string, SansClause>()
    for (const c of [...((refHits.data as SansClause[]) ?? []), ...((meta.data as SansClause[]) ?? [])]) {
      byId.set(c.id, c)
    }

    bodyHitIds = new Set(((bodies.data as { clause_id: string }[]) ?? []).map((b) => b.clause_id))
    const missingBodyIds = [...bodyHitIds].filter((id) => !byId.has(id))
    if (missingBodyIds.length) {
      const { data: extra } = await supabase.from('sans_clauses').select('*').in('id', missingBodyIds)
      for (const c of (extra as SansClause[]) ?? []) byId.set(c.id, c)
    }

    results = [...byId.values()].sort((a, b) => a.sort_key.localeCompare(b.sort_key))
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={query ? `Search: “${query}”` : 'Search the standard'}
        description={query ? `${results.length} matching clause${results.length === 1 ? '' : 's'}` : undefined}
        icon={Search}
      />

      <form action="/portal/employee/sans/search" method="GET" className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search clauses, summaries and full text…"
          className="h-12 w-full rounded-xl border border-border bg-card pl-12 pr-4 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent"
        />
      </form>

      {query && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing matched. Try different words — the search covers clause numbers, titles, plain-language
          summaries and (for admin) the verbatim text.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {results.map((c) => (
          <Link
            key={c.id}
            href={`/portal/employee/sans/clause/${encodeURIComponent(c.clause_ref)}`}
            className="group rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-accent"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-accent">{c.clause_ref}</span>
              {c.title && <span className="text-sm font-medium text-foreground group-hover:text-primary">{c.title}</span>}
              {bodyHitIds.has(c.id) && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">matched in full text</span>
              )}
              {c.page_number && <span className="ml-auto text-xs text-muted-foreground">p. {c.page_number}</span>}
            </div>
            {c.plain_summary && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.plain_summary}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
