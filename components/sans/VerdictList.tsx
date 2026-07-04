import type { Verdict } from '@/lib/sans/calculators'
import { ClausePeek } from './ClausePeek'

/**
 * Clause-cited pass/warn/fail verdict rows shared by the SANS calculators.
 * Each clause chip expands inline to show the actual clause wording.
 */
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
          <div className="mt-1.5 flex flex-col gap-1">
            {v.clauseRefs.map((ref) => (
              <ClausePeek key={ref} clauseRef={ref} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
