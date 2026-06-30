'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

/**
 * Per-user, per-section access override. '' = no override (follows the role
 * default, whose effective on/off is shown in the label). PUTs to
 * /api/users/[id]/access and refreshes; reverts on failure.
 */
export function AccessSelect({
  userId,
  section,
  current,
  defaultAllowed,
}: {
  userId: string
  section: string
  current: 'allow' | 'block' | null
  defaultAllowed: boolean
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
      const res = await fetch(`/api/users/${userId}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, state: next === '' ? 'default' : next }),
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
          className="h-9 w-40"
          aria-label={`Section access for ${section}`}
        >
          <option value="">Default ({defaultAllowed ? 'On' : 'Off'})</option>
          <option value="allow">On</option>
          <option value="block">Off</option>
        </Select>
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
