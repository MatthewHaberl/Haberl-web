import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react'

const BASE =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background ' +
  'placeholder:text-muted-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Small unit/label rendered inside the field on the left (e.g. "R"). */
  leadingText?: ReactNode
  /** Small unit/label rendered inside the field on the right (e.g. "%", "kWh"). */
  trailingText?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leadingText, trailingText, ...props }, ref) => {
    // Plain input — byte-identical to the original so existing callers are unaffected.
    if (leadingText == null && trailingText == null) {
      return <input type={type} ref={ref} className={cn(BASE, className)} {...props} />
    }
    // Adorned input — unit sits inside the border; the field gets matching padding.
    return (
      <div className="relative flex items-center">
        {leadingText != null && (
          <span className="pointer-events-none absolute left-3 text-sm text-muted-foreground">{leadingText}</span>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(BASE, leadingText != null && 'pl-7', trailingText != null && 'pr-12', className)}
          {...props}
        />
        {trailingText != null && (
          <span className="pointer-events-none absolute right-3 text-sm text-muted-foreground">{trailingText}</span>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
