import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bundleSavingR,
  duplicatesAcrossPackages,
  emptyScope,
  ensurePackaged,
  importScopeAsPackage,
  labourAmountR,
  movePackage,
  newCrewLine,
  newScopeLine,
  packageLines,
  packageTotals,
  parseScope,
  removePackage,
  scopeTotals,
  separateLabourR,
  separateTotalR,
  type QuoteScope,
} from '../scope'
import { computeScopeDeposit, scopeToBom } from '../scope-bom'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

const CATALOG = new Map<string, EquipmentCatalogItem>()

/**
 * Work packages — several jobs on one quote, each priced alone, plus a bundled
 * price for taking the lot.
 *
 * The two properties everything else rests on:
 *   1. a quote with no packages behaves EXACTLY as it did before packages
 *      existed (every quote in the database is one of these), and
 *   2. importing never merges lines and never mutates the source quote.
 */

/** A one-job scope: some materials and a crew. */
function jobScope(opts: {
  summary?: string
  sections?: string[]
  lines?: { section: string; description: string; qty: number; sellR: number; costR?: number; catalogId?: string }[]
  crew?: { name: string; costR: number; days?: number }[]
  crewDays?: number
  coc?: boolean
}): QuoteScope {
  const s = emptyScope({ sections: opts.sections ?? ['Materials'] })
  s.summary = opts.summary ?? ''
  s.lines = (opts.lines ?? []).map((l) => ({
    ...newScopeLine(l.section, 'material'),
    description: l.description,
    qty: l.qty,
    unitSellR: l.sellR,
    unitCostR: l.costR ?? 0,
    catalogId: l.catalogId ?? null,
  }))
  if (opts.crew) {
    s.labour.mode = 'crew'
    s.labour.crewDays = opts.crewDays ?? 1
    s.labour.crewHoursPerDay = 8
    s.labour.crew = opts.crew.map((c) =>
      newCrewLine({
        name: c.name,
        staffId: `staff-${c.name.toLowerCase()}`,
        unit: 'hr',
        costR: c.costR,
        markup: 1,
        days: c.days ?? null,
        qty: (c.days ?? opts.crewDays ?? 1) * 8,
      }),
    )
  }
  if (opts.coc) s.coc = { included: true, feeR: 1500 }
  return s
}

// ── Backward compatibility ───────────────────────────────────────────────────

test('a scope saved before packages existed parses as a single-package quote', () => {
  const legacy = {
    version: 1,
    summary: 'Rewire the kitchen',
    exclusions: [],
    sections: ['Materials'],
    lines: [{ id: 'l1', section: 'Materials', kind: 'material', description: 'Cable', qty: 2, unitSellR: 100 }],
    labour: { mode: 'fixed', fixedR: 500 },
    coc: { included: true, feeR: 1500 },
  }
  const scope = parseScope(legacy)
  assert.ok(scope)
  assert.deepEqual(scope.packages, [])
  assert.equal(scope.lines[0].packageId, null)
  // The number the customer was shown must not move.
  assert.equal(scopeTotals(scope).sellR, 200 + 500 + 1500)
})

test('a line pointing at a package that is not there comes home rather than billing invisibly', () => {
  const scope = parseScope({
    version: 1,
    packages: [{ id: 'pkg-a', label: 'A' }],
    lines: [
      { id: 'l1', section: 'Materials', kind: 'material', description: 'X', qty: 1, unitSellR: 10, packageId: 'pkg-a' },
      { id: 'l2', section: 'Materials', kind: 'material', description: 'Y', qty: 1, unitSellR: 10, packageId: 'pkg-gone' },
    ],
  })
  assert.ok(scope)
  assert.equal(scope.lines[0].packageId, 'pkg-a')
  assert.equal(scope.lines[1].packageId, null, 'orphan re-homed to the visible unpackaged group')
})

test('a package with no id is dropped and takes no lines down with it', () => {
  const scope = parseScope({
    version: 1,
    packages: [{ label: 'nameless' }, { id: 'pkg-a', label: 'A' }],
    lines: [{ id: 'l1', section: 'M', kind: 'material', description: 'X', qty: 1, unitSellR: 10, packageId: 'pkg-a' }],
  })
  assert.ok(scope)
  assert.equal(scope.packages.length, 1)
  assert.equal(scope.lines[0].packageId, 'pkg-a')
})

// ── ensurePackaged ───────────────────────────────────────────────────────────

test('ensurePackaged folds the existing quote into a first package without moving the price', () => {
  const before = jobScope({
    summary: 'Replace the DB',
    lines: [{ section: 'Materials', description: 'DB board', qty: 1, sellR: 1500 }],
    crew: [{ name: 'Lucas', costR: 100 }],
    coc: true,
  })
  const totalBefore = scopeTotals(before).sellR

  const after = ensurePackaged(before, 'Replace the DB')
  assert.equal(after.packages.length, 1)
  assert.equal(after.packages[0].label, 'Replace the DB')
  assert.equal(packageLines(after, after.packages[0].id).length, 1)
  assert.equal(packageLines(after, null).length, 0, 'nothing left loose')
  assert.equal(scopeTotals(after).sellR, totalBefore, 'the bundle price is untouched')
  // The package priced alone is the same job, so it costs the same.
  assert.equal(packageTotals(after, after.packages[0]).sellR, totalBefore)
})

test('ensurePackaged is a no-op once packages exist', () => {
  const scope = ensurePackaged(
    jobScope({ lines: [{ section: 'Materials', description: 'X', qty: 1, sellR: 100 }] }),
    'First',
  )
  const again = ensurePackaged(scope, 'Second')
  assert.equal(again.packages.length, 1)
  assert.equal(again.packages[0].label, 'First')
})

test('ensurePackaged leaves an empty quote empty', () => {
  assert.deepEqual(ensurePackaged(emptyScope(), 'Nothing').packages, [])
})

// ── Importing ────────────────────────────────────────────────────────────────

test('importing a quote adds a package and never touches the source', () => {
  const target = jobScope({
    summary: 'Rewire the AC combiner',
    lines: [{ section: 'Distribution board', description: 'DB board', qty: 1, sellR: 1500 }],
    crew: [{ name: 'Lucas', costR: 100 }],
  })
  const source = jobScope({
    summary: 'Add a second battery',
    lines: [{ section: 'Distribution board', description: 'DB board', qty: 1, sellR: 1500 }],
    crew: [{ name: 'Paris', costR: 120 }],
  })
  const sourceLineIds = source.lines.map((l) => l.id)

  const { scope, packageId } = importScopeAsPackage(target, source, {
    label: 'Add a second battery',
    sourceQuoteId: 'quote-123',
    existingLabel: 'Rewire the AC combiner',
  })

  assert.equal(scope.packages.length, 2)
  assert.equal(scope.packages[1].id, packageId)
  assert.equal(scope.packages[1].label, 'Add a second battery')
  assert.equal(scope.packages[1].sourceQuoteId, 'quote-123')
  assert.equal(scope.packages[1].summary, 'Add a second battery')

  // Source untouched, copies are genuinely copies.
  assert.deepEqual(source.lines.map((l) => l.id), sourceLineIds)
  assert.equal(source.packages.length, 0)
  const copied = packageLines(scope, packageId)
  assert.equal(copied.length, 1)
  assert.ok(!sourceLineIds.includes(copied[0].id), 'imported line carries a fresh id')
})

test('the same part under two packages stays two lines — it is two boards, not one', () => {
  const target = jobScope({
    lines: [{ section: 'Distribution board', description: '12-way DB', qty: 1, sellR: 600, catalogId: 'cat-db' }],
  })
  const source = jobScope({
    lines: [{ section: 'Distribution board', description: '12-way DB', qty: 1, sellR: 600, catalogId: 'cat-db' }],
  })
  const { scope } = importScopeAsPackage(target, source, { label: 'Battery' })

  assert.equal(scope.lines.length, 2, 'no merging, ever')
  assert.equal(scopeTotals(scope).sellR >= 1200, true, 'both boards are billed')

  // ...but the collision is surfaced for a person to judge.
  const dupes = duplicatesAcrossPackages(scope)
  assert.equal(dupes.length, 1)
  assert.equal(dupes[0].perPackage.length, 2)
  assert.deepEqual(dupes[0].perPackage.map((p) => p.qty), [1, 1])
})

test('a section name shared by two packages does not collide', () => {
  const target = jobScope({ lines: [{ section: 'Materials', description: 'A', qty: 1, sellR: 100 }] })
  const source = jobScope({ lines: [{ section: 'Materials', description: 'B', qty: 1, sellR: 200 }] })
  const { scope, packageId } = importScopeAsPackage(target, source, { label: 'Second' })

  const first = scope.packages[0]
  assert.equal(packageLines(scope, first.id).length, 1)
  assert.equal(packageLines(scope, packageId).length, 1)
  assert.equal(packageLines(scope, first.id)[0].description, 'A')
  assert.equal(packageLines(scope, packageId)[0].description, 'B')
})

test('exclusions merge without duplicating what both quotes said', () => {
  const target = jobScope({ lines: [{ section: 'M', description: 'A', qty: 1, sellR: 1 }] })
  target.exclusions = ['Wall chasing', 'Municipal fees']
  const source = jobScope({ lines: [{ section: 'M', description: 'B', qty: 1, sellR: 1 }] })
  source.exclusions = ['  wall chasing  ', 'Scaffolding']

  const { scope } = importScopeAsPackage(target, source, { label: 'Second' })
  assert.deepEqual(scope.exclusions, ['Wall chasing', 'Municipal fees', 'Scaffolding'])
})

test('the bundle bills one CoC however many packages wanted one', () => {
  const target = jobScope({ lines: [{ section: 'M', description: 'A', qty: 1, sellR: 1 }], coc: true })
  const source = jobScope({ lines: [{ section: 'M', description: 'B', qty: 1, sellR: 1 }], coc: true })
  const { scope } = importScopeAsPackage(target, source, { label: 'Second' })

  assert.equal(scope.coc.included, true)
  assert.equal(scope.coc.feeR, 1500)
  // Both packages still price their own CoC when bought alone.
  assert.equal(scope.packages[0].coc.included, true)
  assert.equal(scope.packages[1].coc.included, true)
})

// ── Crew merging ─────────────────────────────────────────────────────────────

test('importing adds the days of someone on both jobs instead of listing them twice', () => {
  const target = jobScope({
    lines: [{ section: 'M', description: 'A', qty: 1, sellR: 1 }],
    crew: [{ name: 'Lucas', costR: 100 }, { name: 'Paris', costR: 120 }],
    crewDays: 1,
  })
  const source = jobScope({
    lines: [{ section: 'M', description: 'B', qty: 1, sellR: 1 }],
    crew: [{ name: 'Lucas', costR: 100 }, { name: 'Lindelani', costR: 80 }],
    crewDays: 2,
  })

  const { scope, labourMerged } = importScopeAsPackage(target, source, { label: 'Second' })
  assert.equal(labourMerged, true)

  const crew = scope.labour.crew
  assert.equal(crew.length, 3, 'Lucas is one row, not two')
  const lucas = crew.find((c) => c.name === 'Lucas')!
  assert.equal(lucas.days, 3, '1 day on the first job + 2 on the second')
  assert.equal(lucas.qty, 24, 'hours follow the days at 8 h/day')

  const paris = crew.find((c) => c.name === 'Paris')!
  assert.equal(paris.qty, 8, 'Paris was never on the second job and is not re-priced')

  const lindelani = crew.find((c) => c.name === 'Lindelani')!
  assert.equal(lindelani.days, 2)
  assert.equal(lindelani.qty, 16)

  assert.equal(scope.labour.crewDays, 3, 'the job is as long as its longest person')
})

test('a lump-sum labour block is left alone rather than quietly rewritten', () => {
  const target = jobScope({ lines: [{ section: 'M', description: 'A', qty: 1, sellR: 1 }] })
  target.labour.mode = 'fixed'
  target.labour.fixedR = 2000
  const source = jobScope({
    lines: [{ section: 'M', description: 'B', qty: 1, sellR: 1 }],
    crew: [{ name: 'Lucas', costR: 100 }],
  })

  const { scope, labourMerged } = importScopeAsPackage(target, source, { label: 'Second' })
  assert.equal(labourMerged, false)
  assert.equal(labourAmountR(scope.labour), 2000, 'the bundle price the customer may already have seen is untouched')
})

// ── The bundle saving ────────────────────────────────────────────────────────

test('the saving is what combining the visits actually takes off', () => {
  // Two jobs, one day each, same two-person crew at R100/hr cost, no markup.
  const target = jobScope({
    lines: [{ section: 'M', description: 'A', qty: 1, sellR: 1000 }],
    crew: [{ name: 'Lucas', costR: 100 }],
    crewDays: 1,
  })
  const source = jobScope({
    lines: [{ section: 'M', description: 'B', qty: 1, sellR: 2000 }],
    crew: [{ name: 'Lucas', costR: 100 }],
    crewDays: 1,
  })

  const { scope } = importScopeAsPackage(target, source, { label: 'Second' })

  // Bought separately: 2 × (materials + one 8-hour day at R100).
  assert.equal(separateTotalR(scope), 1000 + 800 + 2000 + 800)
  assert.equal(separateLabourR(scope), 1600)

  // Seeded bundle = the honest un-combined starting point, so nothing is saved yet.
  assert.equal(scopeTotals(scope).sellR, 3000 + 1600)
  assert.equal(bundleSavingR(scope), 0)

  // Matthew now says the combined visit is one 8-hour day, not two.
  const combined: QuoteScope = {
    ...scope,
    labour: {
      ...scope.labour,
      crewDays: 1,
      crew: scope.labour.crew.map((c) => ({ ...c, days: 1, qty: 8 })),
    },
  }
  assert.equal(scopeTotals(combined).sellR, 3000 + 800)
  assert.equal(bundleSavingR(combined), 800, 'exactly the day that was saved')
})

test('a bundle priced above the separate route advertises no saving', () => {
  const target = jobScope({ lines: [{ section: 'M', description: 'A', qty: 1, sellR: 100 }] })
  const source = jobScope({ lines: [{ section: 'M', description: 'B', qty: 1, sellR: 100 }] })
  const { scope } = importScopeAsPackage(target, source, { label: 'Second' })
  const dearer: QuoteScope = { ...scope, labour: { ...scope.labour, mode: 'fixed', fixedR: 5000 } }
  assert.equal(bundleSavingR(dearer), 0)
})

test('lines belonging to no package still count toward the separate route', () => {
  const target = jobScope({ lines: [{ section: 'M', description: 'A', qty: 1, sellR: 100 }] })
  const source = jobScope({ lines: [{ section: 'M', description: 'B', qty: 1, sellR: 100 }] })
  const { scope } = importScopeAsPackage(target, source, { label: 'Second' })
  const withLoose: QuoteScope = {
    ...scope,
    lines: [...scope.lines, { ...newScopeLine('Extras', 'material'), description: 'Loose', qty: 1, unitSellR: 250 }],
  }
  // Each package priced alone carries its own call-out, so compare the delta:
  // the loose line the bundle bills has to show up on the separate route too,
  // or the saving would be overstated by its value.
  assert.equal(separateTotalR(withLoose), separateTotalR(scope) + 250)
})

// ── Housekeeping ─────────────────────────────────────────────────────────────

test('removing a package takes its lines with it and leaves the others alone', () => {
  const target = jobScope({ lines: [{ section: 'M', description: 'A', qty: 1, sellR: 100 }] })
  const source = jobScope({ lines: [{ section: 'M', description: 'B', qty: 1, sellR: 200 }] })
  const { scope, packageId } = importScopeAsPackage(target, source, { label: 'Second' })

  const pruned = removePackage(scope, packageId)
  assert.equal(pruned.packages.length, 1)
  assert.equal(pruned.lines.length, 1)
  assert.equal(pruned.lines[0].description, 'A')
})

test('packages reorder without disturbing their lines', () => {
  const target = jobScope({ lines: [{ section: 'M', description: 'A', qty: 1, sellR: 100 }] })
  const source = jobScope({ lines: [{ section: 'M', description: 'B', qty: 1, sellR: 200 }] })
  const { scope, packageId } = importScopeAsPackage(target, source, { label: 'Second' })

  const moved = movePackage(scope, packageId, -1)
  assert.equal(moved.packages[0].id, packageId)
  assert.equal(packageLines(moved, packageId)[0].description, 'B')
  assert.equal(moved.lines.length, 2)
})

test('a round trip through JSON keeps every package and its lines', () => {
  const target = jobScope({
    lines: [{ section: 'M', description: 'A', qty: 1, sellR: 100 }],
    crew: [{ name: 'Lucas', costR: 100 }],
  })
  const source = jobScope({
    lines: [{ section: 'M', description: 'B', qty: 1, sellR: 200 }],
    crew: [{ name: 'Paris', costR: 120 }],
  })
  const { scope } = importScopeAsPackage(target, source, { label: 'Second' })

  const round = parseScope(JSON.parse(JSON.stringify(scope)))
  assert.ok(round)
  assert.equal(round.packages.length, 2)
  assert.equal(round.lines.length, 2)
  assert.equal(scopeTotals(round).sellR, scopeTotals(scope).sellR)
  assert.equal(separateTotalR(round), separateTotalR(scope))
})

// ── Through the BOM ──────────────────────────────────────────────────────────

test('two packages using the same section name keep two subtotals', () => {
  const target = jobScope({ lines: [{ section: 'Materials', description: 'A', qty: 1, sellR: 100 }] })
  const source = jobScope({ lines: [{ section: 'Materials', description: 'B', qty: 1, sellR: 200 }] })
  const { scope } = importScopeAsPackage(target, source, {
    label: 'Add a battery',
    existingLabel: 'Panel repair',
  })

  const bom = scopeToBom(scope, CATALOG, 1.15)
  const material = bom.sections.filter((s) => s.name.includes('Materials'))
  assert.equal(material.length, 2, 'the two Materials sections did not fuse')
  assert.deepEqual(
    material.map((s) => s.name),
    ['Panel repair — Materials', 'Add a battery — Materials'],
  )
  assert.deepEqual(material.map((s) => s.sellR), [100, 200])
  assert.deepEqual(material.map((s) => s.package), ['Panel repair', 'Add a battery'])
})

test('two packages sharing a label are still told apart', () => {
  const target = jobScope({ lines: [{ section: 'Materials', description: 'A', qty: 1, sellR: 100 }] })
  const source = jobScope({ lines: [{ section: 'Materials', description: 'B', qty: 1, sellR: 200 }] })
  const { scope } = importScopeAsPackage(target, source, { label: 'Repair', existingLabel: 'Repair' })

  const bom = scopeToBom(scope, CATALOG, 1.15)
  const names = bom.sections.map((s) => s.name).filter((n) => n.includes('Materials'))
  assert.equal(new Set(names).size, 2, 'duplicate labels must not collapse two packages into one')
})

test('the bundle bills one labour line, not one per package', () => {
  const target = jobScope({
    lines: [{ section: 'M', description: 'A', qty: 1, sellR: 100 }],
    crew: [{ name: 'Lucas', costR: 100 }],
  })
  const source = jobScope({
    lines: [{ section: 'M', description: 'B', qty: 1, sellR: 200 }],
    crew: [{ name: 'Paris', costR: 120 }],
  })
  const { scope } = importScopeAsPackage(target, source, { label: 'Second', existingLabel: 'First' })

  const bom = scopeToBom(scope, CATALOG, 1.15)
  const labour = bom.sections.filter((s) => s.name === 'Labour')
  assert.equal(labour.length, 1)
  assert.equal(labour[0].lines.length, 1)
  // And it still says nothing about who is on it.
  assert.equal(labour[0].lines[0].description, 'Labour')
  assert.equal(labour[0].package, undefined, 'the bundle labour belongs to no single package')
})

test('the BOM total equals the bundle price the builder previews', () => {
  const target = jobScope({
    lines: [{ section: 'M', description: 'A', qty: 2, sellR: 100 }],
    crew: [{ name: 'Lucas', costR: 100 }],
    coc: true,
  })
  const source = jobScope({
    lines: [{ section: 'M', description: 'B', qty: 3, sellR: 200 }],
    crew: [{ name: 'Paris', costR: 120 }],
  })
  const { scope } = importScopeAsPackage(target, source, { label: 'Second', existingLabel: 'First' })

  const bom = scopeToBom(scope, CATALOG, 1.15)
  assert.equal(bom.totalSellR, scopeTotals(scope).sellR)
})

test('the deposit is broken down per package', () => {
  const target = jobScope({ lines: [{ section: 'Materials', description: 'A', qty: 1, sellR: 100 }] })
  const source = jobScope({ lines: [{ section: 'Materials', description: 'B', qty: 1, sellR: 200 }] })
  const { scope } = importScopeAsPackage(target, source, {
    label: 'Add a battery',
    existingLabel: 'Panel repair',
  })

  const deposit = computeScopeDeposit(scopeToBom(scope, CATALOG, 1.15))
  assert.deepEqual(deposit.items, [
    { name: 'Panel repair — Materials', amountRands: 100 },
    { name: 'Add a battery — Materials', amountRands: 200 },
  ])
  assert.equal(deposit.totalR, 300)
})

test('a single-package quote renders exactly the section names it always did', () => {
  const plain = jobScope({
    lines: [{ section: 'Materials', description: 'A', qty: 1, sellR: 100 }],
    crew: [{ name: 'Lucas', costR: 100 }],
  })
  const bom = scopeToBom(plain, CATALOG, 1.15)
  assert.deepEqual(bom.sections.map((s) => s.name), ['Materials', 'Labour'])
  assert.equal(bom.sections[0].package, undefined)
})
