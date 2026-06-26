'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2 } from 'lucide-react'

/**
 * Fetches a fresh reading for one system on demand, then refreshes the page so
 * the new values render. Shows the brand error inline if the poll fails.
 */
export function PollNowButton({ systemId }: { systemId: string }) {
  const router = useRouter()
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState('')

  async function poll() {
    setError('')
    setPolling(true)
    try {
      const res = await fetch(`/api/monitoring/systems/${systemId}/poll`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `Poll failed (${res.status})`)
        return
      }
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
        onClick={poll}
        disabled={polling}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
      >
        {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {polling ? 'Polling…' : 'Poll now'}
      </button>
      {error && <span className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
    </div>
  )
}
