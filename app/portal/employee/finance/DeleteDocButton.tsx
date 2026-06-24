'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

export function DeleteDocButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onDelete() {
    if (!window.confirm(`Delete ${name}? This removes the file and its record.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/finance/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert(await res.text())
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
      title="Delete document"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  )
}
