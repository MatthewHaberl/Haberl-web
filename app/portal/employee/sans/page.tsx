import Link from 'next/link'
import {
  BookOpenCheck, Search, ListTree, Lightbulb, Calculator, ClipboardCheck,
  GitCompareArrows, ShieldCheck, BookMarked,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page'
import type { SansDocument } from '@/types/database'

const QUICK_LINKS = [
  { href: '/portal/employee/sans/browse', icon: ListTree, title: 'The Standard', blurb: 'The full clause tree, verbatim, searchable — scope to annexes.' },
  { href: '/portal/employee/sans/dummies', icon: Lightbulb, title: 'Plain Language', blurb: 'Every clause in human words. Read a chapter in minutes, not hours.' },
  { href: '/portal/employee/sans/calculators', icon: Calculator, title: 'Calculators', blurb: 'Voltage drop, cable sizing, earth-loop, PSCC — with clause references.' },
  { href: '/portal/employee/sans/guide', icon: ClipboardCheck, title: 'Field Guide', blurb: 'Quick-reference cards for installers: zones, colours, test values, CoC.' },
  { href: '/portal/employee/sans/changes', icon: GitCompareArrows, title: "What's Changing", blurb: 'Amendment 3 (Ed 3.03) change register — heavy on PV and testing.' },
  { href: '/portal/employee/sans/glossary', icon: BookMarked, title: 'Glossary', blurb: 'All 150 defined terms in plain language, A to Z.' },
  { href: '/portal/employee/settings/rules', icon: ShieldCheck, title: 'Design Rules', blurb: 'The live rules engine the quote builder enforces, mapped to clauses.' },
]

export default async function SansOverviewPage() {
  const supabase = await createClient()

  const { data: docs } = await supabase
    .from('sans_documents').select('*').eq('code', '10142-1').order('edition')
  const inForce = (docs as SansDocument[] | null)?.find((d) => d.status === 'in_force')
  const draft = (docs as SansDocument[] | null)?.find((d) => d.status === 'draft')

  const [{ count: clauseCount }, { count: ruleCount }] = await Promise.all([
    inForce
      ? supabase.from('sans_clauses').select('id', { count: 'exact', head: true }).eq('document_id', inForce.id)
      : Promise.resolve({ count: 0 }),
    supabase.from('sans_rules').select('id', { count: 'exact', head: true }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SANS 10142-1 — The Wiring of Premises"
        description="Part 1: Low-voltage installations. The regulation every install, CoC and design decision answers to."
        icon={BookOpenCheck}
      />

      {/* Search */}
      <form action="/portal/employee/sans/search" method="GET" className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          placeholder='Search the standard — try "voltage drop", "bathroom zone 2", "earth leakage", "6.7.5"…'
          className="h-12 w-full rounded-xl border border-border bg-card pl-12 pr-4 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent"
        />
      </form>

      {/* Edition status */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              Edition {inForce?.edition ?? '3.2'} <span className="text-muted-foreground">({inForce?.published ?? 'July 2024'})</span>
            </p>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">IN FORCE</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {clauseCount ? `${clauseCount.toLocaleString()} clauses loaded, full text + plain language.` : 'Clause library loading — the content pipeline has not run yet.'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              Edition {draft?.edition ?? '3.03'} <span className="text-muted-foreground">(Amendment 3, {draft?.published ?? '2026'})</span>
            </p>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600">ENFORCED NOW</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Published and supersedes Ed 3.2. Every design is checked against Amendment 3 today — Annex S
            report, PSCC across paralleled sources, island-mode earthing, PV insulation test, structural
            and fire sign-off.{' '}
            <Link href="/portal/employee/sans/changes" className="font-medium text-accent hover:underline">See what changes →</Link>
          </p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((l) => {
          const Icon = l.icon
          return (
            <Link
              key={l.href}
              href={l.href}
              className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-accent" />
                <p className="font-semibold text-foreground group-hover:text-primary">{l.title}</p>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{l.blurb}</p>
            </Link>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {ruleCount ? `${ruleCount} design rules mapped to clauses. ` : ''}
        SANS text © SABS — licensed copy for internal use. Verbatim clause text is restricted to admin;
        plain-language summaries, calculators and guides are original Haberl content.
      </p>
    </div>
  )
}
