// Run with: npx tsx --test lib/solar/__tests__/amendment3.test.ts
//
// SANS 10142-1:2026 Ed 3.3 (Amendment 3) checks, enforced as binding ahead of
// the effective date. Every rule here is additive over Ed 3.2, so a design that
// satisfies them satisfies both editions.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeStringLayout,
  runComplianceChecks,
  type ComplianceContext,
} from '../compliance'
import type { EquipmentCatalogItem } from '../quote-calculator'
import type { SupplierBomItem } from '../render-quote'

const inverter: EquipmentCatalogItem = {
  id: 'inv', category: 'inverter', brand: 'Sunsynk', sku: 'SS-1P-16K-H-LV',
  description: 'Sunsynk 16kW 1P Hybrid', watts_ac: 16000, watts_dc: null, kwh: null,
  phase: 'single', cost_rands: 0, isc_amps: null, voc_volts: null, active: true, sort_order: 0,
  notes: JSON.stringify({ max_dc_voltage: 500, mppt_min_voltage: 150, mppt_count: 3, battery_class: 'LV' }),
}
const panel: EquipmentCatalogItem = {
  id: 'pan', category: 'panel', brand: 'Aiko', sku: 'AIKO-C-A500',
  description: 'Aiko Neostar 2S60 500W', watts_ac: null, watts_dc: 500, kwh: null,
  phase: 'any', cost_rands: 0, isc_amps: 13.5, voc_volts: 45.02, active: true, sort_order: 0, notes: null,
}
const battery: EquipmentCatalogItem = {
  id: 'bat', category: 'battery', brand: 'Sunsynk', sku: 'SS-BAT-5K',
  description: 'Sunsynk 5.32kWh LFP', watts_ac: null, watts_dc: null, kwh: 5.32,
  phase: 'any', cost_rands: 0, isc_amps: null, voc_volts: null, active: true, sort_order: 0,
  notes: JSON.stringify({ voltage: 51.2, battery_class: 'LV' }),
}

function bomItem(sku: string, description: string, quantity = 1): SupplierBomItem {
  return {
    section: 'Test', sku, description, quantity,
    unitCostRands: 0, unitSellRands: 0, lineCostRands: 0, lineSellRands: 0,
  }
}

function contextWith(extraBom: SupplierBomItem[] = [], panelCount = 14): ComplianceContext {
  return {
    bom: [bomItem('DC-MCB', 'PV DC Breaker', 2), bomItem('COC', 'Certificate of Compliance'), ...extraBom],
    layout: computeStringLayout({ panelCount, panel, spec: null }),
    spec: null,
    panel,
    inverter,
    battery,
    inverterCount: 1,
    batteryCount: 2,
    panelCount,
    evChargerKw: '',
    routeMetres: 20,
    gridSupply: 'single',
  }
}

const find = (checks: ReturnType<typeof runComplianceChecks>, id: string) => checks.find((c) => c.id === id)

test('Amdt 3: a backup system raises every generating-plant requirement', () => {
  const checks = runComplianceChecks(contextWith())

  // Island-mode N-E reference must sit inside the converter (§7.12.3.1.5).
  assert.equal(find(checks, 'amdt3-ne-bond')?.status, 'warning')
  // PSCC summed across grid + inverter + battery (§8.4.7).
  assert.equal(find(checks, 'amdt3-pscc')?.status, 'warning')
  // One source per multicore (§6.1.13 / §6.9.1.4).
  assert.equal(find(checks, 'amdt3-multicore')?.status, 'warning')
  // PV-specific duties (§8.6.8.2, §8.6.15, §8.6.16).
  assert.equal(find(checks, 'amdt3-pv-insulation')?.status, 'warning')
  assert.equal(find(checks, 'amdt3-structural')?.status, 'warning')
  assert.equal(find(checks, 'amdt3-fire')?.status, 'warning')
  // Annex S report rides with the CoC (§8.7 / Annex S).
  assert.equal(find(checks, 'amdt3-annex-s')?.status, 'warning')
})

test('Amdt 3: an external N-E bonding relay is a blocker, not a warning', () => {
  const checks = runComplianceChecks(contextWith([
    bomItem('NE-RLY', 'Neutral-Earth bonding relay 63A'),
  ]))
  const check = find(checks, 'amdt3-ne-bond')
  assert.equal(check?.status, 'blocker', check?.detail)
  assert.match(check!.detail, /internal to the inverter/)
})

test('Amdt 3: the Annex S check clears once the report is on the BOM', () => {
  const checks = runComplianceChecks(contextWith([
    bomItem('ANNEX-S', 'Annex S generating plant test report (PV/battery)'),
  ]))
  assert.equal(find(checks, 'amdt3-annex-s')?.status, 'pass')
})

test('Amdt 3: a changeover switch is not mistaken for an N-E bonding relay', () => {
  // The standard BOM carries an AC changeover switch; only a relay/contactor
  // actually doing the neutral-earth bond is non-compliant.
  const checks = runComplianceChecks(contextWith([
    bomItem('CHG-63', 'Changeover switch 63A 2P'),
  ]))
  assert.equal(find(checks, 'amdt3-ne-bond')?.status, 'warning')
})

test('Amdt 3: PV-only duties stay off a no-panel job, generating-plant ones remain', () => {
  const checks = runComplianceChecks(contextWith([], 0))
  assert.equal(find(checks, 'amdt3-structural'), undefined)
  assert.equal(find(checks, 'amdt3-fire'), undefined)
  assert.equal(find(checks, 'amdt3-pv-insulation'), undefined)
  // Battery alone is still a generating plant — these must survive.
  assert.equal(find(checks, 'amdt3-pscc')?.status, 'warning')
  assert.equal(find(checks, 'amdt3-annex-s')?.status, 'warning')
})
