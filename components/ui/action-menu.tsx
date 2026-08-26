'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ActionMenuItem {
  label: string
  /** One-line hint under the label — what this creates, in plain language. */
  description?: string
  /** Navigates when set; otherwise `onSelect` runs. */
  href?: string
  onSelect?: () => void
  /**
   * A RENDERED icon element (`icon={<FileText />}`), never a component
   * reference — a server page cannot hand a function across the RSC boundary.
   * Sizing is applied here so callers pass the bare icon.
   */
  icon?: React.ReactNode
}

interface Props {
  /** Button text, e.g. "New". */
  label: string
  items: ActionMenuItem[]
  icon?: React.ReactNode
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  align?: 'left' | 'right'
}

/**
 * A small dropdown of actions — used where a page has several "create this
 * here" routes that would otherwise crowd the header (customer → quote, job,
 * site, appointment). Closes on outside click, Escape, and after a pick.
 */
export function ActionMenu({ label, items, icon, variant = 'accent', size = 'sm', align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!items.length) return null

  return (
    <div className="relative" ref={wrapRef}>
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </Button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => {
            const body = (
              <>
                {item.icon && (
                  <span className="mt-0.5 shrink-0 inline-flex text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  {item.description && (
                    <span className="block text-xs text-muted-foreground">{item.description}</span>
                  )}
                </span>
              </>
            )
            const rowClass = 'flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors'

            return item.href ? (
              <Link key={item.label} role="menuitem" href={item.href} className={rowClass} onClick={() => setOpen(false)}>
                {body}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={rowClass}
                onClick={() => { setOpen(false); item.onSelect?.() }}
              >
                {body}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
