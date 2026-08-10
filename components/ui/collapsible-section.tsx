'use client'

import { useSyncExternalStore } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Open/closed choices live in localStorage, read via useSyncExternalStore so
// there's no setState-in-effect and no SSR/client mismatch (the server snapshot
// is always the section's default). Same-tab writes notify subscribers directly.
const listeners = new Set<() => void>()

function readOpen(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : raw === '1'
  } catch { return fallback }
}
function writeOpen(key: string, open: boolean) {
  try { window.localStorage.setItem(key, open ? '1' : '0') } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => { listeners.delete(cb); window.removeEventListener('storage', cb) }
}

type Props = {
  /** Stable key used to remember the open/closed choice across visits. */
  storageKey: string
  title: string
  count?: number
  icon?: LucideIcon
  /** Open state used on first visit, before any saved preference exists. */
  defaultOpen?: boolean
  /** Buttons shown on the heading row — they sit outside the toggle. */
  actions?: React.ReactNode
  /** Rendered under the heading whether the section is open or closed. */
  alwaysVisible?: React.ReactNode
  children: React.ReactNode
}

/** A section heading that folds its content away, remembering the choice per `storageKey`. */
export function CollapsibleSection({
  storageKey,
  title,
  count,
  icon: Icon,
  defaultOpen = true,
  actions,
  alwaysVisible,
  children,
}: Props) {
  const key = `section-open:${storageKey}`
  const open = useSyncExternalStore(
    subscribe,
    () => readOpen(key, defaultOpen),
    () => defaultOpen,
  )

  return (
    <section>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <button
          type="button"
          onClick={() => writeOpen(key, !open)}
          aria-expanded={open}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          {Icon && <Icon className="h-4 w-4 shrink-0" />}
          <span>
            {title}
            {count !== undefined && ` (${count})`}
          </span>
        </button>
        {actions}
      </div>
      {alwaysVisible}
      {open && children}
    </section>
  )
}
