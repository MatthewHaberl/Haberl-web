'use client'

import { useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, Sun, Gauge, BatteryCharging, PackageCheck, LayoutPanelLeft, ClipboardList,
} from 'lucide-react'
import { computeBalance } from '@/lib/solar/system-design'
import { useDesign } from './DesignProvider'
import { BUILD_STEPS, CORE_STEPS, DETAIL_STEPS } from './BuildRail'

function fmt(value: number | null, digits = 1): string {
  if (value == null) return '—'
  return value.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function Stat({ Icon, value, unit }: { Icon: typeof Sun; value: string; unit: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap tabular-nums text-primary-foreground/85">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <span className="font-semibold">{value}</span>
      <span className="text-[11px] text-primary-foreground/55">{unit}</span>
    </span>
  )
}

/**
 * Studio layout — the top navy build ribbon. Reproduces BuildRail's core/detail
 * step split (restyled for the navy bar), condenses the BalanceHeader stats, and
 * carries the Review-BOM view switch + the on-demand Design-overview trigger.
 */
export function DesignRibbon({
  viewMode, setViewMode, onOpenOverview,
}: {
  viewMode: 'canvas' | 'bom'
  setViewMode: (m: 'canvas' | 'bom') => void
  onOpenOverview: () => void
}) {
  const { design, record, activeStep, setActiveStep, saveState } = useDesign()
  const [showDetails, setShowDetails] = useState(false)
  // A deep-linked detail step forces the group open (mirrors BuildRail).
  const detailsOpen = showDetails || DETAIL_STEPS.includes(activeStep)
  const balance = useMemo(() => computeBalance(design, record), [design, record])
  const coverage = balance.coveragePct
  // Energy is pure demand entry — nothing to overview yet, so the trigger stays
  // out of the way until the first component step (DesignStudio closes the panel
  // if the user steps back here with it open).
  const showOverview = activeStep !== 0

  const coverageCls = coverage == null ? '' : coverage >= 90
    ? 'border-success/40 bg-success/10 text-success'
    : coverage >= 50
      ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
      : 'border-destructive/40 bg-destructive/10 text-destructive'

  return (
    <div className="flex items-center gap-3 bg-primary px-3 py-2 text-primary-foreground">
      {/* Step nav — scrolls if the bar is tight, buttons stay pinned right */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {CORE_STEPS.map((idx, n) => (
          <div key={BUILD_STEPS[idx]} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setActiveStep(idx)}
              aria-current={idx === activeStep ? 'step' : undefined}
              title={BUILD_STEPS[idx]}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                idx === activeStep ? 'bg-accent text-accent-foreground' : 'text-primary-foreground/80 hover:bg-primary-foreground/10'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                  idx === activeStep ? 'bg-accent-foreground/20' : 'bg-primary-foreground/15 text-primary-foreground/70'
                }`}
              >
                {n + 1}
              </span>
              {BUILD_STEPS[idx]}
            </button>
            {n < CORE_STEPS.length - 1 && <span className="px-0.5 text-primary-foreground/30">›</span>}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setShowDetails(!detailsOpen)}
          aria-expanded={detailsOpen}
          title="Advanced sections — DC/AC combiner, monitoring, earthing, data, extras"
          className="ml-1 flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          Advanced {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {detailsOpen && DETAIL_STEPS.map((idx) => (
          <button
            key={BUILD_STEPS[idx]}
            type="button"
            onClick={() => setActiveStep(idx)}
            aria-current={idx === activeStep ? 'step' : undefined}
            className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] transition-colors ${
              idx === activeStep ? 'bg-accent text-accent-foreground' : 'text-primary-foreground/60 hover:bg-primary-foreground/10 hover:text-primary-foreground'
            }`}
          >
            {BUILD_STEPS[idx]}
          </button>
        ))}
      </div>

      {/* Condensed live stats — hidden on tight screens to protect the nav */}
      <div className="hidden shrink-0 items-center gap-3 border-l border-primary-foreground/15 pl-3 text-xs xl:flex">
        <Stat Icon={Sun} value={fmt(balance.totalKwp, 2)} unit="kWp" />
        <Stat Icon={Gauge} value={fmt(balance.generationKwh)} unit="kWh/d" />
        <Stat Icon={BatteryCharging} value={fmt(balance.storageHours)} unit="hrs" />
        {coverage != null && (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${coverageCls}`}>
            {coverage.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Save status */}
      <span className="hidden shrink-0 text-[11px] text-primary-foreground/55 lg:inline" aria-live="polite">
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'bom' ? 'canvas' : 'bom')}
          title={viewMode === 'bom' ? 'Back to the diagram' : 'Review the full bill of materials'}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            viewMode === 'bom'
              ? 'border-transparent bg-accent text-accent-foreground'
              : 'border-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/10'
          }`}
        >
          {viewMode === 'bom' ? <LayoutPanelLeft className="h-3.5 w-3.5" /> : <PackageCheck className="h-3.5 w-3.5" />}
          {viewMode === 'bom' ? 'Back to canvas' : 'Review BOM'}
        </button>
        {showOverview && (
          <button
            type="button"
            onClick={onOpenOverview}
            title="Design overview — specs, SANS compliance & BOM readiness"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-accent/50 bg-accent/15 px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ClipboardList className="h-3.5 w-3.5" /> Design overview
          </button>
        )}
      </div>
    </div>
  )
}
