'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { History, Loader2, Play, Square, FlaskConical, Upload, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const HISTORY_BRANDS = new Set(['sunsynk', 'victron'])

interface Job {
  id: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  cursor_day: string
  earliest_day: string | null
  days_done: number
  rows_written: number
  error: string | null
}

const btn =
  'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium ' +
  'hover:bg-muted transition-colors disabled:opacity-50'

/**
 * History tools for one system: an automated brand-cloud backfill (walks back to
 * the install date, driven chunk-by-chunk from the client so it survives
 * serverless timeouts) and a per-minute CSV importer for portal exports.
 */
export function HistoryPanel({ systemId, brand }: { systemId: string; brand: string }) {
  const router = useRouter()
  const supportsBackfill = HISTORY_BRANDS.has(brand)

  const [job, setJob] = useState<Job | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const runningRef = useRef(false)

  // Load any existing job on mount.
  useEffect(() => {
    if (!supportsBackfill) return
    fetch(`/api/monitoring/systems/${systemId}/backfill`)
      .then((r) => r.json())
      .then((d) => { if (d.job) setJob(d.job) })
      .catch(() => {})
  }, [systemId, supportsBackfill])

  const post = useCallback(
    async (body: object) => {
      const res = await fetch(`/api/monitoring/systems/${systemId}/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.json().catch(() => ({}))
    },
    [systemId],
  )

  const startBackfill = useCallback(async () => {
    setError('')
    setRunning(true)
    runningRef.current = true
    let data = await post({ action: 'start' })
    while (runningRef.current && data.ok && data.job?.status === 'running') {
      setJob(data.job)
      data = await post({ action: 'continue', jobId: data.job.id })
    }
    if (data.job) setJob(data.job)
    if (!data.ok) setError(data.error ?? 'Backfill failed')
    setRunning(false)
    runningRef.current = false
    router.refresh()
  }, [post, router])

  const cancel = useCallback(async () => {
    runningRef.current = false
    await post({ action: 'cancel' })
    setRunning(false)
    const d = await fetch(`/api/monitoring/systems/${systemId}/backfill`).then((r) => r.json()).catch(() => ({}))
    if (d.job) setJob(d.job)
  }, [post, systemId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Import history</CardTitle>
        <CardDescription>
          Pull past readings so you can review them here instead of the brand portal.
          {brand === 'victron' && ' Victron cloud serves 15-minute resolution; Sunsynk serves 5-minute.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Automated backfill */}
        {supportsBackfill ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Automated backfill (to install date)</h3>
              <div className="flex gap-2">
                {!running ? (
                  <button onClick={startBackfill} className={btn}>
                    <Play className="h-4 w-4" /> {job?.status === 'done' ? 'Run again' : 'Start backfill'}
                  </button>
                ) : (
                  <button onClick={cancel} className={btn}>
                    <Square className="h-4 w-4" /> Stop
                  </button>
                )}
              </div>
            </div>

            {(running || job) && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center gap-2">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" />
                    : job?.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-success" /> : null}
                  <span className="font-medium capitalize">{running ? 'running' : job?.status}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div><span className="block font-mono text-foreground">{job?.days_done ?? 0}</span>days fetched</div>
                  <div><span className="block font-mono text-foreground">{(job?.rows_written ?? 0).toLocaleString()}</span>rows written</div>
                  <div><span className="block font-mono text-foreground">{job?.earliest_day ?? '—'}</span>earliest day</div>
                </div>
                {job?.status === 'running' && job.cursor_day && (
                  <p className="mt-2 text-xs text-muted-foreground">Currently at {job.cursor_day}…</p>
                )}
                {job?.error && <p className="mt-2 text-xs text-destructive">{job.error}</p>}
              </div>
            )}

            <PreviewDay systemId={systemId} />
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            Automated backfill isn’t available for {brand}. Use the CSV import below.
          </p>
        )}

        {/* CSV import */}
        <CsvImport systemId={systemId} onDone={() => router.refresh()} />

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

/** Dry-run one day to confirm the brand endpoint parses before a full backfill. */
function PreviewDay({ systemId }: { systemId: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  // Uncontrolled on purpose: a controlled <input type="date"> rejects partial
  // values mid-typing ("enter a valid date"). We read the value on click only.
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')

  async function preview() {
    const day = inputRef.current?.value
    if (!day) { setResult('Pick a date first'); return }
    setBusy(true)
    setResult('')
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/backfill?preview=${day}`)
      const d = await res.json()
      setResult(res.ok ? `${d.count} readings parsed for ${d.day}` : `Error: ${d.error}`)
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef} type="date" defaultValue={yesterday} max={today}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      />
      <button type="button" onClick={preview} disabled={busy} className={btn}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Preview one day
      </button>
      {result && <span className="text-xs text-muted-foreground">{result}</span>}
    </div>
  )
}

/** Upload a per-minute CSV exported from the brand portal. */
function CsvImport({ systemId, onDone }: { systemId: string; onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function run(dryRun: boolean) {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    const file = fd.get('file')
    if (!(file instanceof File) || file.size === 0) { setMsg('Choose a .csv file first'); return }
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/import${dryRun ? '?dryRun=1' : ''}`, {
        method: 'POST', body: fd,
      })
      const d = await res.json()
      if (!res.ok || d.ok === false) {
        setMsg(`${d.error}${d.headers ? ` — columns seen: ${d.headers.join(', ')}` : ''}`)
      } else if (dryRun) {
        setMsg(`Dry run: ${d.parsed} rows, ${d.skipped} skipped. Mapped → ${Object.entries(d.mapping).map(([k, v]) => `${k}=${v}`).join(', ')}`)
      } else {
        setMsg(`Imported ${d.written.toLocaleString()} readings (${d.skipped} skipped).`)
        form.reset()
        onDone()
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Per-minute CSV import</h3>
      <p className="text-xs text-muted-foreground">
        Export “Operational Data” (Sunsynk) or “Download data” (Victron) from the portal, Save As CSV, and upload it here.
      </p>
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); run(false) }} className="flex flex-wrap items-center gap-2">
        <input
          type="file" name="file" accept=".csv,text/csv"
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
        />
        <button type="button" onClick={() => run(true)} disabled={busy} className={btn}>
          <FlaskConical className="h-4 w-4" /> Dry run
        </button>
        <button type="submit" disabled={busy} className={btn}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import CSV
        </button>
      </form>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </section>
  )
}
