'use client'

import { useDesign } from './DesignProvider'

// Energy-first build order. Index is the source of truth for the active section.
export const BUILD_STEPS = [
  'Energy', 'Panels', 'DC combiner', 'Inverter', 'Batteries', 'AC combiner', 'Monitoring', 'Earthing', 'Data', 'Extras', 'Savings',
] as const

export function BuildRail() {
  const { activeStep, setActiveStep } = useDesign()

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card px-2 py-2">
      {BUILD_STEPS.map((step, i) => (
        <div key={step} className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setActiveStep(i)}
            aria-current={i === activeStep ? 'step' : undefined}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              i === activeStep ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {step}
          </button>
          {i < BUILD_STEPS.length - 1 && <span className="text-muted-foreground/40 px-0.5">›</span>}
        </div>
      ))}
    </div>
  )
}
