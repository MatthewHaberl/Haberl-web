'use client'

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ConfirmOptions = {
  title: string
  body?: string
  confirmText?: string
  cancelText?: string
  /** Red styling + red confirm button for delete/cancel actions. Default false (accent). */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** In-app replacement for window.confirm. Returns a promise that resolves true/false. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve })
  }, [])

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result)
    resolverRef.current = null
    setOptions(null)
  }, [])

  // Escape dismisses (= cancel), matching the native dialog.
  useEffect(() => {
    if (!options) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options, close])

  const destructive = options?.destructive ?? false

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => close(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6"
          >
            <div className="flex items-start gap-4">
              <div className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                destructive ? 'bg-destructive/10' : 'bg-accent/10',
              )}>
                <AlertTriangle className={cn('h-5 w-5', destructive ? 'text-destructive' : 'text-accent')} />
              </div>
              <div className="min-w-0">
                <h2 id="confirm-dialog-title" className="text-base font-semibold text-foreground">
                  {options.title}
                </h2>
                {options.body && (
                  <p className="mt-1 text-sm text-muted-foreground">{options.body}</p>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => close(false)}
                autoFocus={destructive}
              >
                {options.cancelText ?? 'Cancel'}
              </Button>
              <Button
                variant={destructive ? 'destructive' : 'accent'}
                size="sm"
                onClick={() => close(true)}
                autoFocus={!destructive}
              >
                {options.confirmText ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
