'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2 } from 'lucide-react'

/**
 * Polls every enabled system at once (fleet-page header), then refreshes so the
 * new readings render. Shows a short "polled N · M failed" summary inline.
 */
export function PollAllButton() {
  const router = useRouter()
  const [polling, setPolling] = useState(false)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')

  async function pollAll() {
    setError('')
    setSummary('')
    setPolling(true)
    try {
      const res = await fetch('/api/monitoring/poll-all', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `Poll failed (${res.status})`)
        return
      }
      const failed = data.failed ?? 0
      setSummary(failed > 0 ? `Polled ${data.ok} · ${failed} failed` : `Polled ${data.ok}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPolling(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={pollAll}
        disabled={polling}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
      >
        {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {polling ? 'Polling all…' : 'Poll all'}
      </button>
      {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
      {error && <span className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
    </div>
  )
}
