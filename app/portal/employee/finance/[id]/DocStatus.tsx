'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, HelpCircle, Ban } from 'lucide-react'

type Status = 'open' | 'unsure' | 'discarded'

const OPTS: { v: Status; l: string; icon: typeof CheckCircle2 }[] = [
  { v: 'open', l: 'Open', icon: CheckCircle2 },
  { v: 'unsure', l: 'Unsure', icon: HelpCircle },
  { v: 'discarded', l: 'Discarded', icon: Ban },
]

export function DocStatus({ documentId, status }: { documentId: string; status: Status }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function set(s: Status) {
    if (s === status || busy) return
    setBusy(true)
    try {
      await fetch(`/api/finance/documents/${documentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: s }),
      })
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border p-0.5">
      {OPTS.map((o) => {
        const Icon = o.icon
        const active = status === o.v
        return (
          <button key={o.v} type="button" disabled={busy} onClick={() => set(o.v)}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm transition-colors disabled:opacity-60 ${
              active
                ? o.v === 'discarded' ? 'bg-red-600 text-white'
                  : o.v === 'unsure' ? 'bg-amber-500 text-white'
                  : 'bg-green-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}>
            <Icon className="h-3.5 w-3.5" /> {o.l}
          </button>
        )
      })}
    </div>
  )
}
