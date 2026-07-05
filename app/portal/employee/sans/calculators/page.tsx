import Link from 'next/link'
import { Calculator, Zap, Cable, Earth, Ruler, Waves, PlugZap, Table2, ShieldAlert } from 'lucide-react'
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
  {
    href: '/portal/employee/sans/calculators/earth-loop',
    icon: Waves,
    title: 'Earth-fault loop impedance',
    blurb: '§8.6.5 at the main switch — Zs vs the instantaneous trip (curve × In), plus the neutral-loop check.',
  },
  {
    href: '/portal/employee/sans/calculators/pscc',
    icon: PlugZap,
    title: 'PSCC',
    blurb: '§8.4 — fault current from transformer + cable (table D.1), Amdt 3 paralleled-source summation, switchgear-rating check.',
  },
  {
    href: '/portal/employee/sans/calculators/spd-risk',
    icon: ShieldAlert,
    title: 'SPD risk assessment',
    blurb: 'Annex Q — pick the town (180 SA lightning densities), environment and service-line length; get the SPD class and rating required.',
  },
  {
    href: '/portal/employee/sans/calculators/tables',
    icon: Table2,
    title: 'Reference tables',
    blurb: 'Read the raw numbers — ampacity, voltage drop and ECC limits as printed, no inputs needed.',
  },
]

const COMING: { icon: typeof Calculator; title: string; blurb: string }[] = []

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
        Cable tables cover copper, aluminium, rubber-insulated and buried (6.2–6.9) — every value
        double-verified against an independent transcription. The PV string designer lives in{' '}
        <Link href="/portal/employee/settings/rules" className="font-medium text-accent hover:underline">Design Rules</Link>.
      </p>
    </div>
  )
}
