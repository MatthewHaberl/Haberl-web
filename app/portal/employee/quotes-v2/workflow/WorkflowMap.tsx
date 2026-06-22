'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Flag, ArrowLeft, CheckCircle2, XCircle, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import type { WorkflowDiagram } from './diagrams'

export interface CatchPoint {
  id: string
  flow_id: string
  step_label: string | null
  note: string
  severity: 'block' | 'warn' | 'info'
  status: string
  created_at: string
}

const severityVariant: Record<CatchPoint['severity'], 'default' | 'warning' | 'success'> = {
  block: 'warning',
  warn: 'warning',
  info: 'default',
}

// Maps the four diagram CSS variables onto the app's brand tokens, so the
// embedded SVGs render in the app's theme without per-shape recolouring.
const diagramThemeVars = {
  ['--color-text-primary' as string]: 'var(--foreground)',
  ['--color-text-secondary' as string]: 'var(--muted-foreground)',
  ['--color-border-tertiary' as string]: 'var(--border)',
  ['--color-background-primary' as string]: 'var(--card)',
} as React.CSSProperties

interface Props {
  diagrams: WorkflowDiagram[]
  initialCatchPoints: CatchPoint[]
  currentUserId: string
}

export function WorkflowMap({ diagrams, initialCatchPoints, currentUserId }: Props) {
  const [activeId, setActiveId] = useState(diagrams[0]?.id ?? '')
  const [catchPoints, setCatchPoints] = useState<CatchPoint[]>(initialCatchPoints)

  const [stepLabel, setStepLabel] = useState('')
  const [note, setNote] = useState('')
  const [severity, setSeverity] = useState<CatchPoint['severity']>('warn')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewAll, setViewAll] = useState(false)

  const active = diagrams.find((d) => d.id === activeId) ?? diagrams[0]
  const flowCatchPoints = catchPoints.filter((c) => c.flow_id === activeId)
  const shown = viewAll ? catchPoints : flowCatchPoints
  const flowLabel = (id: string) => diagrams.find((d) => d.id === id)?.label ?? id

  async function updateStatus(id: string, status: 'open' | 'added' | 'dismissed') {
    const supabase = createClient()
    const { error: dbErr } = await supabase.from('quote_catch_points').update({ status }).eq('id', id)
    if (!dbErr) setCatchPoints((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
  }

  async function addCatchPoint(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { data, error: dbErr } = await supabase
        .from('quote_catch_points')
        .insert({
          flow_id: activeId,
          step_label: stepLabel.trim() || null,
          note: note.trim(),
          severity,
          created_by: currentUserId,
        })
        .select()
        .single()

      if (dbErr) {
        setError(
          dbErr.message.includes('quote_catch_points')
            ? 'Catch-points store not enabled yet — run migration 033, then this will save.'
            : dbErr.message,
        )
        return
      }
      if (data) setCatchPoints((prev) => [data as CatchPoint, ...prev])
      setStepLabel('')
      setNote('')
      setSeverity('warn')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Workflow map</h1>
          <p className="text-muted-foreground mt-1">
            The quoting workflow, in detail. Spot a gap mid-quote? Flag a catch-point and it becomes a candidate rule.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/portal/employee/quotes-v2">
            <ArrowLeft className="h-4 w-4" />
            Back to Quotes
          </Link>
        </Button>
      </div>

      {/* Flow selector */}
      <div className="flex flex-wrap gap-2">
        {diagrams.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setActiveId(d.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              d.id === activeId
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Diagram */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{active?.description}</p>
          <div
            className="overflow-x-auto rounded-xl border border-border bg-card p-3"
            style={diagramThemeVars}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: active?.svg ?? '' }}
          />
        </div>

        {/* Catch-points */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-5 pb-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold">Flag a catch-point</h2>
              </div>
              <form onSubmit={addCatchPoint} className="flex flex-col gap-2.5">
                <Input
                  value={stepLabel}
                  onChange={(e) => setStepLabel(e.target.value)}
                  placeholder="Which step? (e.g. Inverter sizing)"
                />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What needs catching here?"
                  rows={3}
                  className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
                />
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as CatchPoint['severity'])}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="block">Block — must fix before quoting</option>
                  <option value="warn">Warn — flag, allow override</option>
                  <option value="info">Info — advisory</option>
                </select>
                {error && (
                  <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                )}
                <Button type="submit" variant="accent" size="sm" disabled={saving || !note.trim()} className="self-start">
                  {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Flag className="h-3.5 w-3.5" />Add catch-point</>}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {viewAll ? `All flagged (${catchPoints.length})` : `On this flow (${flowCatchPoints.length})`}
              </h3>
              <button type="button" onClick={() => setViewAll((v) => !v)} className="text-xs text-accent hover:underline">
                {viewAll ? 'This flow only' : 'View all'}
              </button>
            </div>
            {shown.length === 0 ? (
              <p className="text-xs text-muted-foreground italic border border-dashed border-border rounded-lg px-3 py-6 text-center">
                Nothing flagged {viewAll ? 'yet' : 'here yet'}
              </p>
            ) : (
              shown.map((c) => (
                <Card key={c.id} className={c.status === 'dismissed' ? 'opacity-60' : ''}>
                  <CardContent className="py-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={severityVariant[c.severity]}>{c.severity}</Badge>
                      {viewAll && <span className="text-xs text-muted-foreground">{flowLabel(c.flow_id)}</span>}
                      {c.step_label && <span className="text-xs font-medium">{c.step_label}</span>}
                      {c.status !== 'open' && <Badge variant="default">{c.status}</Badge>}
                    </div>
                    <p className="text-sm">{c.note}</p>
                    <div className="flex items-center gap-3 pt-0.5">
                      {c.status !== 'added' && (
                        <button type="button" onClick={() => updateStatus(c.id, 'added')} className="text-xs text-success hover:underline flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Mark added
                        </button>
                      )}
                      {c.status !== 'dismissed' ? (
                        <button type="button" onClick={() => updateStatus(c.id, 'dismissed')} className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Dismiss
                        </button>
                      ) : (
                        <button type="button" onClick={() => updateStatus(c.id, 'open')} className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" /> Reopen
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
