import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const BASE = '/keyelectric-demo'

export function Breadcrumb({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-3 text-sm text-[var(--ke-muted)]">
      <Link href={BASE} className="hover:text-[var(--ke-yellow-dark)]">Home</Link>
      {trail.map((t) => (
        <span key={t.label} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          {t.href ? (
            <Link href={t.href} className="hover:text-[var(--ke-yellow-dark)]">{t.label}</Link>
          ) : (
            <span className="font-medium text-[var(--ke-slate)]">{t.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
