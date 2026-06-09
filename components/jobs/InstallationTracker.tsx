import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, Hammer } from 'lucide-react'
import { PIPELINE_STAGES, STAGE_META, stageIndex } from '@/lib/jobs/stages'
import type { Job, JobStage, JobStatusHistory } from '@/types/database'

interface Props {
  job: Pick<Job, 'id' | 'title' | 'stage' | 'scheduled_date'>
  history: JobStatusHistory[]
}

// Read-only order-tracking-style view of an installation for the customer portal.
// Only customer_visible history reaches this component (enforced by RLS).
export function InstallationTracker({ job, history }: Props) {
  const stage = job.stage
  const isCancelled = stage === 'cancelled'
  const isOnHold = stage === 'on_hold'
  const currentIndex = stageIndex(stage)
  const meta = STAGE_META[stage]

  const updates = [...history].reverse().slice(0, 6)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-accent" /> Installation Progress
          </CardTitle>
          <Badge variant={stage === 'completed' ? 'success' : isCancelled ? 'destructive' : 'warning'}>
            {meta?.customerLabel ?? stage}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">

        {/* Stepper */}
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
          {PIPELINE_STAGES.map((s, i) => {
            const sMeta = STAGE_META[s]
            const done = !isCancelled && !isOnHold && i < currentIndex
            const active = s === stage
            return (
              <div key={s} className="flex items-center shrink-0">
                {i > 0 && (
                  <div className={`h-0.5 w-4 sm:w-7 ${done || active ? 'bg-success' : 'bg-border'}`} />
                )}
                <div className="flex flex-col items-center gap-1 px-1">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold border-2
                      ${done ? 'bg-success border-success text-white'
                        : active ? 'border-accent text-accent bg-accent/10'
                        : 'border-border text-muted-foreground'}`}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={`text-[10px] whitespace-nowrap ${active ? 'text-accent font-semibold' : 'text-muted-foreground'}`}>
                    {sMeta.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {!isCancelled && meta && (
          <p className="text-sm text-muted-foreground -mt-2">{STAGE_META[stage].description}</p>
        )}

        {/* Latest updates */}
        {updates.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Latest updates
            </p>
            <ol className="flex flex-col">
              {updates.map((entry) => (
                <li key={entry.id} className="flex gap-3 text-sm py-2 border-b border-border last:border-0">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">
                    {new Date(entry.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  </span>
                  <span>
                    <span className="font-medium">
                      {STAGE_META[entry.stage as JobStage]?.customerLabel ?? entry.stage}
                    </span>
                    {entry.note && <span className="text-muted-foreground"> — {entry.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
