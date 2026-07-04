'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'

interface PeekData {
  ref: string
  title: string | null
  summary: string | null
  page: number | null
  body: string | null
}

/**
 * Expandable clause chip: click to read what the clause actually says without
 * leaving the current page. Fetches once, then toggles.
 */
export function ClausePeek({ clauseRef }: { clauseRef: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<PeekData | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !data && !loading) {
      setLoading(true)
      try {
        const res = await fetch(`/api/sans/clause/${encodeURIComponent(clauseRef)}`)
        if (res.ok) setData(await res.json())
        else setData({ ref: clauseRef, title: null, summary: null, page: null, body: null })
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <span className="block">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent hover:bg-accent/20"
      >
        SANS {clauseRef}
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <span className="mt-1.5 block rounded-lg border border-border bg-background p-3 text-left font-sans">
          {loading && <span className="text-xs text-muted-foreground">Loading clause…</span>}
          {data && (
            <>
              <span className="block text-sm font-semibold text-foreground">
                {data.ref} {data.title ?? ''}
                {data.page != null && <span className="ml-2 text-xs font-normal text-muted-foreground">Ed 3.2 · p. {data.page}</span>}
              </span>
              {data.summary && (
                <span className="mt-1 block text-sm text-muted-foreground">{data.summary}</span>
              )}
              {data.body && (
                <span className="mt-2 block max-h-56 overflow-y-auto whitespace-pre-wrap border-t border-border/60 pt-2 font-serif text-[13px] leading-relaxed text-foreground">
                  {data.body}
                </span>
              )}
              <Link
                href={`/portal/employee/sans/clause/${encodeURIComponent(clauseRef)}`}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                Open in the library <ExternalLink className="h-3 w-3" />
              </Link>
            </>
          )}
        </span>
      )}
    </span>
  )
}
