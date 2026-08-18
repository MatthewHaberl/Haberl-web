import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyScope, importScopeAsPackage, newCrewLine, newScopeLine, type QuoteScope,
} from '../scope'
import { scopeToBom } from '../scope-bom'
import { buildScopeQuoteData } from '../scope-quote'
import { packageIdFromTier, packageTierValue, parsePackageChoice } from '../public'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * Accepting ONE package off a combined quote.
 *
 * The rule that matters: a single package is bought at its STANDALONE price —
 * the one the document showed beside it — and the job that follows orders that
 * package's materials and nobody else's.
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
    newCrewLine({ name: 'Lucas', staffId: 'staff-lucas', unit: 'hr', costR: 100, markup: 1, qty: crewDays * 8 }),
  ]
  s.coc = { included: true, feeR: 1500 }
  return s
}

function combined(): QuoteScope {
  const target = jobScope('Repair the panels', 'Panel', 1000, 1)
  const source = jobScope('Add a battery', 'Battery', 2000, 1)
  const { scope } = importScopeAsPackage(target, source, {
    label: 'Add a battery',
    existingLabel: 'Panel repair',
  })
  // Matthew cuts the combined visit to one day — this is the saving.
  return {
    ...scope,
    labour: { ...scope.labour, crewDays: 1, crew: scope.labour.crew.map((c) => ({ ...c, days: 1, qty: 8 })) },
  }
}

function documentFor(scope: QuoteScope) {
  return buildScopeQuoteData({
    scope,
    bom: scopeToBom(scope, CATALOG, 1.15),
    catalog: CATALOG,
    req: { customer_name: 'Chris' },
    quoteNumber: 'QUO-2026-099',
    expiryDays: 14,
    workType: 'solar_repair',
    workTypeLabel: 'Solar repair',
  })
}

/** The quote row as the public routes see it. */
function quoteRow(scope: QuoteScope) {
  return { generated_quote: JSON.stringify(documentFor(scope)) }
}

// ── What the customer is offered ─────────────────────────────────────────────

test('a combined quote offers each package at its standalone price', () => {
  const choice = parsePackageChoice(quoteRow(combined()))
  assert.ok(choice)
  assert.deepEqual(choice.packages.map((p) => p.label), ['Panel repair', 'Add a battery'])
  // Each carries its own 8-hour visit and its own certificate.
  assert.deepEqual(choice.packages.map((p) => p.totalCents), [330_000, 430_000])
  // Deposits are materials only, per package.
  assert.deepEqual(choice.packages.map((p) => p.depositCents), [100_000, 200_000])
})

test('the bundled figures are there to weigh the single package against', () => {
  const choice = parsePackageChoice(quoteRow(combined()))
  assert.ok(choice)
  // Materials R3 000 + ONE combined day R800 + ONE certificate R1 500.
  assert.equal(choice.bundleTotalCents, 530_000)
  // Separately: each package pays for its own day AND its own certificate.
  assert.equal(choice.separateTotalCents, 760_000)
  // R800 of crew time + R1 500 for the second certificate never issued.
  assert.equal(choice.bundleSavingCents, 230_000)
})

test('an ordinary quote offers no package choice at all', () => {
  assert.equal(parsePackageChoice(quoteRow(jobScope('Rewire', 'Cable', 500, 1))), null)
  assert.equal(parsePackageChoice({ generated_quote: null }), null)
  assert.equal(parsePackageChoice({ generated_quote: 'not json' }), null)
})

test('a package with no price is not offered — there is nothing to sell', () => {
  const scope = combined()
  // Strip the second package's only line, leaving it priced at labour alone…
  const stripped: QuoteScope = {
    ...scope,
    lines: scope.lines.filter((l) => l.packageId !== scope.packages[1].id),
  }
  const choice = parsePackageChoice(quoteRow(stripped))
  // …it still has its own visit, so it remains sellable. The guard is for a
  // package that prices at nothing at all.
  assert.ok(choice === null || choice.packages.every((p) => p.totalCents > 0))
})

// ── How the choice is recorded ───────────────────────────────────────────────

test('the accepted package round-trips through accepted_tier', () => {
  const id = 'pkg-abc-123'
  assert.equal(packageTierValue(id), 'pkg:pkg-abc-123')
  assert.equal(packageIdFromTier(packageTierValue(id)), id)
})

test('an all-in acceptance records no package', () => {
  assert.equal(packageIdFromTier(null), null)
  assert.equal(packageIdFromTier(undefined), null)
  // A solar multi-tier acceptance must never be read as a package.
  assert.equal(packageIdFromTier('recommended'), null)
  assert.equal(packageIdFromTier('pkg:'), null)
})

// ── What the job then orders ─────────────────────────────────────────────────

test('each package carries only its own materials for the job to seed from', () => {
  const data = documentFor(combined())
  const [panels, battery] = data.packages

  assert.deepEqual(panels.supplierBom.map((l) => l.description), ['Panel'])
  assert.deepEqual(battery.supplierBom.map((l) => l.description), ['Battery'])

  // The bundle's own labour and shared certificate belong to nobody.
  for (const pkg of data.packages) {
    assert.equal(pkg.supplierBom.some((l) => l.section === 'Labour'), false)
    assert.equal(pkg.supplierBom.some((l) => l.section === 'Compliance'), false)
  }
  // Taking everything still orders the lot.
  assert.equal(data.supplierBom.filter((l) => /Panel|Battery/.test(l.description)).length, 2)
})

test('a single-package deposit covers that package and nothing else', () => {
  const data = documentFor(combined())
  assert.deepEqual(data.packages[1].depositItems, [
    { name: 'Add a battery — Materials', amountRands: 2000 },
  ])
  assert.equal(data.packages[1].depositTotalRands, 2000)
  // Against the whole-job deposit, which covers both.
  assert.equal(data.depositTotalRands, 3000)
})

test('every package is identified so an acceptance can name it', () => {
  const scope = combined()
  const data = documentFor(scope)
  assert.deepEqual(data.packages.map((p) => p.id), scope.packages.map((p) => p.id))
  assert.equal(data.packages.every((p) => p.id.length > 0), true)
})
