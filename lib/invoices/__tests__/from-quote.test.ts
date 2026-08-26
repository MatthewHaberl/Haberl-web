import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quoteConversion, randsFromText } from '../from-quote'
import { linesForBasis, linesTotalCents, jobBilling } from '../invoice'

/**
 * Converting a quote into an invoice.
 *
 * The rules worth holding:
 *
 *   • the lines add up to what the document says is payable — always, and
 *     visibly, never by a silent fudge
 *   • an accepted option or work package is the one that gets billed
 *   • a line the quote could not price is left off and SAID, not guessed at
 *   • money is read out of the document, never re-priced
 */

// ── Reading a money field ────────────────────────────────────────────────────

test('money parses out of what the document actually printed', () => {
  assert.equal(randsFromText('R12 345,00'), 12345)          // en-ZA, space + comma
  assert.equal(randsFromText('R12 345,00'), 12345)     // non-breaking space
  assert.equal(randsFromText('R12,345.00'), 12345)          // en-US fallback
  assert.equal(randsFromText('R1 250'), 1250)
  assert.equal(randsFromText('R1,250'), 1250)               // grouping, not cents
  assert.equal(randsFromText('R12,50'), 12.5)               // cents, not grouping
  assert.equal(randsFromText('−R1 250,00'), -1250)     // typographic minus
  assert.equal(randsFromText(1234.5), 1234.5)
  // No price is not a price of zero.
  assert.equal(randsFromText('Quote'), null)
  assert.equal(randsFromText('—'), null)
  assert.equal(randsFromText(''), null)
  assert.equal(randsFromText(null), null)
})

// ── Scope quotes ─────────────────────────────────────────────────────────────

const scopeQuote = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'scope',
    summary: 'Rewire the outbuilding and hang a new board.',
    sections: [
      { name: 'Distribution board', detail: 'New 12-way board, main switch, breakers', subtotalRands: 8000 },
      { name: 'Circuits', detail: 'Six new circuits in conduit', subtotalRands: 12000 },
      { name: 'Labour', detail: 'Two people, three days', subtotalRands: 5000 },
    ],
    packages: [],
    sharedSections: [],
    quoteTotalRands: 25000,
    ...over,
  })

test('every section of the quote becomes its own invoice line', () => {
  const c = quoteConversion(scopeQuote(), { quoteNumber: 'QUO-2026-014' })!
  assert.equal(c.engine, 'scope')
  assert.equal(c.lines.length, 3)
  assert.equal(c.lines[0].description, 'Distribution board')
  assert.equal(c.lines[0].detail, 'New 12-way board, main switch, breakers')
  assert.equal(c.lines[0].amountCents, 800000)
  assert.equal(c.lines[0].sourceRef, 'QUO-2026-014')
  assert.equal(c.totalCents, 2_500_000)
  assert.equal(c.summary, 'Rewire the outbuilding and hang a new board.')
  assert.equal(c.note, null)
})

test('a credit on the quote comes across as a credit on the invoice', () => {
  const c = quoteConversion(
    scopeQuote({
      credits: [{ label: 'Deposit already paid', amount: '−R5 000,00' }],
      payableTotalRands: 20000,
    }),
  )!
  const credit = c.lines.at(-1)!
  assert.equal(credit.source, 'credit')
  assert.equal(credit.amountCents, -500000)
  assert.equal(c.totalCents, 2_000_000)
  assert.equal(c.note, null, 'the lines already reach the payable total — nothing to flag')
})

test('lines that disagree with the quote total get the difference on its own line', () => {
  const c = quoteConversion(scopeQuote({ quoteTotalRands: 26000 }))!
  assert.equal(c.lines.length, 4)
  assert.equal(c.lines[3].description, 'Adjustment to the quoted total')
  assert.equal(c.lines[3].amountCents, 100000)
  assert.equal(c.totalCents, 2_600_000, 'the invoice still bills what the customer agreed to')
  assert.match(c.note ?? '', /did not agree/)
})

test('a detailed quote is billed line by line, under its section', () => {
  const c = quoteConversion(
    scopeQuote({
      sections: [
        {
          name: 'Circuits',
          detail: 'Six new circuits',
          subtotalRands: 25000,
          lines: [
            { description: '2.5mm² twin & earth', qty: 100, unit: 'R150,00', amount: 'R15 000,00' },
            { description: '20A breaker', qty: 5, unit: 'R2 000,00', amount: 'R10 000,00' },
          ],
        },
      ],
    }),
  )!
  assert.equal(c.lines.length, 2)
  assert.equal(c.lines[0].qty, 100)
  assert.equal(c.lines[0].unitPriceCents, 15000)
  assert.equal(c.lines[0].amountCents, 1_500_000)
  assert.equal(c.lines[0].detail, 'Circuits', 'the section stays readable as the small print')
  assert.equal(c.totalCents, 2_500_000)
})

test('a line the quote never priced is left off and said out loud', () => {
  const c = quoteConversion(
    scopeQuote({
      sections: [
        {
          name: 'Circuits',
          subtotalRands: 15000,
          lines: [
            { description: '2.5mm² twin & earth', qty: 100, unit: 'R150,00', amount: 'R15 000,00' },
            { description: 'Isolator — awaiting supplier price', qty: 1, unit: '', amount: 'Quote' },
          ],
        },
      ],
      quoteTotalRands: 15000,
    }),
  )!
  assert.equal(c.lines.length, 1)
  assert.match(c.note ?? '', /1 line on the quote had no price/)
})

// ── Combined quotes ──────────────────────────────────────────────────────────

const packagedQuote = JSON.stringify({
  type: 'scope',
  summary: 'Two jobs, one visit.',
  sections: [
    { name: 'Solar — Panels', subtotalRands: 40000 },
    { name: 'Gate — Motor', subtotalRands: 8000 },
    { name: 'Labour', subtotalRands: 6000 },
  ],
  packages: [
    { id: 'p1', name: 'Solar', sections: [{ name: 'Solar — Panels', subtotalRands: 40000 }], ownTotalRands: 46000 },
    { id: 'p2', name: 'Gate', sections: [{ name: 'Gate — Motor', subtotalRands: 8000 }], ownTotalRands: 11000 },
  ],
  sharedSections: [{ name: 'Labour', subtotalRands: 6000 }],
  quoteTotalRands: 54000,
})

test('taking everything bills every section, shared ones included', () => {
  const c = quoteConversion(packagedQuote, { acceptedTier: null })!
  assert.equal(c.lines.length, 3)
  assert.equal(c.totalCents, 5_400_000)
})

test('one accepted package bills at its standalone price, and names the difference', () => {
  const c = quoteConversion(packagedQuote, { acceptedTier: 'pkg:p2' })!
  assert.equal(c.lines[0].description, 'Gate — Motor')
  assert.equal(c.lines.length, 2)
  assert.match(c.lines[1].description, /on its own/)
  assert.equal(c.lines[1].amountCents, 300000, 'R11 000 standalone less the R8 000 of work')
  assert.equal(c.totalCents, 1_100_000)
  assert.match(c.note ?? '', /"Gate" package/)
})

// ── Solar quotes ─────────────────────────────────────────────────────────────

const solarQuote = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    systemType: 'Hybrid',
    totalKwp: '6.4',
    panelCount: '16',
    panelModel: 'Aiko 400W',
    inverterQty: '1',
    inverterModel: 'Sunsynk 8kW',
    inverterKw: '8',
    batteryQty: '1',
    batteryModel: 'Sunsynk 5.32',
    batteryKwh: '5.32',
    panelMountingSubtotal: 'R40 000,00',
    cablesSubtotal: 'R6 000,00',
    dcProtectionSubtotal: 'R4 000,00',
    inverterBatterySubtotal: 'R70 000,00',
    acDbSubtotal: 'R0,00',
    earthingSubtotal: 'R3 000,00',
    consumablesSubtotal: 'R5 000,00',
    labourSubtotal: 'R22 000,00',
    quoteTotalRands: 150000,
    ...over,
  })

test('a solar quote bills the summary table the customer read', () => {
  const c = quoteConversion(solarQuote(), { quoteNumber: 'QUO-2026-020' })!
  assert.equal(c.engine, 'solar')
  const names = c.lines.map((l) => l.description)
  assert.deepEqual(names, [
    'Panels & Mounting',
    'Cables & Connectors',
    'DC Protection',
    'Inverter & Battery System',
    'Earthing System',
    'Consumables & Compliance',
    'Installation Labour',
  ])
  assert.equal(c.totalCents, 15_000_000)
  assert.match(c.lines[0].detail ?? '', /16 × Aiko 400W/)
  assert.match(c.lines[3].detail ?? '', /Sunsynk 8kW/)
  assert.match(c.summary ?? '', /6.4kWp/)
})

test('the accepted option is the one that gets billed', () => {
  const doc = JSON.stringify({
    type: 'multi-option',
    options: [
      { tier: 'premium', tierLabel: 'Premium', labourSubtotal: 'R30 000,00', quoteTotalRands: 30000 },
      { tier: 'budget', tierLabel: 'Budget', labourSubtotal: 'R10 000,00', quoteTotalRands: 10000 },
    ],
  })
  const c = quoteConversion(doc, { acceptedTier: 'budget' })!
  assert.equal(c.totalCents, 1_000_000)
  assert.match(c.note ?? '', /Budget option/)

  // Nothing accepted yet: it converts something, and says it guessed.
  const guessed = quoteConversion(doc, { acceptedTier: null })!
  assert.match(guessed.note ?? '', /none is marked accepted/)
})

// ── Nothing to convert ───────────────────────────────────────────────────────

test('an unreadable document converts to nothing rather than to a wrong number', () => {
  assert.equal(quoteConversion(null), null)
  assert.equal(quoteConversion(''), null)
  assert.equal(quoteConversion('not json'), null)
  assert.equal(quoteConversion('[]'), null)
  assert.equal(quoteConversion(JSON.stringify({ type: 'scope', sections: [] })), null)
})

// ── What the invoice ends up billing ─────────────────────────────────────────

test('converting the quote shows the whole job and claims only what is left', () => {
  const quoted = quoteConversion(scopeQuote())!.lines
  const billing = jobBilling({
    contractCents: 2_500_000,
    invoices: [
      {
        id: 'i1',
        invoice_number: 'INV-2026-0001',
        kind: 'deposit',
        status: 'sent',
        issue_date: '2026-08-01',
        due_date: null,
        total_cents: 1_000_000,
        amount_paid_cents: 1_000_000,
      },
    ],
    quoteDepositCents: 1_000_000,
    depositConfirmed: true,
  })

  const lines = linesForBasis('quote', {
    billing,
    quoteNumber: 'QUO-2026-014',
    quoteDepositCents: 1_000_000,
    workLabel: 'Electrical work',
    quoteLines: quoted,
  })

  assert.equal(lines.length, 4, 'three sections, then what has been claimed already')
  assert.equal(lines[3].description, 'Less invoices already raised on this job')
  assert.equal(lines[3].amountCents, -1_000_000)
  assert.equal(linesTotalCents(lines), 1_500_000, 'the balance, off a document that shows the lot')
})

test('with no quote behind the job the quote basis writes nothing', () => {
  const lines = linesForBasis('quote', {
    billing: jobBilling({
      contractCents: null,
      invoices: [],
      quoteDepositCents: null,
      depositConfirmed: false,
    }),
    quoteNumber: null,
    quoteDepositCents: null,
    workLabel: 'Electrical work',
  })
  assert.deepEqual(lines, [])
})
