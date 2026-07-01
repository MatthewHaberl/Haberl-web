'use client'

import { useState, useEffect } from 'react'
import { Wand2, ArrowLeft, ArrowRight, X, Check } from 'lucide-react'
import { useDesign } from './DesignProvider'
import { BUILD_STEPS } from './BuildRail'
import { ActiveSection } from './sections/ActiveSection'

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

export function Walkthrough() {
  const { activeStep, setActiveStep } = useDesign()
  const [open, setOpen] = useState(false)
  const last = BUILD_STEPS.length - 1
  const step = Math.min(Math.max(activeStep, 0), last)

  // Escape closes the walkthrough (the overlay carries role="dialog").
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function start() { setActiveStep(0); setOpen(true) }
  function next() { if (step < last) setActiveStep(step + 1); else setOpen(false) }
  function back() { setActiveStep(Math.max(0, step - 1)) }

  return (
    <>
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

      {open && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div role="dialog" aria-modal="true" aria-label="Guided design walkthrough" className="my-6 w-full max-w-3xl rounded-xl border border-border bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Step {step + 1} of {BUILD_STEPS.length}
                </p>
                <h2 className="truncate text-lg font-bold text-foreground">{BUILD_STEPS[step]}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Exit
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 w-full bg-muted">
              <div className="h-1 bg-primary transition-all" style={{ width: `${((step + 1) / BUILD_STEPS.length) * 100}%` }} />
            </div>

            {/* Body — guidance + the live section (reuses the real editor) */}
            <div className="max-h-[70vh] overflow-y-auto p-4">
              <p className="mb-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                {STEP_GUIDE[step]}
              </p>
              <ActiveSection />
            </div>

            {/* Footer — Back / dots / Next|Finish */}
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={back}
                disabled={step === 0}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="hidden items-center gap-1 sm:flex">
                {BUILD_STEPS.map((s, i) => (
                  <span key={s} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-muted-foreground/20'}`} />
                ))}
              </div>
              <button
                type="button"
                onClick={next}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {step < last ? <>Next <ArrowRight className="h-4 w-4" /></> : <>Finish <Check className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
