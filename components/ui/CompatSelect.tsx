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
 */
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 text-left text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <span className={cn('truncate', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-md">
          {options.map((o) => {
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
        </div>
      )}
    </div>
  )
}
