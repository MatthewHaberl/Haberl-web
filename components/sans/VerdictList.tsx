import Link from 'next/link'
import type { Verdict } from '@/lib/sans/calculators'

/** Clause-cited pass/warn/fail verdict rows shared by the SANS calculators. */
export function VerdictList({ verdicts }: { verdicts: Verdict[] }) {
  return (
    <div className="flex flex-col gap-2">
      {verdicts.map((v, i) => (
        <div
          key={i}
          className={`rounded-lg border p-3 ${
            v.status === 'fail'
              ? 'border-destructive/40 bg-destructive/5'
              : v.status === 'warning'
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-emerald-500/40 bg-emerald-500/5'
          }`}
        >
          <p className="text-sm font-semibold text-foreground">
            {v.status === 'fail' ? '⛔' : v.status === 'warning' ? '⚠️' : '✅'} {v.headline}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{v.detail}</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {v.clauseRefs.map((ref) => (
              <Link
                key={ref}
                href={`/portal/employee/sans/clause/${encodeURIComponent(ref)}`}
                className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent hover:bg-accent/20"
              >
                SANS {ref}
              </Link>
            ))}
          </p>
        </div>
      ))}
    </div>
  )
}
