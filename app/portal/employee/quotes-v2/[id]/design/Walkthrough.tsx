'use client'

import { useState } from 'react'
import { Wand2, ArrowLeft, ArrowRight, X, Check } from 'lucide-react'
import { useDesign } from './DesignProvider'
import { BUILD_STEPS } from './BuildRail'

// Per-step guidance, index-aligned with BUILD_STEPS. Plain-language "what to do
// here" so the walkthrough reads like the Victron wizard.
const STEP_GUIDE: string[] = [
  'Start with how much power they use — a monthly kWh figure off their Eskom bill, or pick a usage pattern. Everything downstream sizes off this.',
  'Add the solar array: pick the panel and how many. Use Auto-split to break a big group into strings of the right length.',
  'Combine your strings. Add a DC combiner with its breakers + SPD when strings are paralleled onto an MPPT — skip it if each string runs straight to the inverter.',
  'Size the inverter. Use “Size from the main breaker” to auto-pick it (one big unit, or a few in parallel for redundancy), then check the string plan across the MPPTs.',
  'Size the storage. Pick the battery and adjust the module count — watch grid independence climb toward your target.',
  'Build the AC board / combiner. Start from a template (e.g. 2-inverter combiner) and tweak the breakers, changeover, SPD and indicator lights.',
  'Add monitoring — the dongle or gateway that reports this inverter.',
  'Set the earthing — spikes and bonding for the install.',
  'Add any comms cabling between devices (optional).',
  'Anything else — isolators, EV charger, generator, extra meters.',
  'Review the numbers: payback, 20-year savings and the customer’s bill impact. You’re done — close the walkthrough and send it off.',
]

// Steps a design can ship without — these get a Skip button in the bar.
const OPTIONAL_STEPS = [2, 5, 6, 8, 9]

export function Walkthrough() {
  const { design, activeStep, setActiveStep } = useDesign()
  const [open, setOpen] = useState(false)
  const last = BUILD_STEPS.length - 1
  const step = Math.min(Math.max(activeStep, 0), last)
  const hasContent = design.panels.length > 0 || design.inverters.length > 0

  // Empty design: start at Energy. Existing design: resume from the current step.
  function start() {
    if (!hasContent) setActiveStep(0)
    setOpen(true)
  }
  function next() { if (step < last) setActiveStep(step + 1); else setOpen(false) }
  function back() { setActiveStep(Math.max(0, step - 1)) }

  if (!open) {
    // Design already has substance — stay out of the way, keep the guide reachable.
    if (hasContent) {
      return (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Wand2 className="h-3.5 w-3.5" /> Guide
          </button>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">New system?</span> Let the walkthrough take you through it step by step.
        </p>
        <button
          type="button"
          onClick={start}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Wand2 className="h-3.5 w-3.5" /> Start guided walkthrough
        </button>
      </div>
    )
  }

  // Docked guidance bar — the real editor below (rendered by the page) is the
  // editing surface; this bar just narrates the step and drives setActiveStep.
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Step {step + 1} of {BUILD_STEPS.length}
          </p>
          <p className="text-sm font-bold text-foreground">{BUILD_STEPS[step]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{STEP_GUIDE[step]}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Exit walkthrough"
          className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-1 bg-primary transition-all" style={{ width: `${((step + 1) / BUILD_STEPS.length) * 100}%` }} />
      </div>

      {/* Back / Skip / Next|Finish */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="flex items-center gap-2">
          {OPTIONAL_STEPS.includes(step) && (
            <button
              type="button"
              onClick={next}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            {step < last ? <>Next <ArrowRight className="h-3.5 w-3.5" /></> : <>Finish <Check className="h-3.5 w-3.5" /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
