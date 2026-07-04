'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'

export interface GlossaryTerm {
  id: string
  ref: string
  term: string
  summary: string | null
}

/** Client-filterable A–Z list of section-3 definitions. */
export function GlossaryList({ terms }: { terms: GlossaryTerm[] }) {
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = needle
      ? terms.filter((t) => t.term.toLowerCase().includes(needle) || t.summary?.toLowerCase().includes(needle))
      : terms
    const byLetter = new Map<string, GlossaryTerm[]>()
    for (const t of filtered) {
      const letter = (t.term[0] ?? '#').toUpperCase()
      if (!byLetter.has(letter)) byLetter.set(letter, [])
      byLetter.get(letter)!.push(t)
    }
    return [...byLetter.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [terms, q])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter terms…"
          className="h-10 w-full max-w-md rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
        />
      </div>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">No terms match.</p>}

      {groups.map(([letter, items]) => (
        <div key={letter}>
          <h2 className="mb-1.5 border-b border-border pb-1 text-sm font-bold uppercase tracking-wide text-accent">{letter}</h2>
          <dl className="flex flex-col gap-1.5">
            {items.map((t) => (
              <div key={t.id} className="rounded-lg px-2 py-1.5 hover:bg-muted/50">
                <dt className="text-sm font-semibold text-foreground">
                  {t.term}{' '}
                  <Link
                    href={`/portal/employee/sans/clause/${encodeURIComponent(t.ref)}`}
                    className="ml-1 font-mono text-xs font-medium text-accent hover:underline"
                  >
                    {t.ref}
                  </Link>
                </dt>
                {t.summary && <dd className="text-sm text-muted-foreground">{t.summary}</dd>}
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
