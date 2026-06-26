import { cn } from '@/lib/utils'
import { type ReactNode } from 'react'
import { Label } from './label'

/**
 * Standard labelled form row: label (+ optional required mark), the control,
 * then either an inline error (red) or a hint (muted). Pass `htmlFor` and give
 * the control a matching `id` so clicking the label focuses the field.
 */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label?: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label != null && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      {children}
      {error != null ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint != null ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
