'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Walkthrough } from './Walkthrough'
import { ActiveSection } from './sections/ActiveSection'

/**
 * Studio layout — the left form console. Wraps the guided Walkthrough plus the
 * active section's form (both unchanged).
 *
 * Desktop (lg+): a 380px column beside the stage; a slim edge tab collapses it so
 * the canvas / BOM can take the full width. Below lg the layout stacks, so the
 * console sits on top at full width with a capped height, and the collapse tab is
 * hidden (there's no width to reclaim).
 */
export function DesignConsole({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="flex shrink-0 border-b border-border lg:h-full lg:border-b-0">
      <div
        className={`w-full max-h-[42dvh] overflow-y-auto bg-card lg:max-h-none lg:w-[380px] ${open ? '' : 'lg:hidden'}`}
      >
        <div className="flex flex-col gap-3 p-3">
          <Walkthrough />
          <ActiveSection />
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        title={open ? 'Collapse panel — widen the canvas' : 'Show controls'}
        aria-label={open ? 'Collapse panel' : 'Expand panel'}
        aria-expanded={open}
        className="hidden w-6 shrink-0 items-center justify-center border-x border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
      >
        {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </div>
  )
}
