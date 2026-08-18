import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyScope, newScopeLine, importScopeAsPackage, type QuoteScope } from '../scope'
import { scopeToBom } from '../scope-bom'
import { buildScopeQuoteData } from '../scope-quote'
import { renderScopeQuote } from '../render-scope-quote'
import { parsePackageChoice } from '../public'
import { detailedBomSections } from '@/lib/solar/design-quote'
import type { DesignBom } from '@/lib/solar/design-bom'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * The two decisions migration 124 put on the quote:
 *   — detail level: simplified section subtotals, or every line priced.
 *   — all-or-nothing: whether one work package can be bought on its own.
 *
 * Both are about what the customer is told, so both are tested through the
 * rendered document rather than the data that feeds it.
 */

const CATALOG = new Map<string, EquipmentCatalogItem>([
  ['cat-db', {
    id: 'cat-db', sku: 'DB-3X15', description: 'DB 3x15 way surf',
    cost_rands: 900, category: 'distribution_board',
  } as unknown as EquipmentCatalogItem],
])

/** The renderers' money format, mirrored so no test hard-codes en-ZA. */
function rand(n: number): string {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Read one back: drop the R and the group separators; the comma is the point. */
function unrand(formatted: string): number {
  return Number(formatted.replace(/[R\s ]/g, '').replace(',', '.'))
}

function boardScope(): QuoteScope {
  const s = emptyScope({ sections: ['Distribution board', 'Wiring'] })
  s.summary = 'Replace the main board'
  s.lines = [
    { ...newScopeLine('Distribution board', 'material'), description: 'DB 3x15 way surf', qty: 1, catalogId: 'cat-db', unitCostR: 900 },
    { ...newScopeLine('Distribution board', 'material'), description: 'CHINT 63A 2P breaker', qty: 2, unitSellR: 138 },
    { ...newScopeLine('Wiring', 'material'), description: 'Surfix 2.5mm', qty: 30, unitSellR: 22 },
  ]
  return s
}

function documentFor(
  scope: QuoteScope,
  opts: { showLineItems?: boolean; allowPartial?: boolean } = {},
) {
  const bom = scopeToBom(scope, CATALOG, 1.15)
  return buildScopeQuoteData({
    scope, bom, catalog: CATALOG,
    req: { customer_name: 'Chris' },
    quoteNumber: 'QUO-2026-124',
    expiryDays: 14,
    workType: 'electrical',
    workTypeLabel: 'Electrical work',
    ...opts,
  })
}

// ── Detail level ─────────────────────────────────────────────────────────────

test('a simplified quote is the default and states subtotals, never line prices', () => {
  const data = documentFor(boardScope())
  assert.ok(data.sections.every((s) => s.lines === undefined), 'no section should carry lines')

  const html = renderScopeQuote(data)
  assert.doesNotMatch(html, /class="bom-table detailed"/)
  assert.ok(!html.includes('<tr class="line-row'))
  // The breakers are R276,00 of a R1 311,00 section. A simplified quote names
  // the parts in its one-line summary but never prices any of them.
  assert.match(html, /CHINT 63A 2P breaker/, 'the summary still names what is in the section')
  assert.ok(!html.includes(rand(276)), 'no line of a section may carry its own price')
})

test('a detailed quote prints every line with its quantity and its unit price', () => {
  const data = documentFor(boardScope(), { showLineItems: true })
  const board = data.sections.find((s) => s.name === 'Distribution board')!
  assert.equal(board.lines!.length, 2)

  const html = renderScopeQuote(data)
  assert.match(html, /class="bom-table detailed"/)
  assert.match(html, /CHINT 63A 2P breaker/)
  assert.match(html, /Surfix 2\.5mm/)
  // Quantity and unit price beside the item, and the line's own amount.
  assert.ok(html.includes(`2 &times; ${rand(138)}`))
  assert.ok(html.includes(`30 &times; ${rand(22)}`))
  assert.ok(html.includes(rand(276)), 'the breakers now state what they cost')
})

test('a line bought once prices itself — no "1 ×" beside the same figure', () => {
  const data = documentFor(boardScope(), { showLineItems: true })
  const single = data.sections
    .flatMap((s) => s.lines ?? [])
    .find((l) => l.description.startsWith('DB 3x15'))!
  assert.equal(single.qty, 1)
  assert.equal(single.unit, '', 'a quantity of one has no unit price worth stating')
  assert.ok(!renderScopeQuote(data).includes('1 &times; R'))
})

test('the lines add up to the subtotal the simplified quote would have shown', () => {
  const simplified = documentFor(boardScope())
  const detailed = documentFor(boardScope(), { showLineItems: true })

  for (const section of detailed.sections) {
    const sum = section.lines!
      .filter((l) => l.amount !== 'Quote')
      .reduce((t, l) => t + unrand(l.amount), 0)
    assert.equal(
      Math.round(sum * 100) / 100,
      Math.round(section.subtotalRands * 100) / 100,
      `${section.name}: detailed lines must reconcile to the subtotal`,
    )
  }
  // And the detail changes nothing about what is owed.
  assert.equal(detailed.quoteTotalRands, simplified.quoteTotalRands)
  assert.equal(detailed.depositTotalRands, simplified.depositTotalRands)
})

test('an unpriced line says Quote rather than R0.00', () => {
  const s = boardScope()
  s.lines.push({ ...newScopeLine('Wiring', 'material'), description: 'Trunking (awaiting supplier)', qty: 4 })
  const detailed = documentFor(s, { showLineItems: true })
  const line = detailed.sections
    .flatMap((x) => x.lines ?? [])
    .find((l) => l.description.startsWith('Trunking'))!
  assert.equal(line.amount, 'Quote')
  assert.equal(line.unit, '', 'nothing to state per item until it is priced')
})

test('optional extras stay out of the line items — they are not in the subtotal', () => {
  const s = boardScope()
  s.lines.push({
    ...newScopeLine('Wiring', 'material'),
    description: 'Surge arrester', qty: 1, unitSellR: 1200, optional: true,
  })
  const detailed = documentFor(s, { showLineItems: true })
  assert.ok(
    detailed.sections.flatMap((x) => x.lines ?? []).every((l) => !l.description.includes('Surge arrester')),
    'an optional extra listed as a priced line would read as part of the total',
  )
  assert.ok(detailed.optionalExtras.some((x) => x.description === 'Surge arrester'))
})

// ── All or nothing ───────────────────────────────────────────────────────────

function combinedScope(): QuoteScope {
  const b = emptyScope({ sections: ['Lights'] })
  b.summary = 'Replace the downlights'
  b.lines = [{ ...newScopeLine('Lights', 'material'), description: 'LED downlight', qty: 8, unitSellR: 180 }]
  return importScopeAsPackage(boardScope(), b, { label: 'Downlights', existingLabel: 'Board' }).scope
}

test('a combined quote offers the parts by default', () => {
  const html = renderScopeQuote(documentFor(combinedScope()))
  assert.match(html, /If done on its own/)
  assert.match(html, /Taking All of It, or Part of It/)
})

test('all-or-nothing takes every offer of a part off the document', () => {
  const html = renderScopeQuote(documentFor(combinedScope(), { allowPartial: false }))
  assert.doesNotMatch(html, /If done on its own/, 'a standalone price is an offer to sell it alone')
  assert.doesNotMatch(html, /Your Options/)
  assert.doesNotMatch(html, /Taking All of It, or Part of It/)
  assert.doesNotMatch(html, /Or just one part/)

  // What it says instead: the reason, and the way to ask for something smaller.
  assert.match(html, /What You&rsquo;re Accepting/)
  assert.match(html, /isn&rsquo;t priced in parts/)
  assert.match(html, /we&rsquo;ll send a fresh quote/)
  assert.match(html, /doesn&rsquo;t simply subtract/, 'still refuses to imply the subtotals subtract')
})

test('a single-job quote says it too, without inventing packages', () => {
  const html = renderScopeQuote(documentFor(boardScope(), { allowPartial: false }))
  assert.match(html, /What You&rsquo;re Accepting/)
  assert.match(html, /the sections above/)
})

test('nothing to choose between still prints no choice section', () => {
  const s = emptyScope({ sections: ['Callout'] })
  s.summary = 'Fault find'
  s.lines = [{ ...newScopeLine('Callout', 'material'), description: 'Callout', qty: 1, unitSellR: 850 }]
  const html = renderScopeQuote(documentFor(s, { allowPartial: false }))
  assert.doesNotMatch(html, /What You&rsquo;re Accepting/, 'one section has nothing to be all-or-nothing about')
})

test('the accept page and the accept route both see no parts on offer', () => {
  const generated = JSON.stringify(documentFor(combinedScope()))
  // Same JSON, same packages — only the switch differs.
  assert.ok(parsePackageChoice({ generated_quote: generated })!.packages.length >= 2)
  assert.equal(parsePackageChoice({ generated_quote: generated, allow_partial_acceptance: false }), null)
  assert.ok(
    parsePackageChoice({ generated_quote: generated, allow_partial_acceptance: null }),
    'a row predating the column keeps the choice its document already offers',
  )
})

// ── Solar engine ─────────────────────────────────────────────────────────────

test('the solar itemised breakdown carries sell prices only, and adds up', () => {
  const bom: DesignBom = {
    sections: [{
      name: 'Panels',
      lines: [
        {
          section: 'Panels', catalogId: 'p', sku: 'AIKO-500', description: 'Aiko 500W panel',
          qty: 8, unitCostR: 1000, unitSellR: 1150, lineCostR: 8000, lineSellR: 9200,
          priced: true, status: 'ok',
        },
        {
          section: 'Panels', catalogId: '', sku: '', description: 'Optimiser (to be priced)',
          qty: 2, unitCostR: 0, unitSellR: 0, lineCostR: 0, lineSellR: 0,
          priced: false, status: 'no-product',
        },
      ],
      costR: 8000, sellR: 9200, needsPricing: 1,
    }],
    totalCostR: 8000, totalSellR: 9200, missing: 0, needsPricing: 1,
  }

  const [section] = detailedBomSections(bom)
  assert.equal(section.subtotal, rand(9200))
  assert.deepEqual(section.lines[0], {
    description: 'Aiko 500W panel', qty: 8, unit: rand(1150), amount: rand(9200),
  })
  assert.equal(section.lines[1].amount, 'Quote')

  const serialised = JSON.stringify(section)
  assert.doesNotMatch(serialised, /1000|8000/, 'cost must never reach the customer document')
})
