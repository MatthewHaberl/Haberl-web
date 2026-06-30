'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Receipt, Landmark, Copy, CalendarClock } from 'lucide-react'

const TABS = [
  { href: '/portal/employee/finance',            label: 'Documents',          icon: Receipt },
  { href: '/portal/employee/finance/bank',       label: 'Bank Statements',    icon: Landmark },
  { href: '/portal/employee/finance/timeline',   label: 'Timeline',           icon: CalendarClock },
  { href: '/portal/employee/finance/duplicates', label: 'Possible duplicates', icon: Copy },
]

export function FinanceTabs() {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = t.href === '/portal/employee/finance'
          ? pathname === t.href
          : pathname.startsWith(t.href)
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'border-accent text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
