'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Loader2, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  isOpen,
  personLabel,
  sortClosed,
  sortItems,
  type AmperageComment,
  type AmperageItem,
  type AmperageKind,
  type AmperagePriority,
} from '@/lib/amperage/board'
import { ItemCard } from './ItemCard'

type Tab = 'task' | 'feature' | 'closed'

const TABS: { key: Tab; label: string }[] = [
  { key: 'task', label: 'To-do' },
  { key: 'feature', label: 'Features we want' },
  { key: 'closed', label: 'Done & parked' },
]

const EMPTY: Record<Tab, string> = {
  task: 'Nothing on the to-do list yet. Add the first thing that has to happen.',
  feature: 'No features listed yet. Add what you want the business — or this portal — to be able to do.',
  closed: 'Nothing finished or parked yet.',
}

export function Board({
  items,
  commentsByItem,
  names,
  meEmail,
}: {
  items: AmperageItem[]
  commentsByItem: Record<string, AmperageComment[]>
  names: Record<string, string>
  meEmail: string
}) {
  const [tab, setTab] = useState<Tab>('task')
  const [openId, setOpenId] = useState<string | null>(null)

  const counts: Record<Tab, number> = {
    task: items.filter((i) => i.kind === 'task' && isOpen(i)).length,
    feature: items.filter((i) => i.kind === 'feature' && isOpen(i)).length,
    closed: items.filter((i) => !isOpen(i)).length,
  }

  const visible =
    tab === 'closed'
      ? sortClosed(items.filter((i) => !isOpen(i)))
      : sortItems(items.filter((i) => i.kind === tab && isOpen(i)))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t.label}
              <span className={cn('ml-1.5 text-xs', tab === t.key ? 'opacity-80' : 'opacity-70')}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {tab !== 'closed' && <Composer kind={tab} names={names} meEmail={meEmail} />}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {EMPTY[tab]}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              comments={commentsByItem[item.id] ?? []}
              names={names}
              meEmail={meEmail}
              open={openId === item.id}
              onToggle={() => setOpenId((id) => (id === item.id ? null : item.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Add a to-do or a wanted feature. Collapsed to a single button until needed. */
function Composer({
  kind,
  names,
  meEmail,
}: {
  kind: AmperageKind
  names: Record<string, string>
  meEmail: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [priority, setPriority] = useState<AmperagePriority>('medium')
  const [area, setArea] = useState('')
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')
  const [forClaude, setForClaude] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setTitle('')
    setDetail('')
    setPriority('medium')
    setArea('')
    setOwner('')
    setDue('')
    setForClaude(false)
    setError('')
  }

  async function add() {
    const trimmed = title.trim()
    if (!trimmed) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    // .select() on purpose: without it RLS refusals come back as zero rows and
    // no error, and the insert would look like it worked.
    const { data, error: err } = await supabase
      .from('amperage_items')
      .insert({
        kind,
        title: trimmed,
        detail: detail.trim(),
        priority,
        area: area.trim(),
        owner_email: owner || null,
        due_date: due || null,
        for_claude: forClaude,
      })
      .select('id')
    setBusy(false)
    if (err || !data?.length) {
      setError(err?.message ?? 'Could not save that — try again.')
      return
    }
    reset()
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <Button type="button" variant="accent" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {kind === 'task' ? 'Add a to-do' : 'Add a feature'}
      </Button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          {kind === 'task' ? 'New to-do' : 'New feature we want'}
        </p>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <Label htmlFor="amp-title">{kind === 'task' ? 'What has to happen?' : 'What do you want it to do?'}</Label>
          <Input
            id="amp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === 'task'
                ? 'e.g. Register the company name at CIPC'
                : 'e.g. Job cards Zacques can fill in on his phone'
            }
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="amp-detail">Detail (optional)</Label>
          <Textarea
            id="amp-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="Anything the other person — or Claude — needs to know to action this."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="amp-priority">Priority</Label>
            <Select id="amp-priority" value={priority} onChange={(e) => setPriority(e.target.value as AmperagePriority)}>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="amp-area">Area (optional)</Label>
            <Input
              id="amp-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Registration, Branding, Portal…"
            />
          </div>
          <div>
            <Label htmlFor="amp-owner">Who is on it?</Label>
            <Select id="amp-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {Object.keys(names).map((email) => (
                <option key={email} value={email}>
                  {personLabel(email, names)}
                  {email === meEmail ? ' (me)' : ''}
                </option>
              ))}
            </Select>
          </div>
          {kind === 'task' && (
            <div>
              <Label htmlFor="amp-due">Due (optional)</Label>
              <Input id="amp-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          )}
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={forClaude}
            onChange={(e) => setForClaude(e.target.checked)}
            className="h-4 w-4"
          />
          <Bot className="h-4 w-4 text-accent" />
          Ask Claude to action this
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <Button type="button" variant="accent" size="sm" onClick={add} disabled={busy || !title.trim()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              reset()
              setOpen(false)
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
