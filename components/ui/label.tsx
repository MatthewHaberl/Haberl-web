import { cn } from '@/lib/utils'
import { type LabelHTMLAttributes } from 'react'

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
