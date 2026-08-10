'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

const STORAGE_KEY = 'sans:clause-split-left'
const DEFAULT_PCT = 58
const MIN_PCT = 24
const MAX_PCT = 82

/**
 * Two-pane clause layout with a draggable divider: the structured clause view
 * on the left, the book page on the right. Drag (or arrow-key) the divider to
 * shrink the clause panel and give the book more room; the width is remembered.
 * With no `right` (non-admin, or a clause with no book page) it just renders the
 * left content full-width. Stacks vertically below the lg breakpoint.
 */
export function ClauseSplit({ left, right }: { left: ReactNode; right: ReactNode | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [leftPct, setLeftPct] = useState(DEFAULT_PCT)

  // Restore the remembered divider position after mount. localStorage does not
  // exist during SSR, so this cannot be read during render without breaking
  // hydration — the first paint intentionally uses DEFAULT_PCT.
  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const n = raw ? parseFloat(raw) : NaN
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of localStorage; must run post-hydration
    if (Number.isFinite(n) && n >= MIN_PCT && n <= MAX_PCT) setLeftPct(n)
  }, [])

  const persist = useCallback((p: number) => {
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(p)))
  }, [])

  const applyFromX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setLeftPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)))
  }, [])

  useEffect(() => {
    if (!right) return
    const move = (e: PointerEvent) => {
      if (dragging.current) applyFromX(e.clientX)
    }
    const up = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setLeftPct((p) => {
        persist(p)
        return p
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [right, applyFromX, persist])

  if (!right) return <>{left}</>

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  const onKey = (e: React.KeyboardEvent) => {
    let next: number | null = null
    if (e.key === 'ArrowLeft') next = Math.max(MIN_PCT, leftPct - 2)
    else if (e.key === 'ArrowRight') next = Math.min(MAX_PCT, leftPct + 2)
    else if (e.key === 'Home') next = MIN_PCT
    else if (e.key === 'End') next = MAX_PCT
    if (next == null) return
    e.preventDefault()
    setLeftPct(next)
    persist(next)
  }

  const reset = () => {
    setLeftPct(DEFAULT_PCT)
    persist(DEFAULT_PCT)
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-0"
      style={{ '--sans-left': `${leftPct}%` } as CSSProperties}
    >
      <div className="min-w-0 lg:w-[var(--sans-left)]">{left}</div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the clause panel and the book"
        aria-valuenow={Math.round(leftPct)}
        aria-valuemin={MIN_PCT}
        aria-valuemax={MAX_PCT}
        tabIndex={0}
        onPointerDown={startDrag}
        onDoubleClick={reset}
        onKeyDown={onKey}
        title="Drag to resize · double-click to reset"
        className="group relative hidden w-4 shrink-0 cursor-col-resize self-stretch lg:block"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:w-0.5 group-hover:bg-accent group-focus-visible:bg-accent" />
        <div className="sticky top-4 flex justify-center pt-1">
          <GripVertical className="h-5 w-5 rounded border border-border bg-background text-muted-foreground transition-colors group-hover:border-accent group-hover:text-accent" />
        </div>
      </div>

      <div className="min-w-0 w-full lg:sticky lg:top-4 lg:flex-1 lg:self-start">{right}</div>
    </div>
  )
}
