'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PortalTicket, TicketStatus } from '@/types/database'

const STATUS_META: Record<
  TicketStatus,
  { label: string; variant: 'warning' | 'accent' | 'success' | 'outline' }
> = {
  open:        { label: 'Open',        variant: 'warning' },
  in_progress: { label: 'In progress', variant: 'accent' },
  resolved:    { label: 'Resolved',    variant: 'success' },
  closed:      { label: 'Closed',      variant: 'outline' },
}

const CATEGORY_LABEL: Record<string, string> = {
  issue: 'Issue',
  idea: 'Suggestion',
  question: 'Question',
}

const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
] as const

const isActive = (s: TicketStatus) => s === 'open' || s === 'in_progress'

export function TicketsList({ initial }: { initial: PortalTicket[] }) {
  const [tickets, setTickets] = useState(initial)
  const [filter, setFilter] = useState<string>('active')
  const [busy, setBusy] = useState<string | null>(null)

  async function setStatus(id: string, status: TicketStatus) {
    setBusy(id)
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)))
      }
    } finally {
      setBusy(null)
    }
  }

  const activeCount = tickets.filter((t) => isActive(t.status)).length

  const visible = tickets.filter((t) => {
    if (filter === 'all') return true
    if (filter === 'active') return isActive(t.status)
    return t.status === filter
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              filter === f.key
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border hover:bg-muted',
            )}
          >
            {f.label}
            {f.key === 'active' && activeCount > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">{activeCount}</span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No tickets here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((t) => (
            <li key={t.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_META[t.status].variant}>{STATUS_META[t.status].label}</Badge>
                <Badge variant="outline">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleString('en-ZA', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{t.message}</p>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {t.reporter_name ?? 'Unknown'}
                  {t.reporter_role ? ` · ${t.reporter_role.replace('_', ' ')}` : ''}
                </span>
                {t.page_url && <span className="font-mono">{t.page_url}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {isActive(t.status) && t.status !== 'in_progress' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === t.id}
                    onClick={() => setStatus(t.id, 'in_progress')}
                  >
                    Start
                  </Button>
                )}
                {isActive(t.status) && (
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={busy === t.id}
                    onClick={() => setStatus(t.id, 'resolved')}
                  >
                    Resolve
                  </Button>
                )}
                {t.status !== 'closed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === t.id}
                    onClick={() => setStatus(t.id, 'closed')}
                  >
                    Close
                  </Button>
                )}
                {!isActive(t.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === t.id}
                    onClick={() => setStatus(t.id, 'open')}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
