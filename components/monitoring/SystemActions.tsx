'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Loader2, Pause, Play, Trash2 } from 'lucide-react'

/**
 * Enable/disable + delete controls for a single monitoring system, shown on the
 * detail page. Disable stops polling but keeps history; delete is permanent and
 * cascades all readings/alerts away.
 */
export function SystemActions({
  systemId,
  enabled,
  systemName,
}: {
  systemId: string
  enabled: boolean
  systemName: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<'toggle' | 'delete' | null>(null)
  const [error, setError] = useState('')

  async function toggleEnabled() {
    setError('')
    setBusy('toggle')
    try {
      const res = await fetch('/api/monitoring/systems', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: systemId, enabled: !enabled }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Failed (${res.status})`)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${systemName}?`,
      body: 'This permanently removes the system and all of its stored readings, alerts and history. This cannot be undone. To simply stop polling, disable it instead.',
      confirmText: 'Delete system',
      destructive: true,
    })
    if (!ok) return

    setError('')
    setBusy('delete')
    try {
      const res = await fetch(`/api/monitoring/systems?id=${encodeURIComponent(systemId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Delete failed (${res.status})`)
        setBusy(null)
        return
      }
      router.push('/portal/employee/monitoring')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={toggleEnabled} disabled={busy !== null}>
          {busy === 'toggle'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {enabled ? 'Disable polling' : 'Enable polling'}
        </Button>
        <Button variant="destructive" size="sm" onClick={remove} disabled={busy !== null}>
          {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
