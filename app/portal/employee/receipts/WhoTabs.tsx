'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

/** Manager-only scope switch: my own slips, or the whole team's. */
export function WhoTabs({ who }: { who: 'mine' | 'all' }) {
  const tabs = [
    { key: 'mine', label: 'Mine', href: '/portal/employee/receipts' },
    { key: 'all', label: 'Everyone', href: '/portal/employee/receipts?who=all' },
  ] as const
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            who === t.key
              ? 'border-accent text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
