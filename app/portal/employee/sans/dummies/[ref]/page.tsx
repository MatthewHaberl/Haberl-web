import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Columns2, Lightbulb } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { inForceDocId } from '@/lib/sans/documents'
import { sortKeyFor } from '@/lib/sans/refs'
import type { SansClause } from '@/types/database'

/** Continuous plain-language reading view of one chapter/annex subtree. */
export default async function SansDummiesChapterPage({
  params,
}: {
  params: Promise<{ ref: string }>
}) {
  const { ref: rawRef } = await params
  const ref = decodeURIComponent(rawRef)
  const supabase = await createClient()
  const docId = await inForceDocId(supabase)
  if (!docId) notFound()

  const key = sortKeyFor(ref)
  const { data } = await supabase
    .from('sans_clauses')
    .select('id, clause_ref, parent_ref, title, kind, plain_summary, sort_key')
    .eq('document_id', docId)
    .gte('sort_key', key)
    .lte('sort_key', key + '.zzz')
    .order('sort_key')
    .limit(1000)

  const rows = (data as SansClause[] | null) ?? []
  if (rows.length === 0) notFound()
  const root = rows[0]
  const pendingCount = rows.filter((r) => !r.plain_summary && r.kind !== 'section').length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/portal/employee/sans/dummies"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> All chapters
        </Link>
        <Link
          href={`/portal/employee/sans/read/${encodeURIComponent(ref)}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent"
        >
          <Columns2 className="h-4 w-4" /> Side-by-side with the full text
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Lightbulb className="h-6 w-6 text-accent" />
          <span><span className="mr-2 font-mono text-accent">{root.clause_ref}</span>{root.title}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plain-language read-through. Click any clause number for the full text.
          {pendingCount > 0 && ` ${pendingCount} clauses in this chapter are still being summarised.`}
        </p>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5">
        {rows.map((c) => {
          const depth = c.clause_ref.split('.').length - 1
          if (c.kind === 'section' || (c.title && depth <= 1)) {
            return (
              <h2 key={c.id} className="mt-4 border-b border-border pb-1 text-lg font-bold text-primary first:mt-0">
                <Link href={`/portal/employee/sans/clause/${encodeURIComponent(c.clause_ref)}`} className="hover:text-accent">
                  <span className="mr-2 font-mono text-accent">{c.clause_ref}</span>{c.title}
                </Link>
              </h2>
            )
          }
          if (c.title && !c.plain_summary) {
            return (
              <h3 key={c.id} className="mt-3 text-sm font-semibold text-foreground" style={{ marginLeft: Math.min(depth - 1, 3) * 12 }}>
                <Link href={`/portal/employee/sans/clause/${encodeURIComponent(c.clause_ref)}`} className="hover:text-accent">
                  <span className="mr-1.5 font-mono text-accent">{c.clause_ref}</span>{c.title}
                </Link>
              </h3>
            )
          }
          if (!c.plain_summary) return null
          return (
            <p key={c.id} className="py-1 text-[15px] leading-relaxed text-foreground" style={{ marginLeft: Math.min(depth - 1, 3) * 12 }}>
              <Link
                href={`/portal/employee/sans/clause/${encodeURIComponent(c.clause_ref)}`}
                className="mr-1.5 font-mono text-xs font-semibold text-accent hover:underline"
              >
                {c.clause_ref}
              </Link>
              {c.title && <span className="font-semibold">{c.title}. </span>}
              {c.plain_summary}
            </p>
          )
        })}
      </div>
    </div>
  )
}
