import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BomLine, DesignBom } from '../../solar/design-bom'
import type { EquipmentCatalogItem } from '../../solar/quote-calculator'
import {
  NO_CODE_HEADING,
  bomToRfqCandidates,
  groupRfqLines,
  renderRfqText,
  whatsappLink,
  type SupplierRfqLineRow,
} from '../supplier-rfq'

const NOW = new Date('2026-08-18T00:00:00Z').getTime()
const DAY = 86_400_000

function line(over: Partial<BomLine> = {}): BomLine {
  return {
    section: 'Earthing', catalogId: 'cat', sku: 'ABC-1', description: 'Earth rod',
    qty: 2, unitCostR: 100, unitSellR: 115, lineCostR: 200, lineSellR: 230,
    priced: true, status: 'ok', ...over,
  }
}

function bom(lines: BomLine[]): DesignBom {
  const bySection = new Map<string, BomLine[]>()
  for (const l of lines) (bySection.get(l.section) ?? bySection.set(l.section, []).get(l.section)!).push(l)
  return {
    sections: [...bySection].map(([name, ls]) => ({
      name, lines: ls, costR: 0, sellR: 0, needsPricing: ls.filter((l) => !l.priced).length,
    })),
    totalCostR: 0, totalSellR: 0, missing: 0,
    needsPricing: lines.filter((l) => !l.priced).length,
  }
}

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

function catalog(entries: Array<[string, string | null]>): Map<string, EquipmentCatalogItem> {
  const m = new Map<string, EquipmentCatalogItem>()
  for (const [id, priceUpdatedAt] of entries) {
    m.set(id, { id, sku: id, description: id, price_updated_at: priceUpdatedAt } as EquipmentCatalogItem)
  }
  return m
}

// ── What lands on the list ───────────────────────────────────────────────────

test('every material line goes on the list, priced or not', () => {
  const out = bomToRfqCandidates(
    bom([
      line({ catalogId: UUID_A, sku: 'ROD-1', description: 'Earth rod 1.2m' }),
      line({ catalogId: UUID_B, sku: 'SPD-1', description: 'SPD Type 2', section: 'Protection' }),
    ]),
    catalog([[UUID_A, new Date(NOW).toISOString()], [UUID_B, new Date(NOW).toISOString()]]),
    { now: NOW },
  )
  assert.equal(out.length, 2)
  assert.deepEqual(out.map((c) => c.sku), ['ROD-1', 'SPD-1'])
})

test('our own labour and fees are not the supplier\'s to price', () => {
  const out = bomToRfqCandidates(
    bom([
      line({ section: 'Labour', catalogId: 'labour:install', sku: '—', description: 'Panel install' }),
      line({ section: 'Compliance', catalogId: 'coc', sku: '—', description: 'CoC' }),
      line({ section: 'Extras', kind: 'fee', catalogId: 'scope:1', sku: '', description: 'Management fee' }),
      line({ catalogId: UUID_A, sku: 'ROD-1', description: 'Earth rod' }),
    ]),
    catalog([[UUID_A, null]]),
    { now: NOW },
  )
  assert.deepEqual(out.map((c) => c.description), ['Earth rod'])
})

test('a line with no product is flagged as needing a code, not just a price', () => {
  const [candidate] = bomToRfqCandidates(
    bom([line({
      catalogId: 'unpriced:Earthing:bolts', sku: '—', description: 'M8 stainless nuts and bolts',
      priced: false, status: 'no-product', unitCostR: 0, unitSellR: 0, lineCostR: 0, lineSellR: 0,
    })]),
    catalog([]),
    { now: NOW },
  )
  assert.equal(candidate.needsCode, true)
  assert.equal(candidate.unpriced, true)
  assert.equal(candidate.catalogId, null, 'a synthetic BOM id is not a catalog row')
})

test('a cost older than 60 days is flagged stale; a fresh one is not', () => {
  const out = bomToRfqCandidates(
    bom([
      line({ catalogId: UUID_A, sku: 'OLD-1', description: 'Imported months ago' }),
      line({ catalogId: UUID_B, sku: 'NEW-1', description: 'Priced this week', section: 'Protection' }),
    ]),
    catalog([
      [UUID_A, new Date(NOW - 200 * DAY).toISOString()],
      [UUID_B, new Date(NOW - 6 * DAY).toISOString()],
    ]),
    { now: NOW },
  )
  assert.equal(out[0].stale, true)
  assert.equal(out[0].priceAgeDays, 200)
  assert.equal(out[1].stale, false)
})

test('the same item in two sections is asked about once, at the summed qty', () => {
  const out = bomToRfqCandidates(
    bom([
      line({ catalogId: UUID_A, sku: 'LUG-6', description: 'Earth lug 6mm', qty: 4 }),
      line({ catalogId: UUID_A, sku: 'LUG-6', description: 'Earth lug 6mm', qty: 6, section: 'Batteries' }),
    ]),
    catalog([[UUID_A, null]]),
    { now: NOW },
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].qty, 10)
})

test('cable is asked for by the metre', () => {
  const [candidate] = bomToRfqCandidates(
    bom([line({ section: 'Cabling', catalogId: 'cable:e1', sku: 'Cu 6', description: 'PV string', qty: 40 })]),
    catalog([]),
    { now: NOW },
  )
  assert.equal(candidate.unit, 'm')
})

// ── Grouping and printing ────────────────────────────────────────────────────

function row(over: Partial<SupplierRfqLineRow> = {}): SupplierRfqLineRow {
  return {
    id: over.id ?? 'l1', rfq_id: 'r1', line_no: 0, section: 'Earthing', sku: 'ROD-1',
    description: 'Earth rod 1.2m', qty: 2, unit: 'ea', catalog_id: null,
    needs_code: false, note: null, created_at: '', ...over,
  }
}

test('code-less items are grouped last, under their own heading', () => {
  const groups = groupRfqLines([
    row({ id: 'a', line_no: 0 }),
    row({ id: 'b', line_no: 1, sku: '', description: 'M8 nuts and bolts', needs_code: true }),
    row({ id: 'c', line_no: 2, section: 'Protection', sku: 'SPD-1', description: 'SPD' }),
  ])
  assert.deepEqual(groups.map((g) => g.heading), ['Earthing', 'Protection', NO_CODE_HEADING])
  assert.equal(groups[2].needsCode, true)
  assert.equal(groups[2].lines[0].description, 'M8 nuts and bolts')
})

test('a line with a blank SKU lands in the code-less group even unflagged', () => {
  const groups = groupRfqLines([row({ sku: '  ', needs_code: false })])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].heading, NO_CODE_HEADING)
})

test('the sent text carries qty, code, note and the free-text message — and no prices', () => {
  const text = renderRfqText(
    { rfqNumber: 'RFQ-2026-001', supplierName: 'Key Electric', contactPerson: 'Ethan', jobRef: 'Smith — Kyalami', message: 'Needed by Friday.' },
    [
      row({ id: 'a', line_no: 0 }),
      row({ id: 'b', line_no: 1, sku: '', description: 'M8 nuts and bolts', qty: 20, needs_code: true, note: 'stainless, with washers' }),
      row({ id: 'c', line_no: 2, section: 'Cabling', sku: 'Cu 6', description: 'PV cable', qty: 40, unit: 'm' }),
    ],
  )
  assert.match(text, /RFQ-2026-001/)
  assert.match(text, /Hi Ethan,/)
  assert.match(text, /Smith — Kyalami/)
  assert.match(text, /Needed by Friday\./)
  assert.match(text, /2 x ROD-1 — Earth rod 1\.2m/)
  assert.match(text, /20 x M8 nuts and bolts \(stainless, with washers\)/)
  assert.match(text, /40 m x Cu 6 — PV cable/)
  assert.match(text, /please advise the code/)
  assert.doesNotMatch(text, /R\s?\d/, 'an RFQ asks — it never quotes a price back')
})

test('the WhatsApp link opens the supplier chat with the text prefilled', () => {
  const url = whatsappLink('RFQ-2026-001 & co', '+27 64 516 3699')
  assert.match(url, /^https:\/\/wa\.me\/27645163699\?text=/)
  assert.match(url, /%26/, 'the text is URL-encoded')
  assert.match(whatsappLink('hi', null), /^https:\/\/wa\.me\/\?text=/)
})
