import { cn } from '@/lib/utils'
import { type LabelHTMLAttributes, type ReactNode } from 'react'

/**
 * The one canonical form label. Standalone forms/dialogs use this (text-sm,
 * readable). The dense quote-design-canvas sections keep their own compact
 * label style — this is for ordinary forms.
 */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
    />
  )
}

/**
 * The column heading of a dense row, repeated inside the cell so the row still
 * reads once it has folded onto a phone.
 *
 * Rows like the scope line items and the RFQ list carry their headings in a
 * header strip that only exists at full width. Below that the fields stack, and
 * without this you are left looking at four unlabelled boxes with no way to
 * tell a cost from a sell price. Hidden again from `sm` up, where the header
 * strip is back and the label would be a second copy of it.
 */
export function StackedFieldLabel({ children, className }: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'mb-0.5 block px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden',
        className,
      )}
    >
      {children}
    </span>
  )
}
