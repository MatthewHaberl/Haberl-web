'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2, RotateCcw, Loader2 } from 'lucide-react'

export function ArchiveCustomerButton({
  customerId,
  customerName,
  archived,
}: {
  customerId: string
  customerName: string
  archived: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function archive() {
    if (!window.confirm(
      `Archive ${customerName || 'this customer'}?\n\n` +
      'They will be hidden from the customers list. All sites, quotes, jobs and ' +
      'financial history are kept, and you can restore them later.'
    )) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' })
      if (!res.ok) { setError(await res.text()); return }
      router.push('/portal/employee/customers')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function restore() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: 'PATCH' })
      if (!res.ok) { setError(await res.text()); return }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {archived ? (
        <Button variant="outline" size="sm" onClick={restore} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Restore
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={archive}
          disabled={busy}
          className="text-muted-foreground hover:text-destructive"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Archive customer
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
