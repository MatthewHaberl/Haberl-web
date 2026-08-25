import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Portal page scaffold — gives every page one congruent frame.
 *
 * Width tiers (the portal layout supplies the outer padding; PageShell only
 * centers and caps the content). All tiers are *max* widths — content shrinks
 * to fit smaller screens, fills normal laptops/monitors, and is capped so it
 * doesn't sprawl on ultra-wide displays:
 *   - form    ~768px   · single-column forms & simple settings (kept narrow for readable inputs)
 *   - content ~1600px  · reading + list/detail pages (the default)
 *   - wide    ~2000px  · data-dense dashboards & multi-column tables
 *   - full    ~2560px  · maps / diagram / split-pane tools; fills big screens, caps ultra-wide
 *
 * Vertical rhythm (gap-6) is baked in so pages don't each re-declare it.
 */
export type PageWidth = 'form' | 'content' | 'wide' | 'full'

const WIDTHS: Record<PageWidth, string> = {
  form: 'max-w-3xl',
  content: 'max-w-[1600px]',
  wide: 'max-w-[2000px]',
  full: 'max-w-[2560px]',
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
 * sit on the right from `sm` up and take a full-width line of their own below
 * the title on a phone.
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
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary sm:text-2xl">
          {Icon && <Icon className="h-6 w-6 shrink-0 text-accent" />}
          <span className="min-w-0">{title}</span>
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {/* The actions used to be shrink-0, so a page with four buttons was as
          wide as those four buttons in a line no matter the screen — which is
          what pushed every list page in the portal off the right of a phone.
          They take their own full-width line below the title instead, and only
          sit beside it once there is room. */}
      {actions && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  )
}
