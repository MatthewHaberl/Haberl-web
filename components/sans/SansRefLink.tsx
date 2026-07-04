import Link from 'next/link'
import { Fragment } from 'react'

/**
 * Renders a compliance reference string ("SANS 10142-1 §7.12.4 / RULE-AC-01")
 * with each SANS clause number linked into the SANS library browser.
 */
export function SansRefLink({ reference, className }: { reference: string; className?: string }) {
  const parts = reference.split(/(§\s?\d+(?:\.\d+)*)/g)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const m = part.match(/^§\s?(\d+(?:\.\d+)*)$/)
        if (!m) return <Fragment key={i}>{part}</Fragment>
        return (
          <Link
            key={i}
            href={`/portal/employee/sans/clause/${encodeURIComponent(m[1])}`}
            className="text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </Link>
        )
      })}
    </span>
  )
}
