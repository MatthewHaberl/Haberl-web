/**
 * The Amperage Electrical board — shared vocabulary for the page and its client
 * components (migration 137).
 *
 * One table carries two lists. A `task` is something to do; a `feature` is
 * something wanted. They share one status column and the labels below rename it
 * per kind, so a feature reads "Wanted → Building → Shipped" while a task reads
 * "To do → Doing → Done" without a second set of states to keep in sync.
 */

export type AmperageKind = 'task' | 'feature'
export type AmperageStatus = 'todo' | 'doing' | 'blocked' | 'done' | 'parked'
export type AmperagePriority = 'urgent' | 'high' | 'medium' | 'low'

export interface AmperageItem {
  id: string
  kind: AmperageKind
  title: string
  detail: string
  status: AmperageStatus
  priority: AmperagePriority
  area: string
  owner_email: string | null
  due_date: string | null
  for_claude: boolean
  actioned_at: string | null
  actioned_note: string | null
  sort_order: number
  created_by: string
  done_at: string | null
  created_at: string
  updated_at: string
}

export interface AmperageComment {
  id: string
  item_id: string
  author_email: string
  body: string
  created_at: string
}

export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'destructive' | 'outline'

export const KIND_LABEL: Record<AmperageKind, string> = {
  task: 'To-do',
  feature: 'Feature',
}

export const STATUS_LABEL: Record<AmperageKind, Record<AmperageStatus, string>> = {
  task: { todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done', parked: 'Parked' },
  feature: { todo: 'Wanted', doing: 'Building', blocked: 'Blocked', done: 'Shipped', parked: 'Parked' },
}

export const STATUS_VARIANT: Record<AmperageStatus, BadgeVariant> = {
  todo: 'outline',
  doing: 'warning',
  blocked: 'destructive',
  done: 'success',
  parked: 'default',
}

/** The order the status buttons appear in, for both kinds. */
export const STATUS_FLOW: AmperageStatus[] = ['todo', 'doing', 'blocked', 'done', 'parked']

export const PRIORITY_LABEL: Record<AmperagePriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const PRIORITY_VARIANT: Record<AmperagePriority, BadgeVariant> = {
  urgent: 'destructive',
  high: 'warning',
  medium: 'accent',
  low: 'outline',
}

const PRIORITY_RANK: Record<AmperagePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

/** An item nobody is finished with — what the two open lists show. */
export function isOpen(item: AmperageItem): boolean {
  return item.status !== 'done' && item.status !== 'parked'
}

/** Ticked for Claude and not yet actioned. */
export function awaitsClaude(item: AmperageItem): boolean {
  return item.for_claude && !item.actioned_at
}

/**
 * Board order: anything waiting on Claude floats up, then manual `sort_order`,
 * then priority, then oldest first — so the list is stable while they work in it.
 */
export function sortItems(items: AmperageItem[]): AmperageItem[] {
  return [...items].sort(
    (a, b) =>
      Number(awaitsClaude(b)) - Number(awaitsClaude(a)) ||
      a.sort_order - b.sort_order ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.created_at.localeCompare(b.created_at),
  )
}

/** Done/parked list: most recently finished first. */
export function sortClosed(items: AmperageItem[]): AmperageItem[] {
  return [...items].sort((a, b) =>
    (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at),
  )
}

/** First name (or 'Claude') for an author email, using the participant roster. */
export function personLabel(email: string | null, names: Record<string, string>): string {
  if (!email) return 'Unassigned'
  if (email === 'claude') return 'Claude'
  const full = names[email.toLowerCase()]
  return full ? full.split(' ')[0] : email
}

export function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}
