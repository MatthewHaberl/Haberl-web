'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { PIPELINE_STAGES, STAGE_META, nextStage, stageIndex } from '@/lib/jobs/stages'
import type { Job, JobStage, JobStatusHistory } from '@/types/database'
import {
  ArrowRight, Check, Eye, EyeOff, Loader2, MessageSquarePlus, PauseCircle, PlayCircle, XCircle,
} from 'lucide-react'

interface Props {
  job: Pick<Job, 'id' | 'stage' | 'on_hold_reason'>
  history: JobStatusHistory[]
  canAdvance: boolean
}

export function StagePipeline({ job, history, canAdvance }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const supabase = createClient()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [holdReason, setHoldReason] = useState('')
  const [showHoldInput, setShowHoldInput] = useState(false)
  const [updateNote, setUpdateNote] = useState('')
  const [updateVisible, setUpdateVisible] = useState(true)
  const [postingUpdate, setPostingUpdate] = useState(false)

  const stage = job.stage
  const isOnHold = stage === 'on_hold'
  const isCancelled = stage === 'cancelled'
  const currentIndex = stageIndex(stage)
  const next = nextStage(stage)

  // Stage to return to when resuming a hold: last linear stage in history
  const resumeStage: JobStage = (() => {
    for (let i = history.length - 1; i >= 0; i--) {
      const s = history[i].stage as JobStage
      if (PIPELINE_STAGES.includes(s)) return s
    }
    return 'deposit_pending'
  })()

  async function setStage(nextValue: JobStage, holdNote?: string) {
    setBusy(true)
    setError('')
    const { error: dbError } = await supabase
      .from('jobs')
      .update({
        stage: nextValue,
        on_hold_reason: nextValue === 'on_hold' ? (holdNote || null) : null,
      })
      .eq('id', job.id)
    if (dbError) setError(dbError.message)
    else {
      // Fire-and-forget customer notification for the stages that warrant one.
      if (nextValue === 'scheduled' || nextValue === 'installation' || nextValue === 'handover') {
        fetch(`/api/jobs/${job.id}/notify-stage`, { method: 'POST' }).catch(() => {})
      }
      router.refresh()
    }
    setBusy(false)
    setShowHoldInput(false)
    setHoldReason('')
  }

  async function postUpdate() {
    if (!updateNote.trim()) return
    setPostingUpdate(true)
    setError('')
    const { error: dbError } = await supabase.from('job_status_history').insert({
      job_id: job.id,
      stage,
      note: updateNote.trim(),
      customer_visible: updateVisible,
    })
    if (dbError) setError(dbError.message)
    else {
      setUpdateNote('')
      router.refresh()
    }
    setPostingUpdate(false)
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Stepper */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-0 overflow-x-auto pb-1">
            {PIPELINE_STAGES.map((s, i) => {
              const meta = STAGE_META[s]
              const done = !isCancelled && !isOnHold && i < currentIndex
              const active = s === stage
              return (
                <div key={s} className="flex items-center shrink-0">
                  {i > 0 && (
                    <div className={`h-0.5 w-5 sm:w-8 ${done || active ? 'bg-success' : 'bg-border'}`} />
                  )}
                  <div className="flex flex-col items-center gap-1 px-1" title={meta.description}>
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors
                        ${done ? 'bg-success border-success text-white'
                          : active ? 'border-accent text-accent bg-accent/10'
                          : 'border-border text-muted-foreground'}`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={`text-[10px] whitespace-nowrap ${active ? 'text-accent font-semibold' : 'text-muted-foreground'}`}>
                      {meta.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {(isOnHold || isCancelled) && (
            <div className="mt-3 rounded-md bg-warning/10 border border-warning/40 px-3 py-2 text-sm">
              <span className="font-medium">{STAGE_META[stage].label}</span>
              {job.on_hold_reason && <span className="text-muted-foreground"> — {job.on_hold_reason}</span>}
            </div>
          )}

          {/* Actions */}
          {canAdvance && !isCancelled && (
            <div className="flex items-center gap-2 flex-wrap mt-4">
              {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {!busy && isOnHold && (
                <Button variant="accent" size="sm" onClick={() => setStage(resumeStage)}>
                  <PlayCircle className="h-3.5 w-3.5" /> Resume — {STAGE_META[resumeStage].label}
                </Button>
              )}
              {!busy && !isOnHold && next && (
                <Button variant="accent" size="sm" onClick={() => setStage(next)}>
                  Advance to {STAGE_META[next].label} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
              {!busy && !isOnHold && stage !== 'completed' && (
                showHoldInput ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={holdReason}
                      onChange={(e) => setHoldReason(e.target.value)}
                      placeholder="Hold reason (e.g. awaiting stock, customer travelling)"
                      className="h-8 w-72 text-sm"
                    />
                    <Button variant="outline" size="sm" onClick={() => setStage('on_hold', holdReason)} disabled={!holdReason.trim()}>
                      Hold
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowHoldInput(false)}>Cancel</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowHoldInput(true)}>
                    <PauseCircle className="h-3.5 w-3.5" /> Put on hold
                  </Button>
                )
              )}
              {!busy && stage !== 'completed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={async () => {
                    if (await confirm({
                      title: 'Cancel this job?',
                      body: 'The customer timeline will show it as cancelled.',
                      confirmText: 'Cancel job',
                      cancelText: 'Keep job',
                      destructive: true,
                    })) {
                      setStage('cancelled')
                    }
                  }}
                >
                  <XCircle className="h-3.5 w-3.5" /> Cancel job
                </Button>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

      {/* Post an update */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-accent" /> Post an update
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <textarea
            value={updateNote}
            onChange={(e) => setUpdateNote(e.target.value)}
            placeholder="e.g. Inverter and battery arrived — install confirmed for Thursday 08:00"
            rows={2}
            className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setUpdateVisible((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {updateVisible
                ? <><Eye className="h-3.5 w-3.5 text-success" /> Visible to customer</>
                : <><EyeOff className="h-3.5 w-3.5" /> Internal only</>}
            </button>
            <Button variant="outline" size="sm" onClick={postUpdate} disabled={postingUpdate || !updateNote.trim()}>
              {postingUpdate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Post update'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ol className="flex flex-col gap-0">
              {[...history].reverse().map((entry) => {
                const meta = STAGE_META[entry.stage as JobStage]
                return (
                  <li key={entry.id} className="flex gap-3 text-sm py-2 border-b border-border last:border-0">
                    <div className="w-36 shrink-0 text-xs text-muted-foreground pt-0.5">
                      {new Date(entry.created_at).toLocaleString('en-ZA', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default">{meta?.label ?? entry.stage}</Badge>
                        {!entry.customer_visible && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">internal</span>
                        )}
                        {entry.changer?.full_name && (
                          <span className="text-xs text-muted-foreground">{entry.changer.full_name}</span>
                        )}
                      </div>
                      {entry.note && <p className="text-sm">{entry.note}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
