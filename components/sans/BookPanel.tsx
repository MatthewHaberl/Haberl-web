'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, BookOpen, Crosshair } from 'lucide-react'

/**
 * The actual licensed SANS page rendered beside the structured clause view,
 * with the clause's band highlighted — read the code the way you're used to,
 * top to bottom, exactly where it lives in the book. Admin-only by storage RLS.
 */
export function BookPanel({
  docPage,
  y0,
  y1,
  printedPage,
  clauseRef,
}: {
  docPage: number
  y0: number | null
  y1: number | null
  printedPage: number | null
  clauseRef: string
}) {
  const [page, setPage] = useState(docPage)
  const [failed, setFailed] = useState(false)
  const onClausePage = page === docPage
  const printed = printedPage != null ? printedPage + (page - docPage) : null

  if (failed) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" /> The book — Ed 3.2{printed != null ? `, p. ${printed}` : ''}
        </p>
        <div className="flex items-center gap-1">
          {!onClausePage && (
            <button
              type="button"
              onClick={() => setPage(docPage)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:border-accent"
            >
              <Crosshair className="h-3 w-3" /> Back to {clauseRef}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border border-border p-1.5 text-foreground hover:border-accent disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(349, p + 1))}
            disabled={page >= 349}
            className="rounded-md border border-border p-1.5 text-foreground hover:border-accent disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/sans/page/${page}`}
          alt={`SANS 10142-1 Ed 3.2 — page ${printed ?? page}`}
          className="w-full"
          onError={() => setFailed(true)}
        />
        {onClausePage && y0 != null && y1 != null && y1 > y0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 border-y-2 border-accent/70 bg-accent/15"
            style={{ top: `${y0 * 100}%`, height: `${(y1 - y0) * 100}%` }}
          />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">© SABS — licensed copy, admin view only.</p>
    </div>
  )
}
