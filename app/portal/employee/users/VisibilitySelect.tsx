'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { RecordScope } from '@/types/database'

/**
 * Per-user, per-section record visibility dial. '' = no override (falls back to
 * the role default, whose effective value is shown in the label). PUTs to
 * /api/users/[id]/visibility and refreshes; reverts on failure.
 */
export function VisibilitySelect({
  userId,
  section,
  current,
  defaultScope,
}: {
  userId: string
  section: string
  current: RecordScope | null
  defaultScope: RecordScope
}) {
  const router = useRouter()
  const [value, setValue] = useState<string>(current ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: string) {
    const prev = value
    setValue(next)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/users/${userId}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, scope: next === '' ? 'default' : next }),
      })
      if (!res.ok) {
        setValue(prev)
        setError(await res.text())
        return
      }
      router.refresh()
    } catch {
      setValue(prev)
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Select
          value={value}
          disabled={busy}
          onChange={(e) => change(e.target.value)}
          className="h-9 w-44"
          aria-label={`Record visibility for ${section}`}
        >
          <option value="">Default ({defaultScope === 'all' ? 'All' : 'Own only'})</option>
          <option value="own">Own only</option>
          <option value="all">All</option>
        </Select>
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
