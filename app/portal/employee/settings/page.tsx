import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

const sections = [
  {
    href: '/portal/employee/settings/brands',
    title: 'Brands',
    description: 'Manage the brand preferences technicians can pick in the survey form.',
  },
  {
    href: '/portal/employee/settings/catalog',
    title: 'Catalog',
    description: 'Manage the exact inverter, battery, and panel models used by the deterministic calculator.',
  },
  {
    href: '/portal/employee/settings/tier-configs',
    title: 'Tier Configs',
    description: 'Map size brackets to Premium, Recommended, and Budget equipment bundles.',
  },
  {
    href: '/portal/employee/settings/rules',
    title: 'Design Rules',
    description: 'Every SANS 10142-1 and field rule the calculator enforces, plus a live string designer using real catalog specs.',
  },
  {
    href: '/portal/employee/settings/audit-rules',
    title: 'Audit Rules',
    description: 'Editable soft rules for assessing existing systems (E/W on one MPPT, breaker re-sizing, BMS compatibility…). Add or switch them off live.',
  },
]

export default function SettingsRoot() {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Quote Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure the deterministic quote calculator and the survey options behind it.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:border-accent">
              <CardContent className="pt-5">
                <h2 className="text-lg font-semibold text-primary">{section.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
