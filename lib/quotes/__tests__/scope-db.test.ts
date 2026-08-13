// Run with: npx tsx --test lib/quotes/__tests__/scope-db.test.ts
//
// dbBoardToScopeLines bridges the DB builder into the scope engine. The rules
// that matter: catalog products price at cost × markup with sellOverridden
// left false (so generate re-prices from the authoritative catalog), and
// anything unpriceable — manual enclosure, deviceless products, custom
// placeholders, zero-cost items — becomes an unpriced "Quote" line without
// ever inventing a price or leaking the custom: sentinel.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { EquipmentCatalogItem } from '../../solar/quote-calculator'
import {
  defaultAcCombiner, defaultDbComponent, DB_SUPPLY_ID, type AcCombiner, type DbComponent,
} from '../../solar/system-design'
import {
  dbBoardToScopeLines, dbEnclosureDescription, scopeLinesToDbBoard, DB_ENCLOSURE_KEY,
} from '../scope-db'
import { newScopeLine, type ScopeLine } from '../scope'

const MARKUP = 1.15
const SECTION = 'Distribution board'

function catItem(id: string, extra: Partial<EquipmentCatalogItem> = {}): EquipmentCatalogItem {
  return {
    id,
    category: 'breaker',
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

function comp(extra: Partial<DbComponent>): DbComponent {
  return { ...defaultDbComponent('breaker', [DB_SUPPLY_ID]), ...extra }
}

function board(extra: Partial<AcCombiner>): AcCombiner {
  return { ...defaultAcCombiner(), ...extra }
}

test('catalog enclosure + costed products price at cost × markup, re-priceable at generate', () => {
  const catalog = new Map([
    ['enc1', catItem('enc1', { category: 'enclosure', cost_rands: 800, description: '12-way DB' })],
    ['mcb1', catItem('mcb1', { cost_rands: 120, description: '63A MCB' })],
  ])
  const b = board({
    enclosureCatalogId: 'enc1',
    components: [comp({ label: 'Main breaker', productId: 'mcb1', qty: 2 })],
  })
  const lines = dbBoardToScopeLines(b, catalog, MARKUP, SECTION)

  assert.equal(lines.length, 2)
  const [enc, mcb] = lines
  assert.equal(enc.catalogId, 'enc1')
  assert.equal(enc.description, '12-way DB')
  assert.equal(enc.qty, 1)
  assert.equal(enc.unitCostR, 800)
  assert.equal(enc.unitSellR, 920)
  assert.equal(mcb.catalogId, 'mcb1')
  assert.equal(mcb.qty, 2)
  assert.equal(mcb.unitSellR, 138)
  for (const l of lines) {
    assert.equal(l.section, SECTION)
    assert.equal(l.kind, 'material')
    // Generate must stay authoritative: never mark the derived price as manual.
    assert.equal(l.sellOverridden, false)
    assert.equal(l.optional, false)
  }
})

test('manual enclosure becomes an unpriced line describing the board', () => {
  const b = board({ enclosureCatalogId: null, components: [] })
  const lines = dbBoardToScopeLines(b, new Map(), MARKUP, SECTION)

  assert.equal(lines.length, 1)
  assert.equal(lines[0].catalogId, null)
  assert.equal(lines[0].unitSellR, 0)
  assert.equal(lines[0].description, dbEnclosureDescription(b))
  assert.match(lines[0].description, /12-way/)
  assert.match(lines[0].description, /CHINT-DB-12W-S-PL/)
})

test('productless, custom-placeholder and zero-cost devices all land as "Quote" lines', () => {
  const catalog = new Map([['free1', catItem('free1', { cost_rands: 0, description: 'Uncosted SPD' })]])
  const b = board({
    enclosureCatalogId: null,
    components: [
      comp({ label: 'Geyser circuit', productId: null }),
      comp({ label: 'Pilot light', productId: 'custom:red indicator lamp' }),
      comp({ label: 'AC SPD', productId: 'free1' }),
    ],
  })
  const [, noProduct, custom, noCost] = dbBoardToScopeLines(b, catalog, MARKUP, SECTION)

  assert.equal(noProduct.catalogId, null)
  assert.equal(noProduct.description, 'Geyser circuit')
  assert.equal(noProduct.unitSellR, 0)

  // The sentinel's label surfaces; the raw custom: marker never leaks.
  assert.equal(custom.catalogId, null)
  assert.equal(custom.description, 'red indicator lamp')

  assert.equal(noCost.catalogId, 'free1')
  assert.equal(noCost.description, 'Uncosted SPD')
  assert.equal(noCost.unitCostR, 0)
  assert.equal(noCost.unitSellR, 0)
})

test('a stale enclosure id (item gone from the active catalog) falls back to the described board', () => {
  const b = board({ enclosureCatalogId: 'gone', components: [] })
  const lines = dbBoardToScopeLines(b, new Map(), MARKUP, SECTION)
  assert.equal(lines[0].catalogId, null)
  assert.equal(lines[0].description, dbEnclosureDescription(b))
})

test('device qty is normalised to at least 1 and blank labels fall back to the kind', () => {
  const b = board({
    enclosureCatalogId: null,
    components: [comp({ label: '  ', productId: null, qty: 0 })],
  })
  const [, device] = dbBoardToScopeLines(b, new Map(), MARKUP, SECTION)
  assert.equal(device.qty, 1)
  assert.equal(device.description, 'Circuit breaker (MCB)')
})

// ── Reopening the builder on a section that already holds a board ─────────────

function line(extra: Partial<ScopeLine>): ScopeLine {
  return { ...newScopeLine(SECTION, 'material'), ...extra }
}

test('reopening reads the parts already on the quote — enclosure, products, qty, kinds', () => {
  const catalog = new Map([
    ['enc1', catItem('enc1', { category: 'enclosure', cost_rands: 800, description: 'DB SU3 15-way', sku: 'SUS3D', notes: 'plastic surface 15-way 1-row IP4X' })],
    ['mcb1', catItem('mcb1', { cost_rands: 160, description: 'CHINT 63A 2P breaker' })],
  ])
  const existing = [
    line({ catalogId: 'enc1', sku: 'SUS3D', description: 'DB SU3 15-way', qty: 1 }),
    line({ catalogId: 'mcb1', description: 'CHINT 63A 2P breaker', qty: 1 }),
    line({ catalogId: null, description: 'Earth leakage (RCCB)', qty: 1 }),
    line({ catalogId: null, description: 'AC SPD', qty: 2 }),
  ]

  const { board: b, sources } = scopeLinesToDbBoard(existing, catalog)

  // The enclosure comes back as the chosen catalog product, not a blank board.
  assert.equal(b.enclosureCatalogId, 'enc1')
  assert.equal(b.productCode, 'SUS3D')
  assert.equal(b.components.length, 3)
  // Products already picked stay picked; kinds are read off the wording.
  assert.equal(b.components[0].productId, 'mcb1')
  assert.equal(b.components[0].kind, 'breaker')
  assert.equal(b.components[1].kind, 'rccb')
  assert.equal(b.components[2].kind, 'spd')
  assert.equal(b.components[2].qty, 2)
  // The main device takes the incoming feed; the rest hang off it.
  assert.deepEqual(b.components[0].fedFrom, [DB_SUPPLY_ID])
  assert.deepEqual(b.components[1].fedFrom, [b.components[0].id])
  assert.equal(sources.get(DB_ENCLOSURE_KEY)?.id, existing[0].id)
  assert.equal(sources.size, 4)
})

test('a second run edits the same lines in place instead of adding a second board', () => {
  const catalog = new Map([['mcb1', catItem('mcb1', { cost_rands: 160, description: 'CHINT 63A 2P breaker' })]])
  const existing = [
    line({ catalogId: null, description: dbEnclosureDescription(board({})), qty: 1 }),
    line({ catalogId: 'mcb1', description: 'CHINT 63A 2P breaker', qty: 1 }),
  ]

  const { board: b, sources } = scopeLinesToDbBoard(existing, catalog)
  const rebuilt = dbBoardToScopeLines(b, catalog, MARKUP, SECTION, { preserve: sources })

  assert.equal(rebuilt.length, 2)
  // Same line ids → the editor rewrites those rows rather than appending copies.
  assert.equal(rebuilt[0].id, existing[0].id)
  assert.equal(rebuilt[1].id, existing[1].id)
  assert.equal(rebuilt[1].catalogId, 'mcb1')
  assert.equal(rebuilt[1].unitSellR, 184)
  // The manual enclosure's config survived the round trip through its wording.
  assert.equal(rebuilt[0].description, existing[0].description)
})

test('a typed price and the optional flag survive a rebuild; changing the product re-prices', () => {
  const catalog = new Map([
    ['mcb1', catItem('mcb1', { cost_rands: 160, description: 'CHINT 63A 2P breaker' })],
    ['mcb2', catItem('mcb2', { cost_rands: 200, description: 'CHINT 80A 2P breaker' })],
  ])
  const existing = [
    line({ catalogId: 'mcb1', description: 'CHINT 63A 2P breaker', qty: 1, unitSellR: 250, sellOverridden: true, optional: true, note: 'client asked for it' }),
  ]
  const { board: b, sources } = scopeLinesToDbBoard(existing, catalog)

  const same = dbBoardToScopeLines(b, catalog, MARKUP, SECTION, { preserve: sources })
  assert.equal(same[1].unitSellR, 250)
  assert.equal(same[1].sellOverridden, true)
  assert.equal(same[1].optional, true)
  assert.equal(same[1].note, 'client asked for it')

  // Swap the product and the hand-typed price no longer applies — it re-derives.
  b.components[0].productId = 'mcb2'
  const swapped = dbBoardToScopeLines(b, catalog, MARKUP, SECTION, { preserve: sources })
  assert.equal(swapped[1].catalogId, 'mcb2')
  assert.equal(swapped[1].unitSellR, 230)
  assert.equal(swapped[1].sellOverridden, false)
})

test('a price typed on a free-text line survives the rebuild', () => {
  // The editor leaves sellOverridden false on free-text lines, so this price is
  // only recoverable from the line itself — the board can't re-derive it.
  const existing = [
    line({ catalogId: null, description: 'Terminal bar', qty: 3, unitCostR: 90, unitSellR: 120 }),
  ]
  const { board: b, sources } = scopeLinesToDbBoard(existing, new Map())
  const [, bar] = dbBoardToScopeLines(b, new Map(), MARKUP, SECTION, { preserve: sources })

  assert.equal(bar.description, 'Terminal bar')
  assert.equal(bar.qty, 3)
  assert.equal(bar.unitCostR, 90)
  assert.equal(bar.unitSellR, 120)
})

test('labour, fees and per-metre lines are left out of the board entirely', () => {
  const existing = [
    line({ catalogId: null, description: 'Surfix cable', qty: 20, unit: 'm' }),
    line({ kind: 'labour', description: 'Wiring', qty: 4, unit: 'hr' }),
    line({ kind: 'fee', description: 'Inspection fee', qty: 1 }),
    line({ catalogId: null, description: 'Main breaker', qty: 1 }),
  ]
  const { board: b, sources } = scopeLinesToDbBoard(existing, new Map())

  assert.equal(b.components.length, 1)
  assert.equal(b.components[0].label, 'Main breaker')
  // Only the one device is owned by the board — the rest stay put in the section.
  assert.equal(sources.size, 1)
})

test('an empty section still opens on the default starter board', () => {
  const { board: b, sources } = scopeLinesToDbBoard([], new Map())
  assert.equal(sources.size, 0)
  assert.equal(b.components.length, 3)
})
