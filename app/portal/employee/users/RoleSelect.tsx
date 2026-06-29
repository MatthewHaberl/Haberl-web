'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { Role } from '@/types/database'
import { ROLE_META, ROLE_ORDER } from './shared'

/**
 * Inline role changer. PATCHes /api/users/[id]/role and refreshes the page on
 * success; on failure (e.g. last-admin 409) it reverts and shows the message.
 */
export function RoleSelect({
  userId,
  role,
  disabled,
  className,
}: {
  userId: string
  role: Role
  disabled?: boolean
  className?: string
}) {
  const router = useRouter()
  const [value, setValue] = useState<Role>(role)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: Role) {
    const prev = value
    setValue(next)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
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
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <Select
          value={value}
          disabled={disabled || busy}
          onChange={(e) => change(e.target.value as Role)}
          className="h-9 w-36"
          aria-label="Change role"
        >
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>{ROLE_META[r].label}</option>
          ))}
        </Select>
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
