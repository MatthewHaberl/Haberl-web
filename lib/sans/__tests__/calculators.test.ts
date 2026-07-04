import { test } from 'node:test'
import assert from 'node:assert/strict'
import { voltageDrop, cableCapacity, effectiveMvPerAm } from '../calculators'
import { VD_CABLE_TYPES } from '../tables/voltage-drop'
import { minProtectiveConductor } from '../tables/earthing'
import { ambientFactor, groupingFactor, GROUPING_SCENARIOS } from '../tables/correction-factors'

test('table data is internally consistent (z ≈ √(r²+x²), ampacity monotonic)', () => {
  for (const cable of VD_CABLE_TYPES) {
    for (const row of cable.rows) {
      for (const [arr, v] of Object.entries(row.values)) {
        if (v && typeof v === 'object') {
          const calc = Math.sqrt(v.r * v.r + v.x * v.x)
          // source rounds z; allow the observed table rounding envelope
          assert.ok(Math.abs(calc - v.z) < 0.06, `${cable.table} ${row.size}mm² ${arr}: z=${v.z} vs √(r²+x²)=${calc.toFixed(3)}`)
        }
      }
    }
  }
})

test('voltage drop — 2.5mm² twin&earth, 20A, 25m, 230V single-phase', () => {
  const r = voltageDrop({
    cableTypeId: 'multi-pvc', arrangementId: '1ph', sizeMm2: 2.5,
    current: 20, lengthM: 25, powerFactor: 1, nominalVoltage: 230,
  })
  assert.ok(!('error' in r))
  // 18 mV/A/m × 20 A × 25 m = 9 V = 3.91 % → pass
  assert.equal(r.dropVolts.toFixed(1), '9.0')
  assert.ok(r.dropPercent > 3.9 && r.dropPercent < 3.92)
  assert.equal(r.verdicts[0].status, 'pass')
})

test('voltage drop — same run at 40m fails the 5% limit and the 11.5V cap', () => {
  const r = voltageDrop({
    cableTypeId: 'multi-pvc', arrangementId: '1ph', sizeMm2: 2.5,
    current: 20, lengthM: 40, powerFactor: 1, nominalVoltage: 230,
  })
  assert.ok(!('error' in r))
  // 18 × 20 × 40 = 14.4 V = 6.26 %
  assert.equal(r.verdicts[0].status, 'fail')
  assert.ok(r.verdicts.some((v) => v.clauseRefs.includes('6.2.7.1.2')))
})

test('voltage drop — power factor uses r·cosφ + x·sinφ on large single-core', () => {
  // 95mm² single-core 3φ trefoil: r=0.41, x=0.155 → pf 0.8: 0.41×0.8 + 0.155×0.6 = 0.421
  const mv = effectiveMvPerAm({ r: 0.41, x: 0.155, z: 0.43 }, 0.8)
  assert.ok(mv !== null && Math.abs(mv - 0.421) < 0.001)
})

test('voltage drop — DC run honours custom limit (PV 3% budget)', () => {
  const r = voltageDrop({
    cableTypeId: 'single-pvc', arrangementId: 'dc', sizeMm2: 4,
    current: 12, lengthM: 30, powerFactor: 1, nominalVoltage: 380, limitPercent: 3,
  })
  assert.ok(!('error' in r))
  // 11 mV/A/m × 12 × 30 = 3.96 V of 380 V = 1.04 % → pass at 3 %
  assert.equal(r.verdicts[0].status, 'pass')
  assert.equal(r.limitPercent, 3)
})

test('capacity — 2.5mm² T&E clipped direct carries 27A base, derates in hot roof + grouped', () => {
  const r = cableCapacity({
    cableTypeId: 'multi-pvc', arrangementId: 'm3_2c', sizeMm2: 2.5,
    ambientC: 40, groupingScenarioId: 'enclosed_bunched', circuits: 4,
    designCurrent: 16, breakerRating: 20,
  })
  assert.ok(!('error' in r))
  assert.equal(r.baseCapacity, 27)
  // 27 × 0.87 × 0.65 = 15.27 A → 16 A design current FAILS, 20 A breaker FAILS
  assert.ok(Math.abs(r.deratedCapacity - 15.27) < 0.01)
  assert.equal(r.verdicts[0].status, 'fail')
  assert.equal(r.verdicts[1].status, 'fail')
})

test('capacity — table 6.27 small-conductor cap fires', () => {
  const r = cableCapacity({
    cableTypeId: 'multi-pvc', arrangementId: 'm46_2c', sizeMm2: 2.5,
    ambientC: 25, groupingScenarioId: null, circuits: 1,
    designCurrent: 20, breakerRating: 30,
  })
  assert.ok(!('error' in r))
  assert.ok(r.verdicts.some((v) => v.headline.includes('Table 6.27')))
})

test('earthing — table 6.25 bands', () => {
  assert.equal(minProtectiveConductor(10).exact, 10)
  assert.equal(minProtectiveConductor(25).exact, 16)
  assert.equal(minProtectiveConductor(70).exact, 35)
  assert.equal(minProtectiveConductor(500).exact, 200)
  assert.equal(minProtectiveConductor(1000).exact, 250)
  assert.equal(minProtectiveConductor(50).standard, 25)
})

test('correction factors — conservative rounding', () => {
  assert.equal(ambientFactor(32, 'pvc70'), 0.94)   // between 30 and 35 → hotter step
  assert.equal(ambientFactor(30, 'pvc70'), 1.0)
  assert.equal(ambientFactor(70, 'pvc70'), null)    // PVC not allowed at 70°C ambient
  const bunched = GROUPING_SCENARIOS.find((s) => s.id === 'enclosed_bunched')!
  assert.equal(groupingFactor(bunched, 11), 0.45)   // between 10 and 12 → next higher count
  assert.equal(groupingFactor(bunched, 1), 1)
  const tray = GROUPING_SCENARIOS.find((s) => s.id === 'tray_singlecore_vt')!
  assert.equal(groupingFactor(tray, 3), null)       // beyond the table
})
