import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Columns2, Lightbulb, ScrollText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { sortKeyFor, FRONT_MATTER_TITLES } from '@/lib/sans/refs'

interface ReadRow {
  id: string
  clause_ref: string
  parent_ref: string | null
  title: string | null
  kind: string
  page_number: number | null
  plain_summary: string | null
  sort_key: string
  sans_clause_bodies: { body: string }[] | { body: string } | null
}

function bodyOf(row: ReadRow): string | null {
  const b = row.sans_clause_bodies
  if (!b) return null
  return Array.isArray(b) ? (b[0]?.body ?? null) : b.body
}

/**
 * Side-by-side reader: the verbatim standard and the plain-language version of
 * a whole subtree in one continuous scroll, aligned clause by clause.
 */
export default async function SansReadPage({
  params,
}: {
  params: Promise<{ ref: string }>
}) {
  const { ref: rawRef } = await params
  const ref = decodeURIComponent(rawRef)
  const supabase = await createClient()

  const key = sortKeyFor(ref)
  const { data } = await supabase
    .from('sans_clauses')
    .select('id, clause_ref, parent_ref, title, kind, page_number, plain_summary, sort_key, sans_clause_bodies(body)')
    .gte('sort_key', key)
    .lte('sort_key', key + '.zzz')
    .order('sort_key')
    .limit(1000)

  const rows = (data as ReadRow[] | null) ?? []
  if (rows.length === 0) notFound()
  const root = rows[0]
  const rootTitle = root.title ?? FRONT_MATTER_TITLES[ref.toLowerCase()] ?? ref
  const anyBody = rows.some((r) => bodyOf(r))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/portal/employee/sans/clause/${encodeURIComponent(ref)}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to {ref}
        </Link>
        {root.parent_ref && (
          <Link
            href={`/portal/employee/sans/read/${encodeURIComponent(root.parent_ref)}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent"
          >
            <Columns2 className="h-4 w-4" /> Widen to {root.parent_ref}
          </Link>
        )}
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Columns2 className="h-6 w-6 text-accent" />
          <span><span className="mr-2 font-mono text-accent">{root.clause_ref}</span>{rootTitle}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} clauses, read like the book — the letter of the law on the left, what it means on the right.
        </p>
      </div>

      {!anyBody && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          Verbatim standard text is admin-only — the left column needs an admin login.
        </p>
      )}

      {/* Sticky column labels */}
      <div className="sticky top-0 z-10 -mx-1 hidden grid-cols-2 gap-4 border-b border-border bg-background/95 px-1 py-2 backdrop-blur lg:grid">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5" /> The Standard — SANS 10142-1:2024 Ed 3.2 © SABS
        </p>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
          <Lightbulb className="h-3.5 w-3.5" /> In plain language
        </p>
      </div>

      <div className="flex flex-col">
        {rows.map((row) => {
          const body = bodyOf(row)
          const depth = row.clause_ref.split('.').length - 1
          const isHeadingRow = row.kind === 'section' || (row.title && depth <= 1)
          return (
            <div key={row.id} className={isHeadingRow ? 'mt-6 first:mt-0' : ''}>
              {/* Clause heading spans both columns */}
              <div className={`border-b border-border/60 py-1.5 ${isHeadingRow ? 'border-border' : ''}`}>
                <Link
                  href={`/portal/employee/sans/clause/${encodeURIComponent(row.clause_ref)}`}
                  className={`${isHeadingRow ? 'text-lg font-bold text-primary' : 'text-sm font-semibold text-foreground'} hover:text-accent`}
                >
                  <span className="mr-2 font-mono text-accent">{row.clause_ref}</span>
                  {row.title}
                </Link>
                {row.page_number != null && (
                  <span className="ml-2 text-[11px] text-muted-foreground">p. {row.page_number}</span>
                )}
              </div>
              {(body || row.plain_summary) && (
                <div className="grid gap-x-4 gap-y-1 border-b border-border/40 py-2.5 lg:grid-cols-2">
                  <div className="min-w-0 whitespace-pre-wrap font-serif text-[14px] leading-relaxed text-foreground">
                    {body ?? <span className="font-sans text-muted-foreground">—</span>}
                  </div>
                  <div className="min-w-0 border-l-2 border-accent/20 pl-3 text-[14px] leading-relaxed text-muted-foreground lg:border-l-0 lg:pl-0">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-accent lg:hidden">Plain language</span>
                    {row.plain_summary ?? '—'}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Numeric tables appear as placeholders here — the values live in the{' '}
        <Link href="/portal/employee/sans/calculators/tables" className="font-medium text-accent hover:underline">reference tables</Link>{' '}
        and calculators. Click any clause number for the full view with the book page and linked rules.
      </p>
    </div>
  )
}
