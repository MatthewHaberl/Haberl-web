'use client'

// Start / stop the clock. One running entry per person is enforced by a partial
// unique index (migration 112), so a double-tap on Start fails at the database
// rather than quietly billing the day twice — the error below says as much.

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Play, Square, Timer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { hoursFromClock, isoDate } from '@/lib/staff/pay'
import { elapsed } from './staff/shared'

interface Running {
  id: string
  startedAt: string | null
  jobId: string | null
  jobTitle: string | null
}

export function ClockControls({
  staffId,
  costRateR,
  overtimeMultiplier,
  jobs,
  running,
}: {
  staffId: string
  costRateR: number
  overtimeMultiplier: number
  jobs: { id: string; title: string }[]
  running: Running | null
}) {
  const router = useRouter()
  const [jobId, setJobId] = useState(running?.jobId ?? '')
  const [breakMinutes, setBreakMinutes] = useState('30')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ticks the elapsed readout once a minute — a stopwatch that never moves
  // looks broken, and per-second precision is noise for a day's work.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running?.startedAt) return
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [running?.startedAt])

  async function start() {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const startedAt = new Date()

    const { error: dbError } = await supabase.from('time_entries').insert({
      staff_id: staffId,
      job_id: jobId || null,
      work_date: isoDate(startedAt),
      started_at: startedAt.toISOString(),
      hours: 0,
      overtime_hours: 0,
      category: 'work',
      cost_rate_r: costRateR,
      overtime_multiplier: overtimeMultiplier,
      source: 'clock',
      status: 'running',
      created_by: auth.user?.id ?? null,
    })

    setBusy(false)
    if (dbError) {
      setError(
        dbError.code === '23505'
          ? 'You are already clocked in — reload the page.'
          : dbError.message,
      )
      return
    }
    router.refresh()
  }

  async function stop() {
    if (!running?.startedAt) return
    setBusy(true)
    setError(null)

    const endedAt = new Date()
    const mins = Math.max(0, Number(breakMinutes) || 0)
    const hours = hoursFromClock(running.startedAt, endedAt.toISOString(), mins)

    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('time_entries')
      .update({
        ended_at: endedAt.toISOString(),
        break_minutes: mins,
        hours,
        // 'submitted', not 'approved': self-captured hours still go past a
        // manager before they reach a payslip.
        status: 'submitted',
      })
      .eq('id', running.id)

    setBusy(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    router.refresh()
  }

  if (running?.startedAt) {
    const worked = hoursFromClock(running.startedAt, new Date(now).toISOString(), Number(breakMinutes) || 0)
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <div className="flex items-center gap-3">
            <Timer className="h-6 w-6 text-success" />
            <div>
              <p className="text-sm font-semibold text-success">
                On the clock · {elapsed(running.startedAt, now)}
              </p>
              <p className="text-xs text-muted-foreground">
                {running.jobTitle ?? 'No job'} · started{' '}
                {new Date(running.startedAt).toLocaleTimeString('en-ZA', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {worked > 0 && ` · ${worked.toFixed(2)} hr after break`}
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="clock-break" className="mb-1 block text-xs text-muted-foreground">
                Unpaid break
              </label>
              <Input
                id="clock-break"
                inputMode="numeric"
                trailingText="min"
                className="w-28"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </div>
            <Button type="button" onClick={stop} disabled={busy}>
              <Square className="mr-2 h-4 w-4" />
              {busy ? 'Stopping…' : 'Clock out'}
            </Button>
          </div>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-6">
        <div className="flex items-center gap-3">
          <Timer className="h-6 w-6 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Not clocked in</p>
            <p className="text-xs text-muted-foreground">
              Start the clock when you get on site — your hours go to your timesheet.
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div className="min-w-[220px]">
            <label htmlFor="clock-job" className="mb-1 block text-xs text-muted-foreground">
              Job
            </label>
            <Select id="clock-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No job (workshop, yard)</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={start} disabled={busy}>
            <Play className="mr-2 h-4 w-4" />
            {busy ? 'Starting…' : 'Clock in'}
          </Button>
        </div>
        {error && <p className="w-full text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
