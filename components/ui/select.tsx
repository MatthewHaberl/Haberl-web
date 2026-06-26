import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { forwardRef, type SelectHTMLAttributes } from 'react'

/**
 * Styled native <select> matching <Input> (h-10, same border/focus ring).
 * Use for short, fixed option lists. For long catalog lists prefer a
 * searchable combobox instead.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-border bg-background pl-3 pr-9 py-2 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
)
Select.displayName = 'Select'
