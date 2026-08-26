'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Trash2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  awaitsClaude,
  personLabel,
  relativeTime,
  PRIORITY_LABEL,
  PRIORITY_VARIANT,
  STATUS_FLOW,
  STATUS_LABEL,
  STATUS_VARIANT,
  type AmperageComment,
  type AmperageItem,
  type AmperagePriority,
  type AmperageStatus,
} from '@/lib/amperage/board'

/** One row on the board: summary line, then everything else behind a click. */
export function ItemCard({
  item,
  comments,
  names,
  meEmail,
  open,
  onToggle,
}: {
  item: AmperageItem
  comments: AmperageComment[]
  names: Record<string, string>
  meEmail: string
  open: boolean
  onToggle: () => void
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(item.detail)
  const [comment, setComment] = useState('')

  const statusLabel = STATUS_LABEL[item.kind]
  const waiting = awaitsClaude(item)
  const detailDirty = detail !== item.detail

  /**
   * Every control on the card writes straight through. `.select()` matters: an
   * RLS refusal comes back as zero rows and no error, so without it a blocked
   * write would look like a success.
   */
  async function patch(values: Partial<AmperageItem>) {
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('amperage_items')
      .update(values)
      .eq('id', item.id)
      .select('id')
    setBusy(false)
    if (err || !data?.length) {
      setError(err?.message ?? 'That did not save — try again.')
      return
    }
    router.refresh()
  }

  async function addComment() {
    const body = comment.trim()
    if (!body) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('amperage_comments')
      .insert({ item_id: item.id, body })
      .select('id')
    setBusy(false)
    if (err || !data?.length) {
      setError(err?.message ?? 'Comment did not save — try again.')
      return
    }
    setComment('')
    router.refresh()
  }

  async function remove() {
    if (
      !(await confirm({
        title: 'Delete this item?',
        body: 'It goes for good, along with its comments. Park it instead if you might come back to it.',
        confirmText: 'Delete',
        destructive: true,
      }))
    )
      return
    setBusy(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('amperage_items').delete().eq('id', item.id)
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    router.refresh()
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-background',
        waiting ? 'border-accent/60' : open ? 'border-border' : 'border-border hover:border-accent/50',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
      >
        <Badge variant={PRIORITY_VARIANT[item.priority]}>{PRIORITY_LABEL[item.priority]}</Badge>
        {item.area && (
          <Badge variant="outline" className="hidden sm:inline-flex">
            {item.area}
          </Badge>
        )}
        <span className={cn('min-w-0 flex-1 text-sm', open ? 'font-medium' : 'truncate')}>{item.title}</span>

        {waiting && (
          <Badge variant="accent" className="hidden shrink-0 items-center gap-1 sm:inline-flex">
            <Bot className="h-3 w-3" /> Claude
          </Badge>
        )}
        {item.owner_email && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {personLabel(item.owner_email, names)}
          </span>
        )}
        {comments.length > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            {comments.length}
          </span>
        )}
        <Badge variant={STATUS_VARIANT[item.status]} className="shrink-0">
          {statusLabel[item.status]}
        </Badge>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-3.5 py-3">
          <p className="text-xs text-muted-foreground">
            Added by {personLabel(item.created_by, names)} {relativeTime(item.created_at)}
            {item.due_date && (
              <span className="ml-2 inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                due {new Date(item.due_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </p>

          {item.actioned_at && (
            <div className="mt-2 rounded-md border border-success/40 bg-success/5 p-2 text-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <Check className="h-3.5 w-3.5" /> Claude actioned this {relativeTime(item.actioned_at)}
              </p>
              {item.actioned_note && <p className="mt-1 whitespace-pre-wrap">{item.actioned_note}</p>}
            </div>
          )}

          {/* Detail — editable in place, saved only when it changes. */}
          <div className="mt-3">
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder="Add the detail — what it involves, what it costs, what the other person needs to know."
            />
            {detailDirty && (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={busy}
                  onClick={() => patch({ detail: detail.trim() })}
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save detail
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDetail(item.detail)}>
                  Discard
                </Button>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Status</span>
            {STATUS_FLOW.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={item.status === s ? 'accent' : 'outline'}
                disabled={busy || item.status === s}
                onClick={() => patch({ status: s as AmperageStatus })}
              >
                {statusLabel[s]}
              </Button>
            ))}
          </div>

          {/* Priority · owner · kind */}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Priority
              <Select
                className="mt-1"
                value={item.priority}
                disabled={busy}
                onChange={(e) => patch({ priority: e.target.value as AmperagePriority })}
              >
                {(Object.keys(PRIORITY_LABEL) as AmperagePriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-muted-foreground">
              Who is on it
              <Select
                className="mt-1"
                value={item.owner_email ?? ''}
                disabled={busy}
                onChange={(e) => patch({ owner_email: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {Object.keys(names).map((email) => (
                  <option key={email} value={email}>
                    {personLabel(email, names)}
                    {email === meEmail ? ' (me)' : ''}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-muted-foreground">
              List
              <Select
                className="mt-1"
                value={item.kind}
                disabled={busy}
                onChange={(e) => patch({ kind: e.target.value as AmperageItem['kind'] })}
              >
                <option value="task">To-do</option>
                <option value="feature">Feature we want</option>
              </Select>
            </label>
          </div>

          {/* The Claude hand-off */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={item.for_claude ? 'accent' : 'outline'}
              disabled={busy}
              onClick={() => patch({ for_claude: !item.for_claude })}
            >
              <Bot className="h-3.5 w-3.5" />
              {item.for_claude ? 'Claude is on this' : 'Ask Claude to action this'}
            </Button>
            {item.actioned_at && item.for_claude && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => patch({ actioned_at: null, actioned_note: null })}
              >
                Send back to Claude
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={remove}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>

          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

          {/* The conversation */}
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Comments {comments.length > 0 && `(${comments.length})`}
            </p>

            {comments.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {comments.map((c) => {
                  const mine = c.author_email === meEmail
                  const isClaude = c.author_email === 'claude'
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'rounded-lg border p-2.5',
                        isClaude ? 'border-accent/40 bg-accent/5' : 'border-border bg-muted/20',
                      )}
                    >
                      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        {isClaude && <Bot className="h-3.5 w-3.5 text-accent" />}
                        {personLabel(c.author_email, names)}
                        {mine && <span className="font-normal text-muted-foreground">(you)</span>}
                        <span className="ml-1 font-normal text-muted-foreground">{relativeTime(c.created_at)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Add a comment — a question, a decision, a price, whatever moves it along."
              />
              {/* Left-aligned on purpose: the portal's floating chat / report-issue
                  widgets sit bottom-right and would cover a right-aligned button. */}
              <div className="mt-2 flex">
                <Button type="button" variant="accent" size="sm" disabled={busy || !comment.trim()} onClick={addComment}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Comment
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
