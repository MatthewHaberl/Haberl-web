import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PdfTextItem, PdfTextPage } from '../pdf-text'
import {
  buildRows,
  findSubtotal,
  inferQty,
  linesSubtotal,
  parseAmount,
  parseDocumentDate,
  parseSupplierQuotePages,
  readHeaderRow,
} from '../supplier-quote-table'

// Synthetic pages: [x, y, text] triples, sized like a real one so the layout
// maths is the same as a printed quote's.
type Cell = [number, number, string]
function page(cells: Cell[], n = 1): PdfTextPage {
  const items: PdfTextItem[] = cells.map(([x, y, str]) => ({
    str,
    x,
    y,
    width: str.length * 4.6,
    height: 8,
  }))
  return { page: n, width: 595, height: 842, items }
}

const HEADER: Cell[] = [
  [68, 585, 'Product Code & Description'],
  [318, 585, 'Unit'],
  [363, 585, 'Qty'],
  [400, 585, 'Unit Price'],
  [443, 585, 'Disc %'],
  [496, 585, 'Unit Net'],
  [547, 585, 'Line Total'],
]

test('parseAmount reads SA money formats', () => {
  assert.equal(parseAmount('1,680.84'), 1680.84)
  assert.equal(parseAmount('13 206.30'), 13206.3)
  assert.equal(parseAmount('R 1.234,56'), 1234.56)
  assert.equal(parseAmount('30.00'), 30)
  assert.equal(parseAmount('EA'), null)
  assert.equal(parseAmount('QU-ES-025086808'), null)
  assert.equal(parseAmount(undefined), null)
})

test('parseDocumentDate handles the formats SA quotes print', () => {
  assert.equal(parseDocumentDate('2026/08/13'), '2026-08-13')
  assert.equal(parseDocumentDate('13/08/2026'), '2026-08-13')
  assert.equal(parseDocumentDate('13 Aug 2026'), '2026-08-13')
  assert.equal(parseDocumentDate('no date here'), null)
  assert.equal(parseDocumentDate('2026/13/45'), null)
})

test('buildRows merges touching runs and splits on column gaps', () => {
  const rows = buildRows(page([
    [68, 562, 'LM-RH'],
    [90, 562, '-S-HDG'],
    [318, 562, 'EA'],
    [68, 550, 'Roof hook'],
  ]))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].cells.length, 2)
  assert.equal(rows[0].cells[0].text, 'LM-RH-S-HDG')
  assert.equal(rows[1].cells[0].text, 'Roof hook')
})

test('readHeaderRow rejects rows that are not a table header', () => {
  const [addr] = buildRows(page([[11, 720, 'SOLZA (PTY) LTD'], [204, 720, 'Shipping Address']]))
  assert.equal(readHeaderRow(addr, 595), null)
})

test('reads a discounted, multi-page quote the way the supplier priced it', () => {
  const p1 = page([
    [204, 823, 'Key Electrical Wholesalers (Pty) Ltd'],
    [421, 818, 'QUOTE / PRO FORMA'],
    [397, 720, 'Document Number:'],
    [477, 720, 'QU-ES-025086808'],
    [397, 711, 'Document Date:'],
    [477, 711, '2026/08/13'],
    [204, 664, 'Date Required:'],
    [284, 664, '2026/08/20'],
    ...HEADER,
    // Discounted line: net (70.04) is the price, not the list 100.05.
    [68, 562, 'LM-RH-S-HDG'], [318, 562, 'EA'], [366, 562, '24'],
    [409, 562, '100.05'], [447, 562, '30.00'], [504, 562, '70.04'], [551, 562, '1,680.84'],
    [68, 550, 'LX TILE ROOF HOOK BRACKET'],
    [68, 540, '(LM-RNW + FS-FW-M8)'],
    // Stock strip — must not become a line or pollute the description.
    [68, 527, 'STOCK'], [116, 527, 'On Hand 1,538'], [239, 527, 'Available 446'],
    [68, 492, 'FLEXOWELD35.0BLACK'], [318, 492, 'MTR'], [370, 492, '4'],
    [409, 492, '135.71'], [447, 492, '30.00'], [504, 492, '95.00'], [557, 492, '379.99'],
    [68, 481, 'POWER FLEX CABLE 35MM BLACK'],
    [11, 16, 'Printed 2026/08/13 07:22:55'],
  ])
  const p2 = page([
    [204, 823, 'Key Electrical Wholesalers (Pty) Ltd'],
    ...HEADER,
    [68, 562, 'DB-SH12PN'], [318, 562, 'EA'], [370, 562, '1'],
    [409, 562, '970.00'], [447, 562, '52.00'], [500, 562, '465.60'], [557, 562, '465.60'],
    [68, 551, 'CHINT DB 12 WAY SURF W/P IP65 PVC'],
    // Totals block: everything from here down is not a line item.
    [419, 85, 'SUBTOTAL'], [502, 85, 'R'], [547, 85, '2 526.43'],
    [419, 51, 'VAT'], [502, 51, 'R'], [551, 51, '378.97'],
    [419, 40, 'TOTAL'], [502, 40, 'R'], [548, 40, '2 905.41'],
  ], 2)

  const parsed = parseSupplierQuotePages([p1, p2])

  assert.equal(parsed.supplier, 'Key Electrical Wholesalers (Pty) Ltd')
  assert.equal(parsed.reference, 'QU-ES-025086808')
  assert.equal(parsed.quote_date, '2026-08-13') // document date, not "Date Required"
  assert.equal(parsed.lines.length, 3)

  assert.deepEqual(parsed.lines[0], {
    sku: 'LM-RH-S-HDG',
    description: 'LX TILE ROOF HOOK BRACKET (LM-RNW + FS-FW-M8)',
    qty: 24,
    unit: 'ea',
    unit_price_ex_vat: 70.04,
  })
  assert.equal(parsed.lines[1].unit, 'mtr')
  assert.equal(parsed.lines[1].unit_price_ex_vat, 95)
  assert.equal(parsed.lines[2].sku, 'DB-SH12PN')

  // The subtotal cross-check the panel warns on: unit prices are rounded to the
  // cent, so our sum sits a few cents off the document's — inside tolerance.
  assert.equal(parsed.subtotal_ex_vat, 2526.43)
  assert.equal(findSubtotal([p1, p2]), 2526.43)
  assert.ok(Math.abs(linesSubtotal(parsed.lines) - 2526.43) < 1)
})

test('falls back to line total ÷ qty when the unit price disagrees', () => {
  const parsed = parseSupplierQuotePages([page([
    [68, 700, 'Acme Electrical'],
    ...HEADER,
    // Unit net says 100 but the line was invoiced at 360 for 4 (a surcharge).
    [68, 562, 'ABC-1'], [318, 562, 'EA'], [370, 562, '4'],
    [409, 562, '100.00'], [504, 562, '100.00'], [551, 562, '360.00'],
    [68, 550, 'Widget'],
  ])])
  assert.equal(parsed.lines.length, 1)
  assert.equal(parsed.lines[0].unit_price_ex_vat, 90)
})

test('no header row means no lines invented', () => {
  const parsed = parseSupplierQuotePages([page([
    [68, 700, 'Some letter'],
    [68, 600, 'Dear customer, 4 units at 100.00 each'],
  ])])
  assert.equal(parsed.lines.length, 0)
})

test('VAT-inclusive price columns are converted back to ex VAT', () => {
  const parsed = parseSupplierQuotePages([page([
    [68, 700, 'Acme Electrical'],
    [68, 585, 'Description'], [363, 585, 'Qty'], [430, 585, 'Unit Price incl VAT'],
    [68, 562, 'Cable per metre'], [370, 562, '10'], [440, 562, '115.00'],
  ])])
  assert.equal(parsed.lines.length, 1)
  assert.equal(parsed.lines[0].unit_price_ex_vat, 100)
})

// ── The Key Electric invoice layout (regression, Aug 2026) ───────────────────
// Kreesan Govender's quote pulled four of these in and every line came through
// as "qty 1 at the line total": the quantity heading is "Ord", not "Qty", and
// with no quantity the price resolver fell through to total ÷ 1. The wide
// description rows and the pure-numeric / pure-alpha stock codes were lost at
// the same time. All three failures are in this one page.
const KEY_HEADER: Cell[] = [
  [14, 585, 'Product'],
  [251, 585, 'Unit'],
  [296, 585, 'Ord'],
  [329, 585, 'Sup'],
  [363, 585, 'BO'],
  [399, 585, 'Unit Price'],
  [442, 585, 'Disc %'],
  [496, 585, 'Unit Net'],
  [550, 585, 'Line Total'],
]

test('reads Key Electric invoices: "Ord" quantities, wide wording, bare codes', () => {
  const parsed = parseSupplierQuotePages([page([
    [204, 823, 'Key Electrical Wholesalers (Pty) Ltd'],
    [397, 721, 'Document Number:'], [477, 721, 'IN-IS-025094035'],
    [397, 711, 'Document Date:'], [477, 711, '2026/08/04'],
    ...KEY_HEADER,
    // 25 off at 12.60 — the line total is 315.00, NOT the unit price.
    [57, 568, '20MMSABS'], [251, 568, 'EA'], [300, 568, '25'], [334, 568, '25'], [369, 568, '0'],
    [412, 568, '18.00'], [446, 568, '30.00'], [503, 568, '12.60'], [556, 568, '315.00'],
    [57, 557, 'PVC 20MM SABS CONDUIT 4M'],
    // Pure-numeric stock code, wording on the row below.
    [57, 528, '2149010'], [251, 528, 'EA'], [296, 528, '100'], [330, 528, '100'], [369, 528, '0'],
    [416, 528, '4.00'], [446, 528, '40.00'], [507, 528, '2.40'], [556, 528, '240.00'],
    [57, 517, 'OBO M20 QUICK CLIP GREY (SADDLE)'],
    // Pure-alpha code, plus a description wide enough to overhang three columns.
    [57, 488, 'EARTHCOUPLING'], [251, 488, 'EA'], [304, 488, '5'], [338, 488, '5'], [369, 488, '0'],
    [408, 488, '130.00'], [446, 488, '30.00'], [503, 488, '91.00'], [556, 488, '455.00'],
    [57, 477, 'EARTH ROD COUPLING M16X80MM THREADED (ERA03) AND SOME MORE WORDS'],
    // A cut length: metres, and a lot stamp that is not part of the product.
    [57, 448, 'SWA16X3FR'], [251, 448, 'MTR'], [300, 448, '16'], [334, 448, '16'], [369, 448, '0'],
    [408, 448, '214.28'], [446, 448, '30.00'], [499, 448, '150.00'], [550, 448, '2,399.94'],
    [57, 437, 'PVC/SWA/PVC 16mmx3c Cu FR 600/1000V RED STRIPE (91A)'],
    [57, 412, 'Serial/Lot:'], [91, 412, 'SWA16X3FR-260729-10'],
    [420, 93, 'SUBTOTAL'], [502, 93, 'R'], [550, 93, '3 409.94'],
    [420, 47, 'TOTAL'], [502, 47, 'R'], [550, 47, '3 921.43'],
  ])])

  assert.equal(parsed.reference, 'IN-IS-025094035')
  assert.equal(parsed.lines.length, 4)

  assert.deepEqual(parsed.lines[0], {
    sku: '20MMSABS',
    description: 'PVC 20MM SABS CONDUIT 4M',
    qty: 25,
    unit: 'ea',
    unit_price_ex_vat: 12.6,
  })
  // Numeric code kept as the SKU, not swallowed into the description.
  assert.equal(parsed.lines[1].sku, '2149010')
  assert.equal(parsed.lines[1].qty, 100)
  assert.equal(parsed.lines[1].unit_price_ex_vat, 2.4)
  // Alpha-only code, and wording that overhangs its column is still captured.
  assert.equal(parsed.lines[2].sku, 'EARTHCOUPLING')
  assert.equal(
    parsed.lines[2].description,
    'EARTH ROD COUPLING M16X80MM THREADED (ERA03) AND SOME MORE WORDS',
  )
  // Cut length: per-metre rate, and the lot stamp stays off the description.
  assert.equal(parsed.lines[3].qty, 16)
  assert.equal(parsed.lines[3].unit, 'mtr')
  assert.equal(parsed.lines[3].unit_price_ex_vat, 150)
  assert.ok(!/Serial/i.test(parsed.lines[3].description))

  // And the whole page reconciles to the subtotal the supplier printed — the
  // check that "qty 1 at the line total" silently satisfied.
  assert.ok(Math.abs(linesSubtotal(parsed.lines) - 3409.94) < 1)
})

test('inferQty recovers the count when no quantity column is labelled', () => {
  // 100 off at a cent-rounded 0.80: 79.80 ÷ 0.80 is 99.75, and 100 is right.
  assert.equal(inferQty({ price: 1.14, discount: 30, net: 0.8, total: 79.8 }), 100)
  assert.equal(inferQty({ price: null, discount: null, net: 12.6, total: 315 }), 25)
  // A total that is not a whole multiple of the unit is not a quantity.
  assert.equal(inferQty({ price: null, discount: null, net: 100, total: 250 }), null)
  assert.equal(inferQty({ price: null, discount: null, net: 0, total: 250 }), null)
})

test('a quantity column still wins over the inferred count', () => {
  const parsed = parseSupplierQuotePages([page([
    [68, 700, 'Acme Electrical'],
    ...HEADER,
    // Qty says 3; the totals imply 4 (a rounded unit price). Qty is the truth.
    [68, 562, 'ABC-1'], [318, 562, 'EA'], [370, 562, '3'],
    [409, 562, '100.00'], [504, 562, '100.00'], [551, 562, '400.00'],
    [68, 550, 'Widget'],
  ])])
  assert.equal(parsed.lines[0].qty, 3)
})

// ── The Solarway / Y & R Solar invoice layout (Aug 2026) ─────────────────────
// Header: Description | Quantity | Incl. Price | Disc % | VAT % | Excl. Total |
// Incl. Total. Everything about this layout is per-COLUMN rather than
// per-document: one price column carries VAT, the next total column doesn't,
// and the totals block prints an exclusive AND an inclusive grand figure.
const SOLARWAY_HEADER: Cell[] = [
  [24, 524, 'Description'],
  [203, 524, 'Quantity'],
  [252, 524, 'Incl. Price'],
  [318, 524, 'Disc %'],
  [360, 524, 'VAT %'],
  [438, 524, 'Excl. Total'],
  [531, 524, 'Incl. Total'],
]

/** The letterhead: labelled fields top right, the company name lower left. */
const SOLARWAY_HEAD: Cell[] = [
  [467, 804, 'TAX INVOICE'],
  [408, 781, 'NUMBER:'], [521, 781, 'INV0057184'],
  [408, 769, 'REFERENCE:'],
  [408, 758, 'DATE:'], [526, 758, '24/08/2026'],
  [408, 746, 'DUE DATE:'], [526, 746, '31/08/2026'],
  [408, 733, 'SALES REP:'], [540, 733, 'ISMAIL'],
  [24, 656, 'FROM'], [308, 656, 'TO'],
  [24, 641, 'Y & R SOLAR (PTY) LTD'], [308, 641, 'HABERL'],
  [23, 623, 'VAT NO:'], [64, 623, '4120286150'],
]

test('reads Solarway invoices: VAT-inclusive prices, exclusive totals, inline codes', () => {
  const p = page([
    ...SOLARWAY_HEAD,
    ...SOLARWAY_HEADER,
    // R19.50 each INCLUDING VAT, 2 off, R33.91 excluding.
    [24, 497, 'AS-AMC-01B - ADJUSTABLE MID'], [229, 497, '2'], [259, 497, 'R 19.50'],
    [319, 497, '0,00%'], [357, 497, '15,00%'], [447, 497, 'R 33.91'], [538, 497, 'R 39.00'],
    [24, 487, 'CLAMP/INCL SPRING'],
    [419, 183, 'Total Discount:'], [544, 183, 'R 0.00'],
    [419, 170, 'Total Exclusive:'], [539, 170, 'R 33.91'],
    [419, 158, 'Total VAT:'], [544, 158, 'R 5.09'],
    [419, 146, 'Sub Total:'], [539, 146, 'R 39.00'],
    [419, 110, 'Grand Total:'], [539, 110, 'R 39.00'],
  ])
  const parsed = parseSupplierQuotePages([p])

  // The name under FROM, not the "NUMBER:" label that sits above it.
  assert.equal(parsed.supplier, 'Y & R SOLAR (PTY) LTD')
  assert.equal(parsed.reference, 'INV0057184')
  assert.equal(parsed.quote_date, '2026-08-24')

  assert.equal(parsed.lines.length, 1)
  assert.deepEqual(parsed.lines[0], {
    // Stock code written into the front of the wording, not a column of its own.
    sku: 'AS-AMC-01B',
    description: 'ADJUSTABLE MID CLAMP/INCL SPRING',
    qty: 2,
    unit: 'ea',
    // NOT 19.50: that figure includes VAT. 33.91 ÷ 2, rounded up like the
    // supplier did.
    unit_price_ex_vat: 16.96,
  })

  // "Total Exclusive" beats the VAT-INCLUSIVE "Sub Total" printed below it —
  // taking the last match warned that a correct extraction didn't add up.
  assert.equal(findSubtotal([p]), 33.91)
  assert.equal(parsed.subtotal_ex_vat, 33.91)
  assert.ok(Math.abs(linesSubtotal(parsed.lines) - 33.91) < 1)
})

test('the exclusive total column wins over the inclusive one beside it', () => {
  const parsed = parseSupplierQuotePages([page([
    ...SOLARWAY_HEAD,
    ...SOLARWAY_HEADER,
    [24, 497, 'AS-TB - T-BOLT'], [229, 497, '4'], [264, 497, 'R 5.90'],
    [319, 497, '0,00%'], [357, 497, '15,00%'], [447, 497, 'R 20.52'], [538, 497, 'R 23.60'],
    // A zero-rated trading fee on an otherwise 15% invoice: R1.40 is R1.40 in
    // every column. Dividing the "Incl. Price" by 1.15 would invent a discount,
    // and gluing "R 1.40 R 1.40" into one cell would lose the total that proves
    // there is no VAT in it.
    [24, 464, 'TRD - TRADING FEE'], [229, 464, '1'], [264, 464, 'R 1.40'],
    [319, 464, '0,00%'], [362, 464, '0,00%'], [452, 464, 'R 1.40'], [543, 464, 'R 1.40'],
    [419, 170, 'Total Exclusive:'], [539, 170, 'R 21.92'],
    [419, 146, 'Sub Total:'], [539, 146, 'R 25.00'],
  ])])

  assert.equal(parsed.lines.length, 2)
  assert.equal(parsed.lines[0].sku, 'AS-TB')
  assert.equal(parsed.lines[0].qty, 4)
  assert.equal(parsed.lines[0].unit_price_ex_vat, 5.13)
  assert.equal(parsed.lines[1].unit_price_ex_vat, 1.4)
  assert.equal(linesSubtotal(parsed.lines), 21.92)
})

test('a brand at the front of a description is not torn off as a SKU', () => {
  const parsed = parseSupplierQuotePages([page([
    [68, 700, 'Acme Electrical'],
    [24, 585, 'Description'], [363, 585, 'Qty'], [400, 585, 'Unit Price'], [547, 585, 'Line Total'],
    // Key Electric's wording. "CBI" is a brand, and the dash is a third of the
    // way in — the code, if there were one, would be the FIRST word.
    [24, 562, 'CBI 80A 2P MCB 6KA - MINI RAIL BLACK 2 MOD'],
    [370, 562, '1'], [409, 562, '945.00'], [551, 562, '945.00'],
    // Nor is an ordinary all-caps first word, however code-like it looks.
    [24, 540, 'TRD - TRADING FEE'], [370, 540, '1'], [409, 540, '1.40'], [551, 540, '1.40'],
    // A real part number is: four characters or more, with code punctuation.
    [24, 518, 'AS-CRS-01 - RAIL SPLICE'], [370, 518, '1'], [409, 518, '42.61'], [551, 518, '42.61'],
  ])])

  assert.equal(parsed.lines.length, 3)
  assert.equal(parsed.lines[0].sku, '')
  assert.equal(parsed.lines[0].description, 'CBI 80A 2P MCB 6KA - MINI RAIL BLACK 2 MOD')
  assert.equal(parsed.lines[1].sku, '')
  assert.equal(parsed.lines[1].description, 'TRD - TRADING FEE')
  assert.equal(parsed.lines[2].sku, 'AS-CRS-01')
  assert.equal(parsed.lines[2].description, 'RAIL SPLICE')
})

test('VAT-inclusiveness is read per column, not per document', () => {
  const [header] = buildRows(page(SOLARWAY_HEADER))
  const cols = readHeaderRow(header, 595)
  assert.ok(cols)
  const flags = cols.map((c) => [c.label, c.key, c.vatInclusive])
  assert.deepEqual(flags, [
    ['Description', 'description', false],
    ['Quantity', 'qty', false],
    // Only "incl" — no "VAT", which is what the old document-level test needed.
    ['Incl. Price', 'price', true],
    ['Disc %', 'discount', false],
    ['VAT %', null, false],
    // Two columns, one role: "Excl." reads as exclusive, "Incl." as inclusive.
    ['Excl. Total', 'total', false],
    ['Incl. Total', 'total', true],
  ])
})
