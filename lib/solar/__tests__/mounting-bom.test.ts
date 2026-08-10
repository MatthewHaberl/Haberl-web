import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  mountingForRow, mountingForGroup, railPlanFor, railForRun, railSku,
  panelRunWidthMm, roofTypeFromLabel, panelDimensionsFrom, consolidateMounting,
  DEFAULT_PANEL_DIMENSIONS, LUMAX_SKUS, MAX_RAIL_MM, MOUNTING_ROOF_TYPES,
  type MountingRow,
} from '../mounting-bom'

const DIMS = DEFAULT_PANEL_DIMENSIONS

function row(patch: Partial<MountingRow> = {}): MountingRow {
  return { id: 'r1', panelCount: 4, roofType: 'ibr', orientation: 'portrait', ...patch }
}

/** Qty of a SKU in a row's line list (0 when absent). */
function qty(lines: Array<{ sku: string; qty: number }>, sku: string): number {
  return lines.filter((l) => l.sku === sku).reduce((s, l) => s + l.qty, 0)
}

// ── Roof classification ──────────────────────────────────────────────────────

test('the free-text roof types the design already uses map onto mounting families', () => {
  assert.equal(roofTypeFromLabel('IBR / corrugated steel'), 'corrugated')
  assert.equal(roofTypeFromLabel('Klip-lok / standing seam'), 'kliplok')
  assert.equal(roofTypeFromLabel('Tile'), 'tile')
  assert.equal(roofTypeFromLabel('Slate'), 'slate')
  assert.equal(roofTypeFromLabel('Concrete (flat)'), 'concrete_ballast')
  assert.equal(roofTypeFromLabel('Ground mount'), 'concrete_ballast')
  // Unknown / empty falls back to the most common SA roof rather than throwing.
  assert.equal(roofTypeFromLabel('Other'), 'ibr')
  assert.equal(roofTypeFromLabel(null), 'ibr')
})

test('every roof type declares a family, and non-penetrating roofs declare no fastener', () => {
  for (const meta of MOUNTING_ROOF_TYPES) {
    assert.ok(meta.family === 'short_rail' || meta.family === 'continuous_rail', meta.value)
  }
  assert.equal(MOUNTING_ROOF_TYPES.find((m) => m.value === 'kliplok')!.fastener, null)
  assert.equal(MOUNTING_ROOF_TYPES.find((m) => m.value === 'standing_seam')!.fastener, null)
})

// ── Short-rail roofs (IBR / corrugated) ──────────────────────────────────────

test('short-rail feet follow (N+1)x2 and clamps 4 end + 2(N-1) mid', () => {
  // Validated against Lumax's pre-packaged kits (catalogue p56–57): a 4-panel
  // IBR kit ships 10 feet, 4 end clamps and 6 mid clamps.
  const r = mountingForRow(row({ panelCount: 4 }), DIMS, 'row 1')
  assert.equal(qty(r.lines, LUMAX_SKUS.footShort), (4 + 1) * 2)
  assert.equal(qty(r.lines, LUMAX_SKUS.footShort), 10)
  assert.equal(qty(r.lines, LUMAX_SKUS.endClamp), 4)
  assert.equal(qty(r.lines, LUMAX_SKUS.midClamp), 2 * (4 - 1))
  assert.equal(qty(r.lines, LUMAX_SKUS.midClamp), 6)
})

test('a penetrating short-rail roof takes four tek screws per foot', () => {
  const r = mountingForRow(row({ panelCount: 6, roofType: 'ibr' }), DIMS, 'row 1')
  const feet = qty(r.lines, LUMAX_SKUS.footShort)
  assert.equal(qty(r.lines, LUMAX_SKUS.tekScrew), feet * 4)
})

test('Klip-Lok and standing seam use clamps instead of feet — and never a screw', () => {
  for (const [roofType, sku] of [
    ['kliplok', LUMAX_SKUS.klipLokClamp],
    ['standing_seam', LUMAX_SKUS.standingSeamClamp],
  ] as const) {
    const r = mountingForRow(row({ panelCount: 5, roofType }), DIMS, 'row 1')
    assert.equal(qty(r.lines, sku), (5 + 1) * 2, roofType)
    assert.equal(qty(r.lines, LUMAX_SKUS.footShort), 0, roofType)
    // The whole point of these roofs: no holes.
    assert.equal(qty(r.lines, LUMAX_SKUS.tekScrew), 0, roofType)
    assert.equal(qty(r.lines, LUMAX_SKUS.woodScrew), 0, roofType)
  }
})

test('a single-panel row still gets 4 end clamps and no mid clamps', () => {
  const r = mountingForRow(row({ panelCount: 1 }), DIMS, 'row 1')
  assert.equal(qty(r.lines, LUMAX_SKUS.endClamp), 4)
  assert.equal(qty(r.lines, LUMAX_SKUS.midClamp), 0)
})

test('an empty row produces no hardware at all', () => {
  const r = mountingForRow(row({ panelCount: 0 }), DIMS, 'row 1')
  assert.equal(r.lines.length, 0)
  assert.equal(r.runLengthMm, 0)
})

// ── Rail sizing ──────────────────────────────────────────────────────────────

test('run length is panel count x the side facing along the row', () => {
  assert.equal(panelRunWidthMm(DIMS, 'portrait'), 1134)
  assert.equal(panelRunWidthMm(DIMS, 'landscape'), 1762)
  const portrait = mountingForRow(row({ panelCount: 4, roofType: 'tile' }), DIMS, 'r')
  const landscape = mountingForRow(row({ panelCount: 4, roofType: 'tile', orientation: 'landscape' }), DIMS, 'r')
  assert.equal(portrait.runLengthMm, 4 * 1134)
  assert.equal(landscape.runLengthMm, 4 * 1762)
})

test('4 portrait panels (4536 mm) take the 5150 mm rail, two of them, no splice', () => {
  // Lumax's own 4-panel tile kit: 2 × LM-R42-5150.
  assert.equal(railForRun(4 * 1134), 5150)
  const r = mountingForRow(row({ panelCount: 4, roofType: 'tile' }), DIMS, 'r')
  assert.equal(qty(r.lines, railSku(5150)), 2)
  assert.equal(qty(r.lines, LUMAX_SKUS.railSplice), 0)
})

test('a run longer than one stock rail is spliced, two splices per joint (one per rail line)', () => {
  const plan = railPlanFor(9000)
  assert.ok(9000 > MAX_RAIL_MM)
  assert.equal(plan.splices, 1)
  assert.deepEqual(plan.lengths, [6200, 3150])

  const r = mountingForRow(row({ panelCount: 8, roofType: 'tile' }), DIMS, 'r')
  assert.equal(r.runLengthMm, 8 * 1134)
  assert.equal(qty(r.lines, LUMAX_SKUS.railSplice), 2)
})

test('rail plan always covers at least the run it is planning for', () => {
  for (const run of [500, 2150, 2151, 6200, 6201, 12000, 20000]) {
    const plan = railPlanFor(run)
    const total = plan.lengths.reduce((s, l) => s + l, 0)
    assert.ok(total >= run, `run ${run} covered by ${total}`)
    assert.equal(plan.splices, Math.max(0, plan.lengths.length - 1))
  }
})

// ── Continuous-rail roofs ────────────────────────────────────────────────────

test('tile rows take ~2 hooks per panel, minimum 4', () => {
  assert.equal(qty(mountingForRow(row({ panelCount: 6, roofType: 'tile' }), DIMS, 'r').lines, LUMAX_SKUS.roofHookTile), 12)
  assert.equal(qty(mountingForRow(row({ panelCount: 1, roofType: 'tile' }), DIMS, 'r').lines, LUMAX_SKUS.roofHookTile), 4)
})

test('slate uses the slate hook, timber uses brackets plus two coach screws each', () => {
  const slate = mountingForRow(row({ panelCount: 4, roofType: 'slate' }), DIMS, 'r')
  assert.equal(qty(slate.lines, LUMAX_SKUS.roofHookSlate), 8)
  assert.equal(qty(slate.lines, LUMAX_SKUS.roofHookTile), 0)

  const timber = mountingForRow(row({ panelCount: 4, roofType: 'timber' }), DIMS, 'r')
  assert.equal(qty(timber.lines, LUMAX_SKUS.woodScrew), qty(timber.lines, LUMAX_SKUS.roofHookTile) * 2)
})

test('flat concrete is ballasted and says so — the mass is not invented', () => {
  const r = mountingForRow(row({ panelCount: 4, roofType: 'concrete_ballast' }), DIMS, 'r')
  assert.ok(qty(r.lines, LUMAX_SKUS.ballastFoot) > 0)
  assert.equal(r.warnings.length, 1)
  assert.match(r.warnings[0], /ballast/i)
})

// ── Earthing + group behaviour ───────────────────────────────────────────────

test('every row is bonded and lands one earth lug', () => {
  const r = mountingForRow(row({ panelCount: 6 }), DIMS, 'r')
  assert.equal(qty(r.lines, LUMAX_SKUS.earthLug), 1)
  assert.ok(qty(r.lines, LUMAX_SKUS.earthClip) >= 2)
})

test('a group with no rows is treated as one row on its own roof type', () => {
  const bom = mountingForGroup({ label: 'East', panelCount: 4, strings: 1, roofType: 'Tile' })
  assert.equal(bom.rows.length, 1)
  assert.equal(bom.rows[0].roofType, 'tile')
  assert.ok(bom.consolidated.some((l) => l.sku === railSku(5150)))
})

test('a string split across two different roofs gets both sets of hardware', () => {
  // The case this feature exists for: 10 panels = 6 on IBR + 4 on tile.
  const bom = mountingForGroup({
    label: 'East', panelCount: 10, strings: 1, roofType: 'Tile',
    rows: [
      { id: 'a', panelCount: 6, roofType: 'ibr', orientation: 'portrait' },
      { id: 'b', panelCount: 4, roofType: 'tile', orientation: 'portrait' },
    ],
  })
  assert.equal(bom.rows.length, 2)
  const skus = new Set(bom.consolidated.map((l) => l.sku))
  assert.ok(skus.has(LUMAX_SKUS.tekScrew), 'IBR row contributes tek screws')
  assert.ok(skus.has(LUMAX_SKUS.roofHookTile), 'tile row contributes hooks')
  // Clamp counts add across both rows: (4+2*5) + (4+2*3) = 14 + 10.
  const mid = bom.consolidated.find((l) => l.sku === LUMAX_SKUS.midClamp)!
  assert.equal(mid.qty, 2 * (6 - 1) + 2 * (4 - 1))
})

test('identical parallel strings each need their own hardware', () => {
  const one = mountingForGroup({ label: 'E', panelCount: 4, strings: 1, roofType: 'IBR / corrugated steel' })
  const three = mountingForGroup({ label: 'E', panelCount: 4, strings: 3, roofType: 'IBR / corrugated steel' })
  const feetOne = one.consolidated.find((l) => l.sku === LUMAX_SKUS.footShort)!.qty
  const feetThree = three.consolidated.find((l) => l.sku === LUMAX_SKUS.footShort)!.qty
  assert.equal(feetThree, feetOne * 3)
})

test('consolidation sums the same SKU across rows into one order line', () => {
  const rows = [
    mountingForRow(row({ id: 'a', panelCount: 4 }), DIMS, 'row 1'),
    mountingForRow(row({ id: 'b', panelCount: 4 }), DIMS, 'row 2'),
  ]
  const merged = consolidateMounting(rows)
  const feet = merged.find((l) => l.sku === LUMAX_SKUS.footShort)!
  assert.equal(feet.qty, 20)
  assert.equal(merged.filter((l) => l.sku === LUMAX_SKUS.footShort).length, 1)
})

// ── Panel dimensions ─────────────────────────────────────────────────────────

test('panel dimensions come off the catalog row, falling back to a standard module', () => {
  assert.deepEqual(panelDimensionsFrom(null), DEFAULT_PANEL_DIMENSIONS)
  assert.deepEqual(panelDimensionsFrom({ width_mm: 1300, height_mm: 2278, frame_mm: 35 }), {
    widthMm: 1300, heightMm: 2278, frameMm: 35,
  })
  // A partially-specified panel keeps the defaults for what's missing.
  assert.equal(panelDimensionsFrom({ width_mm: 1300 }).heightMm, DEFAULT_PANEL_DIMENSIONS.heightMm)
})

test('a per-row dimension override beats the catalog panel', () => {
  const r = mountingForRow(row({ panelCount: 4, roofType: 'tile', panelWidthMm: 2000 }), DIMS, 'r')
  assert.equal(r.runLengthMm, 8000)
  assert.ok(qty(r.lines, LUMAX_SKUS.railSplice) > 0, 'an 8 m run must splice')
})
