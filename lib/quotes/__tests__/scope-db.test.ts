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
import { dbBoardToScopeLines, dbEnclosureDescription } from '../scope-db'

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
