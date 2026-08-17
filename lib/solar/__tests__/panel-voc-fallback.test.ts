// Run with: npx tsx --test lib/solar/__tests__/panel-voc-fallback.test.ts
//
// Regression cover for the silent string-check failure found 2026-08-17: 95 of 128
// catalog panels had an empty voc_volts column, so panelThermal() returned voc=null,
// stringVoltageProfile() returned null, and the Panels step quietly dropped the
// edge-of-cloud check instead of complaining. The value was usually sitting on the
// same row in specs.voc_v.
import test from 'node:test'
import assert from 'node:assert/strict'
import { panelThermal, computeStringLayout, stringVoltageProfile } from '../compliance'
import type { EquipmentCatalogItem } from '../quote-calculator'

const panel = (over: Partial<EquipmentCatalogItem> = {}): EquipmentCatalogItem => ({
  id: 'pan', category: 'panel', brand: 'Aiko', sku: 'TEST-PANEL',
  description: 'Test panel', watts_ac: null, watts_dc: 500, kwh: null, phase: 'any',
  cost_rands: 0, isc_amps: 13.5, voc_volts: 45.02, active: true, sort_order: 0, notes: null,
  ...over,
})

// A 500V-max, 150V-MPPT-min inverter — the Sunsynk 16kW window used elsewhere.
const spec = { maxDcVoltage: 500, mpptMinVoltage: 150, mpptCount: 3, maxStrings: 6 } as never

test('panelThermal falls back to specs.voc_v when the column is empty', () => {
  const t = panelThermal(panel({ voc_volts: null, specs: { voc_v: 54.4 } }))
  assert.equal(t.voc, 54.4)
  assert.equal(t.vocSource, 'specs')
})

test('panelThermal prefers the hand-entered column over a conflicting specs.voc_v', () => {
  // Real case: Trina Vertex S 425W — column 50.2 (datasheet), specs 47.2 (supplier text).
  const t = panelThermal(panel({ voc_volts: 50.2, specs: { voc_v: 47.2 } }))
  assert.equal(t.voc, 50.2)
  assert.equal(t.vocSource, 'column')
})

test('panelThermal reports vocSource null when there is genuinely no Voc', () => {
  const t = panelThermal(panel({ voc_volts: null, specs: { watts: 500 } }))
  assert.equal(t.voc, null)
  assert.equal(t.vocSource, null)
})

test('marketed_voc_v is never promoted to a real Voc', () => {
  // The Photon portable panels carry a distributor-marketed figure precisely BECAUSE
  // the true Voc is unpublished; their notes say "Voc left blank to keep string sizing
  // honest". Promoting it would put an unverified number into the physics.
  const t = panelThermal(panel({ voc_volts: null, specs: { marketed_voc_v: 47.6, stc_datasheet: false } }))
  assert.equal(t.voc, null)
  assert.equal(t.vocSource, null)
})

test('implausible specs.voc_v is rejected rather than fed to the physics', () => {
  for (const bad of [0, 4, 1500, -45]) {
    const t = panelThermal(panel({ voc_volts: null, specs: { voc_v: bad } }))
    assert.equal(t.voc, null, `specs.voc_v=${bad} should not be trusted`)
  }
})

test('specs.voc_v arriving as a numeric string still resolves', () => {
  assert.equal(panelThermal(panel({ voc_volts: null, specs: { voc_v: '54.40' } })).voc, 54.4)
})

test('THE BUG: a specs-only panel now yields the same string layout as a column panel', () => {
  const fromColumn = computeStringLayout({ panelCount: 20, panel: panel({ voc_volts: 45.02 }), spec })
  const fromSpecs = computeStringLayout({ panelCount: 20, panel: panel({ voc_volts: null, specs: { voc_v: 45.02 } }), spec })
  // 500V ÷ (45.02 → ≈48.7V cold at −2°C → ≈53.5V with +10% edge-of-cloud) → 9/string
  assert.equal(fromColumn.maxSeriesAllowed, 9)
  assert.equal(fromSpecs.maxSeriesAllowed, 9, 'specs-sourced Voc must drive the same cap')
  assert.deepEqual(fromSpecs.stringVocDesignV, fromColumn.stringVocDesignV)
})

test('THE BUG: stringVoltageProfile no longer returns null for a specs-only panel', () => {
  const before = stringVoltageProfile({ seriesPanels: 8, panel: panel({ voc_volts: null, specs: {} }), spec })
  assert.equal(before, null, 'no Voc anywhere still returns null — the UI must say so')

  // AIKO 650W: description carries "54.40Voc", specs.voc_v 54.4, column was empty.
  const after = stringVoltageProfile({ seriesPanels: 8, panel: panel({ voc_volts: null, specs: { voc_v: 54.4 } }), spec })
  assert.ok(after, 'specs-sourced Voc must produce a profile instead of silently skipping')
  assert.equal(after!.panelVocStc, 54.4)
  // 8 × 54.4 → cold ≈470.6V → ≈517.7V with the edge margin → over the 500V ceiling.
  assert.equal(after!.overMaxDc, true, '8 × 650W Aiko must trip the 500V ceiling')
})

test('the MPPT lower limit is still checked off a specs-sourced Voc', () => {
  const one = stringVoltageProfile({ seriesPanels: 1, panel: panel({ voc_volts: null, specs: { voc_v: 45.02 } }), spec })
  assert.ok(one)
  assert.equal(one!.underMpptMin, true, 'a 1-panel string sits under the 150V MPPT floor')
})

// ── The compliance report is the other surface that used to go quiet ──────────
import { runComplianceChecks, type ComplianceContext } from '../compliance'

const ctx = (p: EquipmentCatalogItem, panelCount = 8): ComplianceContext => ({
  bom: [], layout: computeStringLayout({ panelCount, panel: p, spec }), spec,
  panel: p, inverter: panel({ category: 'inverter', description: 'Sunsynk 16kW' }),
  battery: panel({ category: 'battery', description: 'Test battery' }),
  inverterCount: 1, batteryCount: 1, panelCount, evChargerKw: '', routeMetres: 12, gridSupply: 'single',
})

test('compliance report WARNS when Voc is missing — it must not read as a quiet info note', () => {
  const check = runComplianceChecks(ctx(panel({ voc_volts: null, specs: {} })))
    .find((c) => c.id === 'string-voc')
  assert.ok(check)
  assert.equal(check!.status, 'warning', 'a check that did not run must not be filed as info')
  assert.match(check!.detail, /NOT CHECKED/)
  assert.match(check!.detail, /unverified/)
})

test('compliance report states the real Voc when it came from specs, not a blank', () => {
  // Force the over-voltage branch, which is the one that quotes the per-panel Voc.
  // It used to read panel.voc_volts directly, so a specs-sourced panel printed
  // "12 × V" with the number missing.
  const overLong = { ...spec as object, maxStrings: 1 } as never
  const p = panel({ voc_volts: null, specs: { voc_v: 45.02 } })
  const c: ComplianceContext = { ...ctx(p, 12), spec: overLong,
    layout: computeStringLayout({ panelCount: 12, panel: p, spec: overLong }) }
  const check = runComplianceChecks(c).find((x) => x.id === 'string-voc')
  assert.ok(check)
  assert.equal(check!.status, 'blocker')
  assert.match(check!.detail, /12 × 45\.02V/, 'must print the resolved Voc, not an empty slot')
  assert.doesNotMatch(check!.detail, /undefined|× V/)
})
