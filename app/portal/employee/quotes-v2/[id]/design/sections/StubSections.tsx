'use client'

import { designInverterKw } from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { SectionCard, NumberField, EmptyHint } from '../section-ui'

// Matthew's confirmed rule: ≤3kW → 2, 4–5kW → 4, 6kW+ → 6 (final count confirmed on site).
function suggestedSpikes(kw: number): number {
  if (kw <= 0) return 0
  if (kw <= 3) return 2
  if (kw <= 5) return 4
  return 6
}

export function DcCombinerSection() {
  const { design } = useDesign()
  return (
    <SectionCard title="DC combiner" subtitle="Auto-added on the diagram once there is more than one panel string.">
      <EmptyHint>
        {design.panels.length > 1
          ? `A ${design.panels.length}-string combiner is shown on the diagram. Full editor lands in Phase 2.`
          : 'Single string — no combiner needed yet. Add another panel group to introduce one.'}
      </EmptyHint>
    </SectionCard>
  )
}

export function AcCombinerSection() {
  return (
    <SectionCard title="AC combiner / DB" subtitle="The distribution board is derived from phase + inverter size.">
      <EmptyHint>Auto-configured for now. Breaker and circuit editing arrives in Phase 2.</EmptyHint>
    </SectionCard>
  )
}

export function EarthingSection() {
  const { design, dispatch } = useDesign()
  const kw = designInverterKw(design)
  const suggested = suggestedSpikes(kw)
  return (
    <SectionCard
      title="Earthing"
      subtitle="Spike count is suggested from inverter size — final count confirmed on site by soil-resistivity test."
    >
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <NumberField
          label="Earth spikes"
          value={design.earthing.spikeCount}
          placeholder={suggested ? String(suggested) : undefined}
          onChange={(v) => dispatch({ type: 'setEarthing', patch: { spikeCount: v } })}
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Conductor</span>
          <input
            type="text"
            value={design.earthing.spec}
            onChange={(ev) => dispatch({ type: 'setEarthing', patch: { spec: ev.target.value } })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
      </div>
      {design.earthing.spikeCount == null && suggested > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Suggested: {suggested} spikes for a {kw.toFixed(1)}kW system.</p>
      )}
    </SectionCard>
  )
}

export function ExtrasSection() {
  return (
    <SectionCard title="Extras" subtitle="Isolators, SPDs, meters, EV chargers and custom blocks.">
      <EmptyHint>Add extras directly on the diagram for now. A dedicated palette lands in Phase 2.</EmptyHint>
    </SectionCard>
  )
}
