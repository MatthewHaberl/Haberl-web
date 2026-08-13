// Run with: npx tsx --test lib/quotes/__tests__/scope-bom.test.ts
//
// The scope engine's whole safety story is one constraint: scopeToBom must emit
// the SAME DesignBom shape designToBom does, because everything downstream of
// the BOM (deposit, bom_snapshot, job materials, finance) is shared with the
// solar path. These tests pin that shape, the pricing rules (catalog cost ×
// markup, manual override, never-invent-prices), the labour/CoC generated
// lines, optional-extras exclusion, and deposit-by-material-sections — plus
// solar deposit parity for the computeDeposit(bom, sections?) refactor.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { EquipmentCatalogItem } from '../../solar/quote-calculator'
import { computeDeposit } from '../../solar/design-quote'
import type { DesignBom } from '../../solar/design-bom'
import {
  emptyScope, newScopeLine, parseScope, scopeTotals, labourAmountR,
  scopeDepositSections, type QuoteScope, type ScopeLine,
} from '../scope'
import { scopeToBom, stripOptionalLines, computeScopeDeposit } from '../scope-bom'

const MARKUP = 1.15

function catItem(id: string, extra: Partial<EquipmentCatalogItem> = {}): EquipmentCatalogItem {
  return {
    id,
    category: 'other',
    brand: 'Test',
    sku: `SKU-${id}`,
    description: `Item ${id}`,
    watts_ac: null,
    watts_dc: null,
    kwh: null,
    phase: 'any',
    cost_rands: 100,
    isc_amps: null,
    voc_volts: null,
    active: true,
    sort_order: 0,
    notes: null,
    ...extra,
  }
}

function line(section: string, extra: Partial<ScopeLine> = {}): ScopeLine {
  return { ...newScopeLine(section), ...extra }
}

function fixtureScope(): QuoteScope {
  const scope = emptyScope({ sections: ['Distribution board', 'Wiring & containment', 'Labour', 'Compliance'] })
  scope.summary = 'Replace the DB board and rewire the kitchen.'
  scope.lines = [
    line('Distribution board', { catalogId: 'db1', qty: 1 }),
    line('Wiring & containment', { catalogId: 'cable1', qty: 25, unit: 'm' }),
    line('Wiring & containment', { description: 'Misc gland kit', qty: 1, unitSellR: 150, unitCostR: 100 }),
  ]
  scope.labour = { mode: 'hourly', calloutR: 750, hours: 8, rateR: 750, days: 0, dayRateR: 5500, fixedR: 0, description: '' }
  scope.coc = { included: true, feeR: 1500 }
  return scope
}

function fixtureCatalog(): Map<string, EquipmentCatalogItem> {
  return new Map([
    ['db1', catItem('db1', { cost_rands: 2000, description: '24-way DB board' })],
    ['cable1', catItem('cable1', { cost_rands: 20, description: '2.5mm² GP wire' })],
  ])
}

// ── Shape conformance: the invariants everything downstream relies on ─────────

test('scopeToBom output satisfies the DesignBom invariants designToBom guarantees', () => {
  const bom = scopeToBom(fixtureScope(), fixtureCatalog(), MARKUP)

  const round2 = (n: number) => Math.round(n * 100) / 100
  for (const s of bom.sections) {
    assert.ok(s.name.length > 0)
    assert.ok(s.lines.length > 0, `section ${s.name} has lines`)
    const counted = s.lines.filter((l) => !l.optional)
    assert.equal(s.costR, round2(counted.reduce((t, l) => t + l.lineCostR, 0)), `${s.name} costR`)
    assert.equal(s.sellR, round2(counted.reduce((t, l) => t + l.lineSellR, 0)), `${s.name} sellR`)
    assert.equal(s.needsPricing, s.lines.filter((l) => !l.priced).length, `${s.name} needsPricing`)
    for (const l of s.lines) {
      assert.equal(l.section, s.name)
      assert.ok(l.catalogId.length > 0, 'every line carries a catalogId (real or synthetic)')
      assert.ok(l.qty > 0)
      if (!l.priced) {
        assert.equal(l.unitSellR, 0)
        assert.equal(l.lineSellR, 0)
        assert.notEqual(l.status, 'ok')
      } else {
        assert.equal(l.status, 'ok')
      }
    }
  }
  assert.equal(bom.totalSellR, round2(bom.sections.reduce((t, s) => t + s.sellR, 0)))
  assert.equal(bom.totalCostR, round2(bom.sections.reduce((t, s) => t + s.costR, 0)))
  assert.equal(bom.needsPricing, bom.sections.reduce((t, s) => t + s.needsPricing, 0))
})

test('sections render in scope order; labour and CoC land in their own sections', () => {
  const bom = scopeToBom(fixtureScope(), fixtureCatalog(), MARKUP)
  assert.deepEqual(
    bom.sections.map((s) => s.name),
    ['Distribution board', 'Wiring & containment', 'Labour', 'Compliance'],
  )
})

// ── Pricing rules ─────────────────────────────────────────────────────────────

test('catalog lines price at cost × markup; free-text priced lines keep their typed price', () => {
  const bom = scopeToBom(fixtureScope(), fixtureCatalog(), MARKUP)
  const db = bom.sections[0].lines[0]
  assert.equal(db.unitCostR, 2000)
  assert.equal(db.unitSellR, 2300) // 2000 × 1.15
  const wiring = bom.sections[1]
  const cable = wiring.lines[0]
  assert.equal(cable.unitSellR, 23) // 20 × 1.15
  assert.equal(cable.lineSellR, 575) // 25 m
  const gland = wiring.lines[1]
  assert.equal(gland.unitSellR, 150) // typed price stands
  assert.equal(gland.unitCostR, 100)
})

test('a manual unitSellR wins over cost × markup when sellOverridden', () => {
  const scope = fixtureScope()
  scope.lines[0] = { ...scope.lines[0], sellOverridden: true, unitSellR: 2500 }
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  assert.equal(bom.sections[0].lines[0].unitSellR, 2500)
  assert.equal(bom.sections[0].lines[0].unitCostR, 2000) // cost still from catalog
})

test('unpriced free-text lines become R0 "Quote" lines, never silently priced or folded into the total', () => {
  const scope = fixtureScope()
  scope.lines.push(line('Distribution board', { description: 'Special breaker TBC', qty: 2 }))
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  const unpriced = bom.sections[0].lines.find((l) => l.description === 'Special breaker TBC')!
  assert.equal(unpriced.priced, false)
  assert.equal(unpriced.status, 'no-product')
  assert.equal(unpriced.lineSellR, 0)
  const withoutIt = scopeToBom(fixtureScope(), fixtureCatalog(), MARKUP)
  assert.equal(bom.totalSellR, withoutIt.totalSellR, 'total unchanged by an unpriced line')
  assert.equal(bom.needsPricing, withoutIt.needsPricing + 1)
})

test('a vanished catalog product degrades to product-missing and increments missing', () => {
  const scope = fixtureScope()
  scope.lines.push(line('Distribution board', { catalogId: 'gone', description: 'Old pick', qty: 1 }))
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  const missing = bom.sections[0].lines.find((l) => l.status === 'product-missing')!
  assert.equal(missing.priced, false)
  assert.match(missing.description, /product not in catalog/)
  assert.equal(bom.missing, 1)
})

test('a catalog product with no cost degrades to no-cost', () => {
  const catalog = fixtureCatalog()
  catalog.set('free', catItem('free', { cost_rands: 0 }))
  const scope = fixtureScope()
  scope.lines.push(line('Distribution board', { catalogId: 'free', qty: 1 }))
  const bom = scopeToBom(scope, catalog, MARKUP)
  assert.equal(bom.sections[0].lines.at(-1)!.status, 'no-cost')
})

// ── Labour + CoC generated lines ──────────────────────────────────────────────

test('hourly labour = call-out + hours × rate, sell-only (cost == sell, solar Labour convention)', () => {
  const bom = scopeToBom(fixtureScope(), fixtureCatalog(), MARKUP)
  const labour = bom.sections.find((s) => s.name === 'Labour')!
  assert.equal(labour.lines.length, 1)
  assert.equal(labour.sellR, 750 + 7 * 750) // 6000 — call-out covers hour 1
  assert.equal(labour.costR, labour.sellR)
})

test('daily labour bills days × the team day rate, with no call-out', () => {
  const scope = fixtureScope()
  scope.labour = { ...scope.labour, mode: 'daily', days: 2.5, dayRateR: 5500 }
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  const labour = bom.sections.find((s) => s.name === 'Labour')!
  assert.equal(labour.sellR, 2.5 * 5500) // 13750 — calloutR is ignored in daily mode
  assert.equal(labour.lines[0].description, 'Labour — 2.5 days on site (team)')
})

test('fixed labour bills the typed amount only', () => {
  const scope = fixtureScope()
  scope.labour = { mode: 'fixed', calloutR: 750, hours: 8, rateR: 750, days: 0, dayRateR: 5500, fixedR: 4200, description: 'Fixed price' }
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  const labour = bom.sections.find((s) => s.name === 'Labour')!
  assert.equal(labour.sellR, 4200)
  assert.equal(labour.lines[0].description, 'Fixed price')
})

test('CoC included bills exactly the scope fee — an explicit R0 stays R0, never the settings default', () => {
  const bom = scopeToBom(fixtureScope(), fixtureCatalog(), MARKUP)
  const compliance = bom.sections.find((s) => s.name === 'Compliance')!
  assert.equal(compliance.sellR, 1500)

  // Staff cleared the fee ("included at no charge") — the builder preview shows
  // no fee, so generate must not silently re-bill the company default.
  const scope = fixtureScope()
  scope.coc = { included: true, feeR: 0 }
  const zeroed = scopeToBom(scope, fixtureCatalog(), MARKUP, {
    pricing: {
      markup: MARKUP, cocRands: 1800, labourInverterPerW: 0.25, labourPanelPerW: 0.75,
      storeyPremium2: 2000, storeyPremium3: 5000, tariffs: {},
    },
  })
  assert.equal(zeroed.sections.find((s) => s.name === 'Compliance'), undefined)
  assert.equal(zeroed.totalSellR, bom.totalSellR - 1500)
})

// ── Optional extras ───────────────────────────────────────────────────────────

test('optional lines are carried in the BOM but excluded from every total', () => {
  const scope = fixtureScope()
  scope.lines.push(line('Distribution board', {
    catalogId: 'db1', qty: 1, optional: true,
  }))
  const base = scopeToBom(fixtureScope(), fixtureCatalog(), MARKUP)
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  assert.equal(bom.totalSellR, base.totalSellR, 'optional line adds nothing to the total')
  assert.equal(bom.sections[0].sellR, base.sections[0].sellR)
  const optional = bom.sections[0].lines.find((l) => l.optional)!
  assert.equal(optional.priced, true)
  assert.equal(optional.lineSellR, 2300, 'the extra still shows its own price')
})

test('stripOptionalLines removes optional lines (and empty sections) for bom_snapshot/job materials', () => {
  const scope = fixtureScope()
  scope.lines.push(line('Optional bits', { catalogId: 'db1', qty: 1, optional: true }))
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  const stripped = stripOptionalLines(bom)
  assert.ok(!stripped.sections.some((s) => s.name === 'Optional bits'))
  assert.ok(!stripped.sections.flatMap((s) => s.lines).some((l) => l.optional))
  assert.equal(stripped.totalSellR, bom.totalSellR, 'totals never counted optional lines')
})

// ── Deposit ───────────────────────────────────────────────────────────────────

test('scope deposit = material LINES only; labour and compliance on completion', () => {
  const scope = fixtureScope()
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  const deposit = computeScopeDeposit(bom)
  assert.deepEqual(deposit.items.map((i) => i.name), ['Distribution board', 'Wiring & containment'])
  assert.equal(deposit.totalR, 2300 + 575 + 150)
  // Labour + CoC are the balance
  assert.equal(
    Math.round((bom.totalSellR - deposit.totalR) * 100) / 100,
    6000 + 1500,
  )
})

test('a material line sharing the Labour/Compliance section never drags the generated labour or CoC into the deposit', () => {
  // Work type defaults seed a 'Labour' section and the editor can add material
  // lines to it — the deposit must still be the material line alone, not the
  // whole section including the generated R6000 labour line.
  const scope = fixtureScope()
  scope.lines.push(line('Labour', { catalogId: 'db1', qty: 1 })) // R2300 material in 'Labour'
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  const deposit = computeScopeDeposit(bom)
  const labourItem = deposit.items.find((i) => i.name === 'Labour')!
  assert.equal(labourItem.amountRands, 2300, 'material only — not the R6000 generated labour')
  assert.equal(deposit.totalR, 2300 + 575 + 150 + 2300)
})

test('a fee line inside a materials section stays out of the deposit', () => {
  const scope = fixtureScope()
  scope.lines.push(line('Distribution board', { kind: 'fee', description: 'Disposal fee', qty: 1, unitSellR: 300 }))
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  const deposit = computeScopeDeposit(bom)
  assert.equal(deposit.items.find((i) => i.name === 'Distribution board')!.amountRands, 2300)
})

test('optional material lines never bill a deposit', () => {
  const scope = emptyScope({ sections: ['Materials'] })
  scope.lines = [line('Materials', { catalogId: 'db1', qty: 1, optional: true })]
  assert.deepEqual(scopeDepositSections(scope), [])
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  assert.equal(computeScopeDeposit(bom).totalR, 0)
})

test('duplicate section names in scope.sections do not double the section, total or deposit', () => {
  const scope = fixtureScope()
  scope.sections = ['Distribution board', 'Distribution board', 'Wiring & containment', 'Labour', 'Compliance']
  const bom = scopeToBom(scope, fixtureCatalog(), MARKUP)
  assert.equal(bom.sections.filter((s) => s.name === 'Distribution board').length, 1)
  const clean = scopeToBom(fixtureScope(), fixtureCatalog(), MARKUP)
  assert.equal(bom.totalSellR, clean.totalSellR)
  assert.equal(computeScopeDeposit(bom).totalR, computeScopeDeposit(clean).totalR)
  // parseScope also dedupes at the persistence boundary
  const parsed = parseScope(JSON.stringify({ ...scope, sections: ['A', 'A', 'B'] }))!
  assert.deepEqual(parsed.sections, ['A', 'B'])
})

test('lines with a blank section land in "Scope of work" at parse time (visible + deposited)', () => {
  const parsed = parseScope(JSON.stringify({
    sections: [],
    lines: [{ id: 'x', section: '', kind: 'material', qty: 1, unitSellR: 100, unit: 'ea' }],
  }))!
  assert.equal(parsed.lines[0].section, 'Scope of work')
  const bom = scopeToBom(parsed, new Map(), MARKUP)
  assert.equal(computeScopeDeposit(bom).items[0]?.name, 'Scope of work')
})

test('solar deposit parity: computeDeposit with no section argument matches the historical starred list', () => {
  // Fixture shaped like a consolidated solar BOM: starred equipment sections
  // plus Labour/Extras that must never bill a deposit.
  const solarLine = (section: string, sellR: number): DesignBom['sections'][number] => ({
    name: section,
    lines: [{
      section, catalogId: `c-${section}`, sku: '', description: section,
      qty: 1, unitCostR: sellR / MARKUP, unitSellR: sellR, lineCostR: sellR / MARKUP, lineSellR: sellR,
      priced: true, status: 'ok',
    }],
    costR: sellR / MARKUP,
    sellR,
    needsPricing: 0,
  })
  const bom: DesignBom = {
    sections: [
      solarLine('Panels', 20000),
      solarLine('Inverter', 25000),
      solarLine('Batteries', 40000),
      solarLine('AC board', 5000),
      solarLine('Labour', 12000),
      solarLine('Extras', 3000),
    ],
    totalCostR: 0,
    totalSellR: 105000,
    missing: 0,
    needsPricing: 0,
  }
  const implicit = computeDeposit(bom)
  const explicit = computeDeposit(bom, ['Panels', 'Inverter', 'Batteries', 'DC combiner', 'AC board'])
  assert.deepEqual(implicit, explicit)
  assert.equal(implicit.totalR, 90000, 'starred sections only — Labour/Extras excluded')
})

// ── parseScope + preview totals ───────────────────────────────────────────────

test('parseScope tolerates JSON strings, junk lines and missing blocks; rejects non-objects', () => {
  assert.equal(parseScope(null), null)
  assert.equal(parseScope('not json {'), null)
  assert.equal(parseScope([1, 2]), null)

  const parsed = parseScope(JSON.stringify({
    summary: 'x',
    sections: ['A', 42, 'B'],
    lines: [
      { id: 'l1', section: 'A', kind: 'material', qty: '3', unitSellR: 10, unit: 'nonsense' },
      'garbage',
    ],
    labour: { mode: 'weird', hours: 2 },
  }))!
  assert.equal(parsed.summary, 'x')
  assert.deepEqual(parsed.sections, ['A', 'B'])
  assert.equal(parsed.lines.length, 1)
  assert.equal(parsed.lines[0].qty, 3)
  assert.equal(parsed.lines[0].unit, 'ea', 'unknown unit falls back')
  assert.equal(parsed.labour.mode, 'hourly', 'unknown mode falls back')
  assert.equal(parsed.labour.hours, 2)
})

test('scopeTotals previews sell/deposit split and flags unpriced lines', () => {
  const scope = fixtureScope()
  scope.lines.push(line('Distribution board', { description: 'TBC item', qty: 1 })) // unpriced
  scope.lines.push(line('Distribution board', { catalogId: 'db1', qty: 1, optional: true, unitSellR: 500 }))
  const totals = scopeTotals(scope)
  // Stored values: db 0 (not yet priced in the scope itself)… the fixture's
  // catalog lines carry unitSellR 0 until the UI prices them, so materials here
  // are just the typed gland line.
  assert.equal(totals.materialsR, 150)
  assert.equal(totals.labourR, labourAmountR(scope.labour))
  assert.equal(totals.feesR, 1500)
  assert.equal(totals.optionalR, 500)
  assert.ok(totals.needsPricing >= 3, `catalog-not-yet-priced + TBC lines counted, got ${totals.needsPricing}`)
})
