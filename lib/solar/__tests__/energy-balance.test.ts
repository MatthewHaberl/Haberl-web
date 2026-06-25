// Run with: npx tsx --test lib/solar/__tests__/energy-balance.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  simulateEnergyBalance,
  buildLossModel,
  spreadAnnual,
  DEFAULT_LOSS_COMPONENTS,
  type EnergyBalanceInput,
} from '../energy-balance'

const flat12 = (v: number) => Array.from({ length: 12 }, () => v)
const flat24 = () => Array.from({ length: 24 }, () => 1)

// Concentrated shapes: all generation at noon, all load in the evening — the
// worst case for self-consumption without a battery.
const noonOnly = () => Array.from({ length: 24 }, (_, h) => (h === 12 ? 1 : 0))
const eveningOnly = () => Array.from({ length: 24 }, (_, h) => (h === 19 ? 1 : 0))

const base = (over: Partial<EnergyBalanceInput> = {}): EnergyBalanceInput => ({
  generationMonthlyKwh: flat12(900),
  consumptionMonthlyKwh: flat12(900),
  tariffRate: 3,
  ...over,
})

test('matched flat gen and load → no import, no export', () => {
  const r = simulateEnergyBalance(base({ loadShape: flat24(), pvDayShape: flat24() }))
  assert.equal(r.annual.importedKwh, 0)
  assert.equal(r.annual.exportedKwh, 0)
  assert.equal(r.annual.curtailedKwh, 0)
  // All consumption met by solar.
  assert.ok(Math.abs(r.annual.selfConsumedKwh - r.annual.consumptionKwh) < 1)
})

test('conservation: self-consumed + imported = consumption', () => {
  const r = simulateEnergyBalance(base({
    loadShape: eveningOnly(), pvDayShape: noonOnly(),
    battery: { capacityKwh: 10 },
  }))
  for (const m of r.months) {
    assert.ok(Math.abs(m.selfConsumedKwh + m.importedKwh - m.consumptionKwh) < 0.5,
      `${m.month}: ${m.selfConsumedKwh} + ${m.importedKwh} != ${m.consumptionKwh}`)
  }
  assert.ok(Math.abs(r.annual.selfConsumedKwh + r.annual.importedKwh - r.annual.consumptionKwh) < 1)
})

test('no battery, midday gen vs evening load → high import and high surplus', () => {
  const r = simulateEnergyBalance(base({ loadShape: eveningOnly(), pvDayShape: noonOnly(), battery: null }))
  // None of the noon solar can serve the evening load without storage.
  assert.ok(r.annual.importedKwh > r.annual.consumptionKwh * 0.95)
  assert.ok(r.annual.curtailedKwh > r.annual.generationKwh * 0.95)
})

test('a battery shifts midday surplus to the evening → imports fall', () => {
  const cfg = { loadShape: eveningOnly(), pvDayShape: noonOnly() }
  const noBattery = simulateEnergyBalance(base({ ...cfg, battery: null }))
  const withBattery = simulateEnergyBalance(base({ ...cfg, battery: { capacityKwh: 40 } }))
  assert.ok(withBattery.annual.importedKwh < noBattery.annual.importedKwh)
  assert.ok(withBattery.annual.selfConsumedKwh > noBattery.annual.selfConsumedKwh)
  assert.ok(withBattery.annual.curtailedKwh < noBattery.annual.curtailedKwh)
})

test('battery round-trip loss means delivered < stored', () => {
  // 30 kWh generated at noon, 30 kWh load in evening, 100 kWh battery (never the
  // binding constraint). The whole load is served through the battery, so the
  // 0.9 round-trip means ~10 % is lost and must still be imported — even though
  // capacity is ample. This proves the loss is modelled, not ignored.
  const r = simulateEnergyBalance(base({
    generationMonthlyKwh: flat12(900), consumptionMonthlyKwh: flat12(900),
    loadShape: eveningOnly(), pvDayShape: noonOnly(),
    battery: { capacityKwh: 100, roundTripEfficiency: 0.9 },
  }))
  assert.ok(r.annual.importedKwh > 0, 'round-trip loss should leave an import')
  // ≈ 10 % of consumption (the 1 − round-trip loss), not zero and not huge.
  assert.ok(r.annual.importedKwh > r.annual.consumptionKwh * 0.07, 'import reflects the round-trip loss')
  assert.ok(r.annual.importedKwh < r.annual.consumptionKwh * 0.13, 'but no more than the loss')
})

test('no export by default: surplus is curtailed, not exported', () => {
  const r = simulateEnergyBalance(base({
    generationMonthlyKwh: flat12(1200), consumptionMonthlyKwh: flat12(600),
    loadShape: eveningOnly(), pvDayShape: noonOnly(), battery: null,
  }))
  assert.equal(r.annual.exportedKwh, 0)
  assert.equal(r.annual.exportCreditR, 0)
  assert.ok(r.annual.curtailedKwh > 0)
})

test('allowExport + feed-in rate → export credit reduces the bill', () => {
  const r = simulateEnergyBalance(base({
    generationMonthlyKwh: flat12(1200), consumptionMonthlyKwh: flat12(600),
    loadShape: eveningOnly(), pvDayShape: noonOnly(), battery: null,
    allowExport: true, feedInRate: 1.5,
  }))
  assert.ok(r.annual.exportedKwh > 0)
  assert.equal(r.annual.curtailedKwh, 0)
  // Credit ≈ exported × feed-in (within monthly rounding).
  assert.ok(Math.abs(r.annual.exportCreditR - r.annual.exportedKwh * 1.5) < 20)
  // Bill after is import cost net of the credit, floored at zero.
  for (const m of r.months) {
    const expected = Math.max(0, Math.round(m.importedKwh * 3 - m.exportCreditR))
    assert.ok(Math.abs(m.billAfterR - expected) < 2, `${m.month} bill mismatch`)
  }
})

test('energy-from-solar can exceed 100 % when generation > consumption', () => {
  const r = simulateEnergyBalance(base({
    generationMonthlyKwh: flat12(1000), consumptionMonthlyKwh: flat12(800),
  }))
  // 12000 / 9600 = 125 %.
  assert.equal(r.annual.energyFromSolarPct, 125)
})

test('savings = bill before − bill after, and before = consumption × tariff', () => {
  const r = simulateEnergyBalance(base({ loadShape: eveningOnly(), pvDayShape: noonOnly(), battery: { capacityKwh: 20 } }))
  for (const m of r.months) {
    assert.equal(m.billBeforeR, Math.round(m.consumptionKwh * 3))
    assert.equal(m.savingR, m.billBeforeR - m.billAfterR)
  }
})

test('loss model multiplies (not adds) and matches a clean ~15 % derate', () => {
  const lm = buildLossModel()
  const manual = DEFAULT_LOSS_COMPONENTS.reduce((e, c) => e * (1 - c.pct), 1)
  assert.ok(Math.abs(lm.systemEfficiency - manual) < 1e-9)
  assert.ok(Math.abs(lm.totalLossPct - (1 - manual)) < 1e-9)
  assert.ok(lm.totalLossPct > 0.12 && lm.totalLossPct < 0.18)
})

test('spreadAnnual distributes the full total by the given shape', () => {
  const factors = [0.5, 1, 1.5, 1] // normalises to sum 1
  const out = spreadAnnual(4000, factors)
  assert.ok(Math.abs(out.reduce((a, b) => a + b, 0) - 4000) < 1e-6)
  // Largest factor gets the largest share.
  assert.equal(Math.max(...out), out[2])
})
