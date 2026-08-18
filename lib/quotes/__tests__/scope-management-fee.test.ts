import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyScope,
  labourAmountR,
  labourCostR,
  managementFeeR,
  newCrewLine,
  parseScope,
  type ScopeLabour,
} from '../scope'
import { scopeToBom } from '../scope-bom'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * The management fee: a flat per-job charge for driving, supervising and the
 * admin behind a job Matthew runs but does not work.
 *
 * Two properties carry the whole feature. It must never reach a total while it
 * is switched off, and it must never appear to a customer as its own line.
 */

const CATALOG = new Map<string, EquipmentCatalogItem>()

function labour(over: Partial<ScopeLabour> = {}): ScopeLabour {
  return { ...emptyScope().labour, ...over }
}

// ── Switched off ─────────────────────────────────────────────────────────────

test('a fee sitting in the field bills nothing while the switch is off', () => {
  const l = labour({ mode: 'fixed', fixedR: 4000, managementR: 750, managementIncluded: false })
  assert.equal(managementFeeR(l), 0)
  assert.equal(labourAmountR(l), 4000)
})

test('a quote saved before the fee existed opens with it off and bills what it billed', () => {
  const legacy = parseScope(JSON.stringify({
    version: 1,
    summary: '',
    exclusions: [],
    sections: [],
    lines: [],
    labour: { mode: 'daily', days: 2, dayRateR: 5500 },
    coc: { included: false, feeR: 1500 },
  }))
  assert.ok(legacy)
  assert.equal(legacy.labour.managementIncluded, false)
  assert.equal(legacy.labour.managementR, 0)
  assert.equal(labourAmountR(legacy.labour), 11000)
})

// ── Switched on ──────────────────────────────────────────────────────────────

test('the fee is added once per job, not once per mode of pricing', () => {
  const on = { managementR: 750, managementIncluded: true }
  assert.equal(labourAmountR(labour({ mode: 'fixed', fixedR: 4000, ...on })), 4750)
  assert.equal(labourAmountR(labour({ mode: 'daily', days: 2, dayRateR: 5500, ...on })), 11750)
  // Hourly: the call-out carries the first hour, so 3 hours bills 2 at rate.
  assert.equal(labourAmountR(labour({ mode: 'hourly', hours: 3, rateR: 750, calloutR: 750, ...on })), 3000)
})

test('the fee is margin, not cost — it is his own time, not a wage paid out', () => {
  const crew = labour({
    mode: 'crew',
    crew: [newCrewLine({ name: 'Sipho', costR: 250, markup: 1.2, qty: 9, unit: 'hr' })],
    managementR: 750,
    managementIncluded: true,
  })
  assert.equal(labourCostR(crew), 2250)          // wages only
  assert.equal(labourAmountR(crew), 2700 + 750)  // wages x markup, plus the fee
})

test('the fee is margin in the lump-sum modes too, which otherwise quote cost = sell', () => {
  const l = labour({ mode: 'fixed', fixedR: 4000, managementR: 750, managementIncluded: true })
  assert.equal(labourCostR(l), 4000)
  assert.equal(labourAmountR(l), 4750)
})

test('a negative amount cannot credit the customer', () => {
  const l = labour({ mode: 'fixed', fixedR: 4000, managementR: -750, managementIncluded: true })
  assert.equal(managementFeeR(l), 0)
  assert.equal(labourAmountR(l), 4000)
})

// ── What the customer sees ───────────────────────────────────────────────────

test('the customer gets one labour line with the fee inside it, never a fee line', () => {
  const scope = emptyScope({ sections: ['Distribution board'] })
  scope.labour = labour({ mode: 'daily', days: 2, dayRateR: 5500, managementR: 750, managementIncluded: true })
  const bom = scopeToBom(scope, CATALOG, 1.15)
  const labourLines = bom.sections.flatMap((sec) => sec.lines).filter((l) => l.kind === 'labour')
  assert.equal(labourLines.length, 1)
  assert.equal(labourLines[0].lineSellR, 11750)
  const text = JSON.stringify(bom).toLowerCase()
  assert.ok(!text.includes('management'), `customer-facing text leaked the fee: ${text}`)
  assert.ok(!text.includes('supervis'), `customer-facing text leaked the fee: ${text}`)
})

test('hourly stops itemising its own arithmetic once a fee rides inside the line', () => {
  const scope = emptyScope({ sections: ['Distribution board'] })
  scope.labour = labour({ mode: 'hourly', hours: 3, rateR: 750, calloutR: 750, managementR: 750, managementIncluded: true })
  const line = scopeToBom(scope, CATALOG, 1.15).sections.flatMap((sec) => sec.lines).find((l) => l.kind === 'labour')
  // "call-out + 2 hr @ R750/hr" beside a R3 000 total would read as an error.
  assert.equal(line?.description, 'Labour')
  assert.equal(line?.lineSellR, 3000)
})

test('with the fee off, hourly still spells out what it is charging for', () => {
  const scope = emptyScope({ sections: ['Distribution board'] })
  scope.labour = labour({ mode: 'hourly', hours: 3, rateR: 750, calloutR: 750 })
  const line = scopeToBom(scope, CATALOG, 1.15).sections.flatMap((sec) => sec.lines).find((l) => l.kind === 'labour')
  assert.ok(line?.description.includes('call-out'))
})

test("a typed description still wins — it is Matthew's wording, fee or no fee", () => {
  const scope = emptyScope({ sections: ['Distribution board'] })
  scope.labour = labour({
    mode: 'hourly', hours: 3, rateR: 750, calloutR: 750,
    managementR: 750, managementIncluded: true,
    description: 'Labour & supervision',
  })
  const line = scopeToBom(scope, CATALOG, 1.15).sections.flatMap((sec) => sec.lines).find((l) => l.kind === 'labour')
  assert.equal(line?.description, 'Labour & supervision')
})

// ── New quotes ───────────────────────────────────────────────────────────────

test('a new quote opens on the figures Settings hands it', () => {
  const scope = emptyScope({ managementR: 900, managementIncluded: true })
  assert.equal(managementFeeR(scope.labour), 900)
})

test('no settings means no fee — never an invented charge', () => {
  assert.equal(managementFeeR(emptyScope().labour), 0)
})
