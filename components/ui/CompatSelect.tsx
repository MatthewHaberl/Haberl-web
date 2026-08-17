'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, AlertTriangle, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompatLevel } from '@/lib/solar/quote-calculator'

export interface CompatOption {
  id: string
  label: string
  level: CompatLevel
  reason?: string
}

/**
 * Dropdown that keeps incompatible options VISIBLE instead of hiding them:
 *   block → disabled, struck-through, darker, with a reason
 *   warn  → selectable, flagged with a ⚠ danger mark + reason
 *   ok    → normal
 * A native <select> can't render any of that, so this is a small custom popover.
 *
 * Like the design canvas's SearchableSelect, only the first `VISIBLE_LIMIT` matches
 * are put in the DOM — the battery category alone is ~430 rows, and a list that long
 * is both slow to build and unscrollable in practice. The filter box is how you reach
 * the rest, including the blocked ones the caller sorts to the bottom.
 */
const VISIBLE_LIMIT = 50

export function CompatSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  value: string
  onChange: (id: string) => void
  options: CompatOption[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const selected = options.find((o) => o.id === value)

  // Every typed word must appear in the label or the compat reason, so "pylon 5"
  // and "5 pylon" both land on the same battery.
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? options.filter((o) => {
        const haystack = `${o.label} ${o.reason ?? ''}`.toLowerCase()
        return needle.split(/\s+/).every((word) => haystack.includes(word))
      })
    : options
  const shown = matches.slice(0, VISIBLE_LIMIT)
  const hidden = matches.length - shown.length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => {
          const next = !v
          // Flip the list upward when there's little room below, so its lower options
          // stay reachable inside the scrollable design canvas.
          if (next) {
            setQuery('')
            const rect = ref.current?.getBoundingClientRect()
            if (rect) {
              const below = window.innerHeight - rect.bottom
              setDropUp(below < 300 && rect.top > below)
            }
          }
          return next
        })}
        title={selected?.label ?? undefined}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 text-left text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <span className={cn('truncate', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className={cn(
          'absolute z-50 w-full rounded-md border border-border bg-card shadow-md',
          dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
        )}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false) } }}
            placeholder="Search…"
            className="h-9 w-full rounded-t-md border-b border-border bg-background px-2.5 text-sm focus:outline-none"
          />
          <div className="max-h-72 overflow-auto py-1">
            {shown.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
            )}
            {shown.map((o) => {
              const blocked = o.level === 'block'
              const warn = o.level === 'warn'
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => { if (!blocked) { onChange(o.id); setOpen(false) } }}
                  title={o.reason || undefined}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
                    blocked ? 'cursor-not-allowed bg-muted/60' : 'hover:bg-muted',
                    o.id === value && !blocked && 'bg-accent/10',
                  )}
                >
                  {blocked && <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                  {warn && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block', blocked ? 'text-muted-foreground line-through' : 'text-foreground')}>
                      {o.label}
                    </span>
                    {o.reason && (
                      <span className={cn('block text-xs', blocked ? 'text-muted-foreground' : 'text-amber-600')}>
                        {o.reason}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
            {hidden > 0 && (
              <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
                {hidden.toLocaleString('en-ZA')} more — keep typing to narrow
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
