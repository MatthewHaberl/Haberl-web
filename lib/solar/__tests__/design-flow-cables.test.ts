// Run with: npx tsx --test lib/solar/__tests__/design-flow-cables.test.ts
//
// The run length a cable is drawn with feeds cable sizing and the BOM, so a 40 m
// string drawn as 12 m under-specifies the cable. Every DC run used to carry a
// hardcoded literal no matter what was typed into the design; these lock in that
// each edge reads its own field, and that a hand edit stays visible.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  designToFlow, emptyDesign, defaultCombiner,
  type SystemDesign, type PanelGroup, type DcCombiner,
} from '../system-design'
import type { CableEdgeData } from '../sld-builder'

function panelGroup(over: Partial<PanelGroup> = {}): PanelGroup {
  return {
    id: 'pg1', label: 'Roof A', panelCount: 10, strings: 1, panelWatts: 500,
    panelModel: 'Test 500W', catalogId: 'panel', azimuth: 0, pitch: 15, roofType: 'Tile',
    ...over,
  } as PanelGroup
}

/** A design with `groups` arrays and one inverter — enough to emit the DC edges. */
function designWith(groups: PanelGroup[], over: Partial<SystemDesign> = {}): SystemDesign {
  return {
    ...emptyDesign(),
    panels: groups,
    inverters: [{ id: 'i1', catalogId: 'inv', model: '8kW', kw: 8, qty: 1, phases: 1 }],
    ...over,
  } as SystemDesign
}

const cable = (d: SystemDesign, id: string): CableEdgeData => {
  const edge = designToFlow(d).edges.find((e) => e.id === id)
  assert.ok(edge, `expected edge ${id}`)
  return edge.data as CableEdgeData
}

test('each array feeds its combiner over its own distance, not one shared literal', () => {
  const design = designWith([
    panelGroup({ id: 'pg1', distanceFromCombinerM: 40 }),
    panelGroup({ id: 'pg2', distanceFromCombinerM: 6 }),
  ])

  assert.equal(cable(design, 'e-panel0-comb').lengthM, 40)
  assert.equal(cable(design, 'e-panel1-comb').lengthM, 6)
  // …and the label the installer reads follows the metres, not just the data.
  assert.match(String(designToFlow(design).edges.find((e) => e.id === 'e-panel0-comb')?.label), /40\s*m/)
})

test('a blank array distance falls back to the old literal rather than 0 m', () => {
  const design = designWith([panelGroup({ id: 'pg1' }), panelGroup({ id: 'pg2' })])
  assert.equal(cable(design, 'e-panel0-comb').lengthM, 12)

  // No combiner (single group) → the string runs straight to the inverter.
  const direct = designWith([panelGroup({ id: 'pg1', distanceFromCombinerM: 40 })])
  assert.equal(cable(direct, 'e-panel0-inv').lengthM, 40)
  assert.equal(cable(designWith([panelGroup({ id: 'pg1' })]), 'e-panel0-inv').lengthM, 15)
})

test('the combiner reaches the inverter over its own distance, 8 m when blank', () => {
  const comb: DcCombiner = { ...defaultCombiner(['pg1#0']), distanceToInverterM: 25 }
  const design = designWith([panelGroup({ id: 'pg1' })], { dcCombiners: [comb] })
  assert.equal(cable(design, 'e-comb-inv').lengthM, 25)

  const blank = designWith([panelGroup({ id: 'pg1' })], { dcCombiners: [defaultCombiner(['pg1#0'])] })
  assert.equal(cable(blank, 'e-comb-inv').lengthM, 8)
})

test('a hand-edited cable keeps its override but says so, with the computed value', () => {
  const design = designWith([
    panelGroup({ id: 'pg1', distanceFromCombinerM: 40 }),
    panelGroup({ id: 'pg2', distanceFromCombinerM: 6 }),
  ])
  design.layout.edgeOverrides = { 'e-panel0-comb': { lengthM: 12 } }

  const data = cable(design, 'e-panel0-comb')
  // The manual edit still wins — that precedence is the point of an override.
  assert.equal(data.lengthM, 12)
  // But it is no longer invisible: the inspector can name it and offer the 40 m.
  assert.deepEqual(data.overriddenKeys, ['lengthM'])
  assert.equal(data.computed?.lengthM, 40)
  // Untouched cables carry no override bookkeeping at all.
  assert.equal(cable(design, 'e-panel1-comb').overriddenKeys, undefined)
})

test('an override that matches the computed value is not flagged as an edit', () => {
  const design = designWith([panelGroup({ id: 'pg1', distanceFromCombinerM: 40 }), panelGroup({ id: 'pg2' })])
  design.layout.edgeOverrides = { 'e-panel0-comb': { lengthM: 40, runs: 2 } }

  const data = cable(design, 'e-panel0-comb')
  assert.deepEqual(data.overriddenKeys, ['runs'])
})
