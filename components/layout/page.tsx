import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Portal page scaffold — gives every page one congruent frame.
 *
 * Width tiers (the portal layout supplies the outer padding; PageShell only
 * centers and caps the content):
 *   - form    ~768px  · single-column forms & simple settings
 *   - content ~1024px · reading + list/detail pages (the default)
 *   - wide    ~1280px · data-dense dashboards & multi-column tables
 *   - full    no cap  · maps and diagram tools that need the whole screen
 *
 * Vertical rhythm (gap-6) is baked in so pages don't each re-declare it.
 */
export type PageWidth = 'form' | 'content' | 'wide' | 'full'

const WIDTHS: Record<PageWidth, string> = {
  form: 'max-w-3xl',
  content: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
}

export function PageShell({
  width = 'content',
  className,
  children,
}: {
  width?: PageWidth
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('mx-auto flex w-full flex-col gap-6', WIDTHS[width], className)}>
      {children}
    </div>
  )
}

/**
 * Standard page header — one consistent title/description/actions block.
 * `icon` renders in the accent colour to the left of the title; `actions`
 * sits on the right and wraps below on narrow screens.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ className?: string }>
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
          {Icon && <Icon className="h-6 w-6 shrink-0 text-accent" />}
          <span className="min-w-0">{title}</span>
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
