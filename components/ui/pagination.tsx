import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Reusable list pagination: a page-size selector, "showing X–Y of Z", and
 * numbered page links with Prev/Next. Server-rendered and URL-driven (no client
 * JS) — the parent supplies `makeHref` so each list keeps its own filter/query
 * rules. `page` is 0-indexed; size-change links always reset to the first page.
 */
export function Pagination({
  page, pageSize, total, makeHref, sizeOptions = [25, 50, 100, 200],
}: {
  page: number
  pageSize: number
  total: number
  makeHref: (o: { page?: number; per?: number }) => string
  sizeOptions?: number[]
}) {
  if (total === 0) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const cur = Math.min(page, totalPages - 1)
  const last = totalPages - 1
  const showingFrom = cur * pageSize + 1
  const showingTo = Math.min(total, cur * pageSize + pageSize)

  // Always show first/last and a ±1 window around the current page; collapse
  // the rest into gaps.
  const wanted = [0, last, cur - 1, cur, cur + 1].filter((n) => n >= 0 && n <= last)
  const shown = [...new Set(wanted)].sort((a, b) => a - b)
  const items: (number | 'gap')[] = []
  shown.forEach((n, i) => {
    if (i > 0 && n - shown[i - 1] > 1) items.push('gap')
    items.push(n)
  })

  const navBtn = 'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-border px-2 text-sm hover:bg-muted'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <span>Showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of {total.toLocaleString()}</span>
        <span className="flex items-center gap-1">
          <span>Show</span>
          {sizeOptions.map((n) => (
            <Link
              key={n}
              href={makeHref({ per: n, page: 0 })}
              className={`rounded-md border px-2 py-0.5 ${
                n === pageSize ? 'border-accent bg-accent/5 text-foreground' : 'border-border hover:bg-muted'
              }`}
            >
              {n}
            </Link>
          ))}
          <span>per page</span>
        </span>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {cur > 0 ? (
            <Link href={makeHref({ page: cur - 1 })} className={navBtn} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className={`${navBtn} opacity-40`} aria-disabled><ChevronLeft className="h-4 w-4" /></span>
          )}

          {items.map((it, i) =>
            it === 'gap' ? (
              <span key={`gap-${i}`} className="px-1">…</span>
            ) : (
              <Link
                key={it}
                href={makeHref({ page: it })}
                aria-current={it === cur ? 'page' : undefined}
                className={`${navBtn} ${it === cur ? 'border-accent bg-accent/5 font-medium text-foreground' : ''}`}
              >
                {it + 1}
              </Link>
            ),
          )}

          {cur < last ? (
            <Link href={makeHref({ page: cur + 1 })} className={navBtn} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={`${navBtn} opacity-40`} aria-disabled><ChevronRight className="h-4 w-4" /></span>
          )}
        </div>
      )}
    </div>
  )
}
