import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyScope, importScopeAsPackage, newCrewLine, newScopeLine, type QuoteScope,
} from '../scope'
import { scopeToBom } from '../scope-bom'
import { buildScopeQuoteData } from '../scope-quote'
import { renderScopeQuote } from '../render-scope-quote'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * The customer's side of a combined quote: each job priced on its own, a
 * combined price, and a saving that is only ever printed when it is real.
 */

const CATALOG = new Map<string, EquipmentCatalogItem>()

function jobScope(summary: string, description: string, sellR: number, crewDays: number): QuoteScope {
  const s = emptyScope({ sections: ['Materials'] })
  s.summary = summary
  s.lines = [{ ...newScopeLine('Materials', 'material'), description, qty: 1, unitSellR: sellR }]
  s.labour.mode = 'crew'
  s.labour.crewDays = crewDays
  s.labour.crewHoursPerDay = 8
  s.labour.crew = [
    newCrewLine({
      name: 'Lucas', staffId: 'staff-lucas', unit: 'hr', costR: 100, markup: 1, qty: crewDays * 8,
    }),
  ]
  return s
}

function documentFor(scope: QuoteScope) {
  const bom = scopeToBom(scope, CATALOG, 1.15)
  return buildScopeQuoteData({
    scope,
    bom,
    catalog: CATALOG,
    req: { customer_name: 'Chris', address: '28 Fontaine de Vaucluse' },
    quoteNumber: 'QUO-2026-099',
    expiryDays: 14,
    workType: 'solar_repair',
    workTypeLabel: 'Solar repair',
  })
}

/** Two jobs combined, then the combined visit cut to a single day. */
function combined() {
  const target = jobScope('Repair the panels', 'Panel', 1000, 1)
  const source = jobScope('Add a battery', 'Battery', 2000, 1)
  const { scope } = importScopeAsPackage(target, source, {
    label: 'Add a battery',
    existingLabel: 'Panel repair',
  })
  return {
    ...scope,
    labour: {
      ...scope.labour,
      crewDays: 1,
      crew: scope.labour.crew.map((c) => ({ ...c, days: 1, qty: 8 })),
    },
  }
}

test('each package reaches the document with its own price', () => {
  const data = documentFor(combined())

  assert.equal(data.packages.length, 2)
  assert.deepEqual(data.packages.map((p) => p.name), ['Panel repair', 'Add a battery'])
  assert.deepEqual(data.packages.map((p) => p.summary), ['Repair the panels', 'Add a battery'])
  // Each carries its own materials plus its own 8-hour visit.
  assert.deepEqual(data.packages.map((p) => p.ownTotalRands), [1800, 2800])
  // ...and its own sections, not the other's.
  assert.deepEqual(data.packages.map((p) => p.sections.map((s) => s.name)), [
    ['Panel repair — Materials'],
    ['Add a battery — Materials'],
  ])
})

test('the combined price and the saving are the arithmetic, not a made-up discount', () => {
  const data = documentFor(combined())

  assert.equal(data.separateTotalRands, 1800 + 2800)
  assert.equal(data.quoteTotalRands, 3000 + 800, 'materials, plus ONE combined day')
  assert.equal(data.bundleSavingRands, 4600 - 3800)
})

test('labour is billed once across the whole job, not once per package', () => {
  const data = documentFor(combined())
  assert.deepEqual(data.sharedSections.map((s) => s.name), ['Labour'])
  assert.equal(data.packages.every((p) => p.sections.every((s) => s.name !== 'Labour')), true)
})

test('the document prints the options table and what the saving buys', () => {
  const html = renderScopeQuote(documentFor(combined()))

  assert.match(html, /Your Options/)
  assert.match(html, /Panel repair/)
  assert.match(html, /Add a battery/)
  assert.match(html, /Each of them separately/)
  assert.match(html, /All of it together/)
  assert.match(html, /you save/i)
  // The per-package price appears with the reason it is higher.
  assert.match(html, /if this work is done on its own/i)
})

test('a combined quote with no saving does not pretend to offer one', () => {
  // Nothing edited down: the bundle is still the sum of the two visits.
  const target = jobScope('Repair the panels', 'Panel', 1000, 1)
  const source = jobScope('Add a battery', 'Battery', 2000, 1)
  const { scope } = importScopeAsPackage(target, source, {
    label: 'Add a battery',
    existingLabel: 'Panel repair',
  })
  const data = documentFor(scope)

  assert.equal(data.bundleSavingRands, 0)
  const html = renderScopeQuote(data)
  assert.doesNotMatch(html, /Your Options/, 'no options table where there is nothing to choose')
  assert.doesNotMatch(html, /you save/i)
  // The work is still all there, package by package.
  assert.match(html, /Panel repair/)
  assert.match(html, /Add a battery/)
})

test('an ordinary single-job quote renders exactly as it always has', () => {
  const data = documentFor(jobScope('Rewire the kitchen', 'Cable', 500, 1))

  assert.deepEqual(data.packages, [])
  assert.equal(data.bundleSavingRands, 0)
  assert.equal(data.separateTotalRands, 0)
  assert.deepEqual(data.sections.map((s) => s.name), ['Materials', 'Labour'])

  const html = renderScopeQuote(data)
  assert.match(html, /What&rsquo;s Included/)
  assert.doesNotMatch(html, /Your Options/)
  assert.doesNotMatch(html, /done on its own/i)
})

test('the deposit still covers materials only, package by package', () => {
  const data = documentFor(combined())
  assert.deepEqual(data.depositItems, [
    { name: 'Panel repair — Materials', amountRands: 1000 },
    { name: 'Add a battery — Materials', amountRands: 2000 },
  ])
  assert.equal(data.depositTotalRands, 3000)
  // Labour is on completion, so the balance is exactly the combined day.
  assert.equal(data.quoteTotalRands - data.depositTotalRands, 800)
})

test('job materials seed from the combined quote, labelled by package', () => {
  const data = documentFor(combined())
  const sections = new Set(data.supplierBom.map((l) => l.section))
  assert.ok(sections.has('Panel repair — Materials'))
  assert.ok(sections.has('Add a battery — Materials'))
})
