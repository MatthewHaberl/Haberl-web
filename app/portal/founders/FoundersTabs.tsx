'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function FoundersTabs({
  questionsLabel, referenceLabel,
}: { questionsLabel: string; referenceLabel: string }) {
  const pathname = usePathname()
  const tabs = [
    { href: '/portal/founders', label: questionsLabel },
    { href: '/portal/founders/reference', label: referenceLabel },
  ]

  return (
    <nav className="flex gap-1 rounded-lg border border-border p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
