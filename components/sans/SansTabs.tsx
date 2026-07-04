'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ListTree, Lightbulb, Calculator, ClipboardCheck, GitCompareArrows,
} from 'lucide-react'

const TABS = [
  { href: '/portal/employee/sans',             label: 'Overview',        icon: LayoutDashboard },
  { href: '/portal/employee/sans/browse',      label: 'The Standard',    icon: ListTree },
  { href: '/portal/employee/sans/dummies',     label: 'Plain Language',  icon: Lightbulb },
  { href: '/portal/employee/sans/calculators', label: 'Calculators',     icon: Calculator },
  { href: '/portal/employee/sans/guide',       label: 'Field Guide',     icon: ClipboardCheck },
  { href: '/portal/employee/sans/changes',     label: "What's Changing", icon: GitCompareArrows },
]

export function SansTabs() {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        // Clause pages and the glossary belong to "The Standard"; search stays under Overview.
        const active = t.href === '/portal/employee/sans'
          ? pathname === t.href || pathname.startsWith('/portal/employee/sans/search')
          : t.href === '/portal/employee/sans/browse'
            ? pathname.startsWith(t.href) || pathname.startsWith('/portal/employee/sans/clause') || pathname.startsWith('/portal/employee/sans/glossary')
            : pathname.startsWith(t.href)
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
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
