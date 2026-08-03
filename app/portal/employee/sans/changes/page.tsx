import Link from 'next/link'
import { GitCompareArrows, Sun } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { AMDT3_GROUPS, AMDT3_META } from '@/lib/sans/amdt3-changes'

/** Amendment 3 (Ed 3.03) change register — what's coming, with PV flags. */
export default function SansChangesPage() {
  const pvCount = AMDT3_GROUPS.reduce(
    (n, g) => n + g.changes.filter((c) => c.pvRelevant).length, 0)
  const total = AMDT3_GROUPS.reduce((n, g) => n + g.changes.length, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="What's Changing — Amendment 3 (Ed 3.03)"
        description={`${total} tracked changes, ${pvCount} directly affecting solar/battery work. ${AMDT3_META.disclaimer}`}
        icon={GitCompareArrows}
      />

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-muted-foreground">
        <span className="font-semibold text-emerald-700">Enforced from today.</span>{' '}
        Rather than waiting for the effective date, the quote and design engine already checks every job
        against Amendment 3 — a system designed now may well be inspected against it by the time its CoC
        is issued, and every Amdt 3 rule is additive over Ed 3.2, so satisfying them satisfies both.
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
        <span className="font-semibold text-amber-700">The headline for Haberl:</span>{' '}
        every PV/battery installation gets its own test report (new Annex S) attached to the CoC,
        PSCC must be summed across paralleled sources including battery BMS data, PV arrays get a
        dedicated DC insulation-resistance test (IEC 62446-1), island-mode neutral-earth bonding
        must live inside the inverter/manufacturer control gear, and PV mounting gains structural
        and fire-risk sign-off requirements.
      </div>

      {AMDT3_GROUPS.map((group) => (
        <div key={group.title}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h2>
          <div className="flex flex-col gap-1.5">
            {group.changes.map((c, i) => (
              <div key={i} className="rounded-lg border border-border bg-card px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {c.linkRef ? (
                    <Link
                      href={`/portal/employee/sans/clause/${encodeURIComponent(c.linkRef)}`}
                      className="font-mono text-sm font-semibold text-accent hover:underline"
                    >
                      {c.ref}
                    </Link>
                  ) : (
                    <span className="font-mono text-sm font-semibold text-foreground">{c.ref}</span>
                  )}
                  {c.pvRelevant && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                      <Sun className="h-3 w-3" /> PV / battery
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{c.change}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">Source: {AMDT3_META.source}.</p>
    </div>
  )
}
