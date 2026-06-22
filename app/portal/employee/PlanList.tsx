'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Check } from 'lucide-react'
import type { PlanItemPriority, PlanItemUserStatus } from '@/types/database'

export interface PlanListItem {
  id: string
  code: string
  track: string
  title: string
  priority: PlanItemPriority
  response: string | null
  user_status: PlanItemUserStatus | null
  responded_at: string | null
}

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'destructive' | 'outline'

const priorityVariant: Record<PlanItemPriority, BadgeVariant> = {
  urgent: 'destructive',
  highest: 'warning',
  high: 'accent',
  medium: 'default',
  low: 'outline',
}

const userStatusOptions: { value: PlanItemUserStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
  { value: 'parked', label: 'Park' },
]

const userStatusVariant: Record<PlanItemUserStatus, BadgeVariant> = {
  todo: 'outline',
  doing: 'warning',
  done: 'success',
  parked: 'default',
}

const userStatusLabel: Record<PlanItemUserStatus, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
  parked: 'Parked',
}

function repliedAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export function PlanList({ items, canRespond }: { items: PlanListItem[]; canRespond: boolean }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        No plan items synced yet. Run <code>npm run sync-plan</code> (or double-click sync-plan.bat) to
        pull your latest to-dos from the vault.
      </div>
    )
  }

  return (
    <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
      {items.map((item) => (
        <PlanRow
          key={item.id}
          item={item}
          open={openId === item.id}
          onToggle={() => setOpenId((id) => (id === item.id ? null : item.id))}
          canRespond={canRespond}
          onSaved={() => router.refresh()}
        />
      ))}
    </div>
  )
}

function PlanRow({
  item,
  open,
  onToggle,
  canRespond,
  onSaved,
}: {
  item: PlanListItem
  open: boolean
  onToggle: () => void
  canRespond: boolean
  onSaved: () => void
}) {
  const [response, setResponse] = useState(item.response ?? '')
  const [status, setStatus] = useState<PlanItemUserStatus | null>(item.user_status)
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const dirty = response !== (item.response ?? '') || status !== item.user_status

  async function save() {
    setBusy(true)
    setJustSaved(false)
    const supabase = createClient()
    const trimmed = response.trim()
    const { error } = await supabase
      .from('plan_items')
      .update({
        response: trimmed || null,
        user_status: status,
        responded_at: new Date().toISOString(),
        // A fresh reply is unhandled until Claude actions it next session.
        response_handled: false,
      })
      .eq('id', item.id)
    setBusy(false)
    if (!error) {
      setJustSaved(true)
      onSaved()
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-background',
        open ? 'border-border' : 'border-transparent hover:border-border',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Badge variant={priorityVariant[item.priority]}>{item.priority}</Badge>
        <Badge variant="outline" className="hidden sm:inline-flex">{item.track}</Badge>
        <span className={cn('min-w-0 flex-1 text-sm', open ? 'font-medium' : 'truncate')}>
          {item.title}
        </span>
        {item.user_status && (
          <Badge variant={userStatusVariant[item.user_status]}>{userStatusLabel[item.user_status]}</Badge>
        )}
        {item.response && (
          <span className="hidden items-center gap-1 text-xs text-accent sm:flex">
            <MessageSquare className="h-3.5 w-3.5" /> replied
          </span>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.code} · {item.track}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{item.title}</p>

          {canRespond ? (
            <div className="mt-3">
              <label htmlFor={`reply-${item.id}`} className="text-xs text-muted-foreground">
                Your reply to Claude
              </label>
              <textarea
                id={`reply-${item.id}`}
                value={response}
                onChange={(e) => {
                  setResponse(e.target.value)
                  setJustSaved(false)
                }}
                rows={3}
                placeholder="e.g. Yes, do this next — but keep it manual-approve for now."
                className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Mark as:</span>
                {userStatusOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={status === opt.value ? 'accent' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setStatus((s) => (s === opt.value ? null : opt.value))
                      setJustSaved(false)
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  {justSaved && !dirty && (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Check className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                  <Button type="button" variant="accent" size="sm" onClick={save} disabled={busy || !dirty}>
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Save reply
                  </Button>
                </div>
              </div>
              {item.responded_at && (
                <p className="mt-2 text-xs text-muted-foreground">Last reply {repliedAgo(item.responded_at)}</p>
              )}
            </div>
          ) : (
            item.response && (
              <div className="mt-3 rounded-md border border-border bg-muted/30 p-2">
                <p className="text-xs text-muted-foreground">Reply</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{item.response}</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
