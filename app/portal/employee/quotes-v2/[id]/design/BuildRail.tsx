'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useDesign } from './DesignProvider'

// Energy-first build order. Index is the source of truth for the active section.
export const BUILD_STEPS = [
  'Energy', 'Panels', 'DC combiner', 'Inverter', 'Batteries', 'AC combiner', 'Monitoring', 'Earthing', 'Data', 'Extras', 'Savings',
] as const

// Two-tier rail: the numbered core path every quote follows, plus the detail
// steps tucked behind a toggle. These are indices into BUILD_STEPS — the
// array order stays untouched (Walkthrough + ActiveSection are index-aligned).
const CORE_STEPS = [0, 1, 3, 4, 10]
const DETAIL_STEPS = [2, 5, 6, 7, 8, 9]

export function BuildRail() {
  const { activeStep, setActiveStep } = useDesign()
  const [showDetails, setShowDetails] = useState(false)
  // Never hide the active step — a deep-linked detail step forces the group open.
  const detailsOpen = showDetails || DETAIL_STEPS.includes(activeStep)

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card px-2 py-2">
      {CORE_STEPS.map((idx, n) => (
        <div key={BUILD_STEPS[idx]} className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setActiveStep(idx)}
            aria-current={idx === activeStep ? 'step' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              idx === activeStep ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                idx === activeStep ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'
              }`}
            >
              {n + 1}
            </span>
            {BUILD_STEPS[idx]}
          </button>
          {n < CORE_STEPS.length - 1 && <span className="text-muted-foreground/40 px-0.5">›</span>}
        </div>
      ))}

      <button
        type="button"
        // Toggle against the DISPLAYED state — while a detail step forces the
        // group open, the first click must not silently arm sticky-open.
        onClick={() => setShowDetails(!detailsOpen)}
        aria-expanded={detailsOpen}
        className="ml-1 flex shrink-0 items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
      >
        Details {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {detailsOpen && DETAIL_STEPS.map((idx) => (
        <button
          key={BUILD_STEPS[idx]}
          type="button"
          onClick={() => setActiveStep(idx)}
          aria-current={idx === activeStep ? 'step' : undefined}
          className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-colors ${
            idx === activeStep ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {BUILD_STEPS[idx]}
        </button>
      ))}
    </div>
  )
}
