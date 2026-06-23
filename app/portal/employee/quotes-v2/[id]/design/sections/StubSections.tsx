'use client'

import { SectionCard, EmptyHint } from '../section-ui'

export function AcCombinerSection() {
  return (
    <SectionCard title="AC combiner / DB" subtitle="The distribution board is derived from phase + inverter size.">
      <EmptyHint>Auto-configured for now. Breaker and circuit editing arrives in a later phase.</EmptyHint>
    </SectionCard>
  )
}

export function ExtrasSection() {
  return (
    <SectionCard title="Extras" subtitle="Isolators, SPDs, meters, EV chargers and custom blocks.">
      <EmptyHint>Add extras directly on the diagram for now. A dedicated palette lands in a later phase.</EmptyHint>
    </SectionCard>
  )
}
