'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Loader2, Lock } from 'lucide-react'
import { ROLE_META } from '../shared'
import type { Role } from '@/types/database'

type Matrix = Record<string, Record<string, boolean>>

export function PermissionsMatrix({
  sections,
  editableRoles,
  initial,
}: {
  sections: { key: string; label: string; description: string }[]
  editableRoles: Role[]
  initial: Matrix
}) {
  const router = useRouter()
  const [matrix, setMatrix] = useState<Matrix>(initial)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function toggle(role: Role, section: string) {
    setMatrix((m) => ({ ...m, [role]: { ...m[role], [section]: !m[role][section] } }))
    setDirty(true)
    setMessage(null)
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    const permissions = editableRoles.flatMap((role) =>
      sections.map((s) => ({ role, section: s.key, allowed: matrix[role][s.key] })),
    )
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      })
      if (!res.ok) {
        setMessage(await res.text())
        return
      }
      setDirty(false)
      setMessage('Saved')
      router.refresh()
    } catch {
      setMessage('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium">Section</th>
                {editableRoles.map((r) => (
                  <th key={r} className="px-4 py-3 text-center font-medium">{ROLE_META[r].label}</th>
                ))}
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" />Admin</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </td>
                  {editableRoles.map((r) => (
                    <td key={r} className="px-4 py-3 text-center">
                      <Toggle on={matrix[r][s.key]} onClick={() => toggle(r, s.key)} />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <Toggle on locked />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save changes
        </Button>
        {message && (
          <span className={`text-sm ${message === 'Saved' ? 'text-success' : 'text-destructive'}`}>
            {message}
          </span>
        )}
        {dirty && !busy && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  )
}

function Toggle({ on, locked, onClick }: { on: boolean; locked?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={on}
      className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        on ? 'bg-accent' : 'bg-muted'
      } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
