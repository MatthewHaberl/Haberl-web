// Fixed-price labour worked out from a rate: R/W on a solar install, R/point on
// a rewire, R/m of trench.
//
// The two things that must hold: a quote saved before the bases existed prices
// to exactly the same rand it always did, and whatever the basis, everything
// downstream still sees ONE labour amount (the customer never sees the rate).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyScope, fixedLabourR, labourAmountR, labourCostR, parseScope, scopeTotals,
  type ScopeLabour,
} from '../scope'

const fixed = (over: Partial<ScopeLabour>): ScopeLabour => ({
  ...emptyScope().labour, mode: 'fixed', ...over,
})

test('the default basis is the lump sum that fixed mode has always been', () => {
  const l = fixed({ fixedR: 4000 })
  assert.equal(l.fixedBasis, 'amount')
  assert.equal(fixedLabourR(l), 4000)
  assert.equal(labourAmountR(l), 4000)
})

test('a quote saved before the bases existed prices to the same rand', () => {
  const legacy = parseScope({
    version: 1,
    labour: { mode: 'fixed', fixedR: 12500 },
    lines: [], sections: [],
  })
  assert.ok(legacy)
  assert.equal(legacy.labour.fixedBasis, 'amount')
  assert.equal(labourAmountR(legacy.labour), 12500)
})

test('per watt: rate x system size', () => {
  const l = fixed({ fixedBasis: 'watt', fixedRateR: 2.5, fixedQty: 8000, fixedR: 999 })
  assert.equal(fixedLabourR(l), 20000)
  // The stale lump in fixedR is not read on a derived basis.
  assert.equal(labourAmountR(l), 20000)
})

test('per kWp states the same price as per watt', () => {
  const perWatt = fixed({ fixedBasis: 'watt', fixedRateR: 2.5, fixedQty: 8000 })
  const perKwp = fixed({ fixedBasis: 'kwp', fixedRateR: 2500, fixedQty: 8 })
  assert.equal(fixedLabourR(perKwp), fixedLabourR(perWatt))
})

test('per panel, per point, per metre and per unit all price rate x quantity', () => {
  assert.equal(fixedLabourR(fixed({ fixedBasis: 'panel', fixedRateR: 450, fixedQty: 18 })), 8100)
  assert.equal(fixedLabourR(fixed({ fixedBasis: 'point', fixedRateR: 380, fixedQty: 24 })), 9120)
  assert.equal(fixedLabourR(fixed({ fixedBasis: 'metre', fixedRateR: 95, fixedQty: 40 })), 3800)
  assert.equal(
    fixedLabourR(fixed({ fixedBasis: 'unit', fixedRateR: 250, fixedQty: 12, fixedUnitLabel: 'way' })),
    3000,
  )
})

test('an incomplete basis is worth nothing, and a stray minus cannot credit the customer', () => {
  assert.equal(fixedLabourR(fixed({ fixedBasis: 'watt', fixedRateR: 2.5, fixedQty: 0 })), 0)
  assert.equal(fixedLabourR(fixed({ fixedBasis: 'watt', fixedRateR: -5, fixedQty: 8000 })), 0)
  assert.equal(fixedLabourR(fixed({ fixedBasis: 'amount', fixedR: -4000 })), 0)
})

test('the management fee rides on top of a derived basis, as it does on a lump', () => {
  const l = fixed({
    fixedBasis: 'point', fixedRateR: 380, fixedQty: 24,
    managementIncluded: true, managementR: 750,
  })
  assert.equal(labourAmountR(l), 9870)
  // A lump-sum mode knows no wage breakdown, so cost is the work itself — and
  // the fee is Matthew's own time, which is margin in every mode.
  assert.equal(labourCostR(l), 9120)
})

test('a derived basis reaches the quote total as one labour amount', () => {
  const scope = emptyScope()
  scope.labour = fixed({ fixedBasis: 'watt', fixedRateR: 2.5, fixedQty: 8000 })
  const totals = scopeTotals(scope)
  assert.equal(totals.labourR, 20000)
  assert.equal(totals.sellR, 20000)
})

test('the basis survives a save/reload round trip; an unknown one falls back to the lump', () => {
  const scope = emptyScope()
  scope.labour = fixed({ fixedBasis: 'metre', fixedRateR: 95, fixedQty: 40, fixedUnitLabel: 'run' })
  const back = parseScope(JSON.parse(JSON.stringify(scope)))
  assert.ok(back)
  assert.equal(back.labour.fixedBasis, 'metre')
  assert.equal(back.labour.fixedRateR, 95)
  assert.equal(back.labour.fixedQty, 40)
  assert.equal(back.labour.fixedUnitLabel, 'run')
  assert.equal(labourAmountR(back.labour), 3800)

  const junk = parseScope({ version: 1, labour: { mode: 'fixed', fixedBasis: 'per_moon', fixedR: 500 } })
  assert.ok(junk)
  assert.equal(junk.labour.fixedBasis, 'amount')
  assert.equal(labourAmountR(junk.labour), 500)
})
