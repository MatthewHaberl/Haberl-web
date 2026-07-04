import Link from 'next/link'
import { Calculator, Zap, Cable, Earth, Ruler, Waves, PlugZap } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'

const LIVE = [
  {
    href: '/portal/employee/sans/calculators/voltage-drop',
    icon: Zap,
    title: 'Voltage drop',
    blurb: 'Tables 6.2(b)–6.4(b) — every cable type and installation method, 1φ/3φ/DC, power factor, max-run-length. The 5 % / 11,5 V / 20 V verdicts of §6.2.7.',
  },
  {
    href: '/portal/employee/sans/calculators/cable-capacity',
    icon: Cable,
    title: 'Cable current capacity',
    blurb: 'Base ratings from tables 6.2(a)–6.4(a), corrected for ambient temperature (6.10) and grouping (6.14), checked against load and breaker (§6.7.2.1 + table 6.27).',
  },
  {
    href: '/portal/employee/sans/calculators/earthing',
    icon: Earth,
    title: 'Earth conductor sizing',
    blurb: 'Table 6.25 — minimum protective conductor from phase conductor size, rounded to standard sizes.',
  },
  {
    href: '/portal/employee/sans/calculators/conduit-fill',
    icon: Ruler,
    title: 'Conduit fill',
    blurb: 'Tables 6.22–6.24 + Annex F — mixed cable sizes, ΣC ≤ K, the smallest pipe that legally fits.',
  },
]

const COMING = [
  { icon: Waves, title: 'Earth-fault loop impedance', blurb: 'Max Zs per breaker curve + the new 8.6.5 main-switch formula (Amdt 3).' },
  { icon: PlugZap, title: 'PSCC', blurb: 'Prospective short-circuit current incl. paralleled PV/battery sources (8.4.7, Amdt 3).' },
]

export default function SansCalculatorsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calculators"
        description="SANS values straight from the tables — every result cites its clause so the CoC paper trail writes itself."
        icon={Calculator}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LIVE.map((c) => {
          const Icon = c.icon
          return (
            <Link key={c.href} href={c.href} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-accent" />
                <p className="font-semibold text-foreground group-hover:text-primary">{c.title}</p>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{c.blurb}</p>
            </Link>
          )
        })}
        {COMING.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.title} className="rounded-xl border border-dashed border-border bg-card/50 p-4 opacity-75">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <p className="font-semibold text-muted-foreground">{c.title}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">soon</span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{c.blurb}</p>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Aluminium-conductor and rubber-insulated cable tables (6.5–6.9) plus buried-cable factors load with the
        next content batch. The PV string designer lives in{' '}
        <Link href="/portal/employee/settings/rules" className="font-medium text-accent hover:underline">Design Rules</Link>.
      </p>
    </div>
  )
}
