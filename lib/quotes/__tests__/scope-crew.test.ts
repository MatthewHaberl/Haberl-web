import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crewCostR,
  crewLineSellR,
  crewSellR,
  crewUnitSellR,
  emptyScope,
  labourAmountR,
  labourCostR,
  newCrewLine,
  parseScope,
  scopeTotals,
} from '../scope'
import { scopeToBom } from '../scope-bom'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * Crew labour: staff priced onto a quote per person, at cost × markup, then
 * collapsed to ONE "Labour" line for the customer.
 *
 * The test that matters most here is the last one — no name, hour count or
 * rate may survive into the BOM the customer's quote renders from.
 */

const CATALOG = new Map<string, EquipmentCatalogItem>()

function crewScope(...crew: ReturnType<typeof newCrewLine>[]) {
  const s = emptyScope()
  s.labour.mode = 'crew'
  s.labour.crew = crew
  return s
}

// ── Per-line maths ───────────────────────────────────────────────────────────

test('crewUnitSellR applies the markup to the cost rate', () => {
  const line = newCrewLine({ costR: 150, markup: 1.6 })
  assert.equal(crewUnitSellR(line), 240)
})

test('a manual sell price overrides the markup', () => {
  const line = newCrewLine({ costR: 150, markup: 1.6, sellR: 300 })
  assert.equal(crewUnitSellR(line), 300)
})

test('crewLineSellR multiplies by the quantity of hours', () => {
  const line = newCrewLine({ costR: 150, markup: 1.6, qty: 8 })
  assert.equal(crewLineSellR(line), 1920)
})

test('a markup of 1 sells labour at cost rather than at zero', () => {
  const line = newCrewLine({ costR: 150, markup: 1, qty: 8 })
  assert.equal(crewLineSellR(line), 1200)
})

// ── Crew totals ──────────────────────────────────────────────────────────────

test('crewSellR and crewCostR keep the margin separable', () => {
  const scope = crewScope(
    newCrewLine({ name: 'Matthew', costR: 300, markup: 1.6, qty: 8 }), // 2400 cost → 3840
    newCrewLine({ name: 'Assistant', costR: 120, markup: 1.6, qty: 8 }), // 960 cost → 1536
  )
  assert.equal(crewCostR(scope.labour), 3360)
  assert.equal(crewSellR(scope.labour), 5376)
})

test('labourAmountR in crew mode is the crew sell total', () => {
  const scope = crewScope(newCrewLine({ costR: 150, markup: 2, qty: 10 }))
  assert.equal(labourAmountR(scope.labour), 3000)
})

test('labourCostR reports wages in crew mode but cost==sell in the lump modes', () => {
  const crew = crewScope(newCrewLine({ costR: 150, markup: 2, qty: 10 }))
  assert.equal(labourCostR(crew.labour), 1500)

  const fixed = emptyScope()
  fixed.labour.mode = 'fixed'
  fixed.labour.fixedR = 4000
  assert.equal(labourCostR(fixed.labour), 4000, 'a lump-sum quote knows no wage breakdown')
})

test('an empty crew list bills nothing', () => {
  const scope = crewScope()
  assert.equal(labourAmountR(scope.labour), 0)
})

test('scopeTotals counts crew labour in the quote total', () => {
  const scope = crewScope(newCrewLine({ costR: 150, markup: 1.6, qty: 8 }))
  const totals = scopeTotals(scope)
  assert.equal(totals.labourR, 1920)
  assert.equal(totals.sellR, 1920)
})

// ── Round-trip ───────────────────────────────────────────────────────────────

test('parseScope round-trips crew mode and its lines', () => {
  const scope = crewScope(newCrewLine({ name: 'Zacques', costR: 200, markup: 1.5, qty: 6 }))
  const back = parseScope(JSON.parse(JSON.stringify(scope)))
  assert.ok(back)
  assert.equal(back.labour.mode, 'crew')
  assert.equal(back.labour.crew.length, 1)
  assert.equal(back.labour.crew[0].name, 'Zacques')
  assert.equal(crewSellR(back.labour), 1800)
})

test('parseScope defaults a legacy scope to an empty crew, not undefined', () => {
  const back = parseScope({ version: 1, labour: { mode: 'hourly', hours: 3 } })
  assert.ok(back)
  assert.deepEqual(back.labour.crew, [])
  assert.equal(labourAmountR(back.labour), 750 + 2 * 750)
})

test('parseScope drops junk crew rows instead of billing NaN', () => {
  const back = parseScope({
    version: 1,
    labour: { mode: 'crew', crew: [null, 'nope', { name: 'Real', qty: 2, costR: 100, markup: 1.5 }] },
  })
  assert.ok(back)
  assert.equal(back.labour.crew.length, 1)
  assert.equal(crewSellR(back.labour), 300)
})

// ── The customer must never see the crew ─────────────────────────────────────

test('scopeToBom collapses the whole crew into ONE labour line', () => {
  const scope = crewScope(
    newCrewLine({ name: 'Matthew Haberl', costR: 300, markup: 1.6, qty: 8 }),
    newCrewLine({ name: 'Zacques Botha', costR: 200, markup: 1.6, qty: 8 }),
    newCrewLine({ name: 'Assistant', costR: 120, markup: 1.6, qty: 8 }),
  )
  const bom = scopeToBom(scope, CATALOG, 1.15)
  const labourLines = bom.sections.flatMap((s) => s.lines).filter((l) => l.kind === 'labour')

  assert.equal(labourLines.length, 1, 'three people, one line')
  assert.equal(labourLines[0].description, 'Labour')
  assert.equal(labourLines[0].qty, 1, 'no head-count leaks through the quantity')
  assert.equal(labourLines[0].lineSellR, 7936) // 620/hr crew × 1.6 × 8 hr
  assert.equal(labourLines[0].lineCostR, 4960, 'cost stays the real wage bill') // 620 × 8
})

test('no crew name, rate or hour count appears anywhere in the BOM', () => {
  const scope = crewScope(
    newCrewLine({ name: 'Matthew Haberl', costR: 337, markup: 1.6, qty: 7 }),
    newCrewLine({ name: 'Zacques Botha', costR: 213, markup: 1.6, qty: 7 }),
  )
  const serialised = JSON.stringify(scopeToBom(scope, CATALOG, 1.15))

  for (const leak of ['Matthew Haberl', 'Zacques Botha', '337', '213', '/hr']) {
    assert.ok(!serialised.includes(leak), `BOM leaked "${leak}" to the customer`)
  }
})

test('a typed labour description still wins over the bare "Labour" default', () => {
  const scope = crewScope(newCrewLine({ name: 'Matthew', costR: 300, markup: 1.6, qty: 8 }))
  scope.labour.description = 'Installation and commissioning'
  const bom = scopeToBom(scope, CATALOG, 1.15)
  const labour = bom.sections.flatMap((s) => s.lines).find((l) => l.kind === 'labour')
  assert.equal(labour?.description, 'Installation and commissioning')
})
