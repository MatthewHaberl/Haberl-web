import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TAGS,
  lookupTag,
  hasSupplierTag,
  stripSupplierTags,
  parseSupplierTags,
  scrubSupplierMarkup,
} from '../supplier-tags'

// Every description below is copied verbatim out of the live catalog
// (equipment_catalog, 2026-08-20 audit) — not invented. If one of these ever
// fails, a real customer-facing quote line is at stake.

test('strips the noise tags, keeping the rest of the description intact', () => {
  const cases: [string, string][] = [
    [
      '[NEW] CHINT 125A 1P CIRCUIT BREAKER D-CURVE 6KA (816128)',
      'CHINT 125A 1P CIRCUIT BREAKER D-CURVE 6KA (816128)',
    ],
    [
      '[10MT] INSULATION TAPE ECONO 10M BLACK (HELL/PAYS/SEL)',
      'INSULATION TAPE ECONO 10M BLACK (HELL/PAYS/SEL)',
    ],
    [
      '[ECO] PID 230VAC PID CONT 48X48 UNIV INPUT 2 RELAY 1 SSR OUT',
      'PID 230VAC PID CONT 48X48 UNIV INPUT 2 RELAY 1 SSR OUT',
    ],
    ['[UNI] BOOTLACE FERRULE END SLEEVE', 'BOOTLACE FERRULE END SLEEVE'],
    ['[UNI] DIN RAIL 1MT SLOTTED (35x7.5MM)', 'DIN RAIL 1MT SLOTTED (35x7.5MM)'],
  ]
  for (const [raw, clean] of cases) {
    assert.equal(stripSupplierTags(raw), clean)
    assert.equal(hasSupplierTag(raw), true)
  }
})

test('a tag is stripped mid-string too, not just when it leads', () => {
  // 7 of the 13 [UNI] rows carry it mid-description; a leading-only rule would
  // have left every one of these on the customer's quote.
  assert.equal(
    stripSupplierTags('TOSUN DB 24 WAY DIN RAIL WEATHER PROOF SURFACE IP65 2X12 [UNI] (DB-HT24W/EH HADB 24)'),
    'TOSUN DB 24 WAY DIN RAIL WEATHER PROOF SURFACE IP65 2X12 (DB-HT24W/EH HADB 24)',
  )
  assert.equal(
    stripSupplierTags('AUS NARROW T8 5FT 1x24W LED OPEN CHANNEL FITT 1.5MT [PROMO WHILE STOCKS LAST]'),
    'AUS NARROW T8 5FT 1x24W LED OPEN CHANNEL FITT 1.5MT',
  )
})

// ─── The false positives this must never produce ────────────────────────────
// These are the reason the module works off an allowlist instead of a pattern.

test('leaves a genuine model code alone', () => {
  const sonoff = '(T2US2C) SONOFF 2 LEVER (2 GANG) TOUCH WHT - WI-FI SWITCH RF/2.4GHZ (GOOGLE)(NON-DIM)'
  assert.equal(stripSupplierTags(sonoff), sonoff)
  assert.equal(hasSupplierTag(sonoff), false)
})

test('leaves a supplier part number alone, in either bracket style', () => {
  const parens = 'CHINT 16A 4P CIRCUIT BREAKER C-CURVE 6KA (480207)'
  const square = 'CHINT MANUAL MOTOR STARTER [599653] 2.5-4.0 AMP'
  assert.equal(stripSupplierTags(parens), parens)
  assert.equal(stripSupplierTags(square), square)
})

test('leaves compatibility and unit-of-sale notes alone', () => {
  // 30 rows carry [for NXC …]; 7 carry [PER SOCKET]. Both are real product
  // information a fitter needs, and both look exactly like a status tag.
  const nxc = 'CHINT THERMAL OVERLOAD 5.5-8A 3KW [for NXC MINI 06M.09M,12M range] (837102)'
  const socket = 'RUWAG HARDEN 19MM 1/2" HEXAGON SOCKET [PER SOCKET]'
  assert.equal(stripSupplierTags(nxc), nxc)
  assert.equal(stripSupplierTags(socket), socket)
})

test('"[NEW GEN]" is not eaten by the "[NEW]" rule', () => {
  // The whole bracketed group is looked up as one key, so "NEW GEN" can never
  // be read as "NEW" plus leftovers. This is the single most dangerous
  // collision in the tag table.
  const newGen = '[NEW GEN] VOLTA BATT 51.2V 100AH LI-ION LiFePO4 5.12KWH WALL/FLOOR MOUNT 480*600*150MM 58KG 1C 10YEAR/6000 CYCLES'
  const oldGen = '[OLD GEN] VOLTA BATT 51.2V 100AH LI-ION LiFePO4 5.12KWH WALL/FLOOR MOUNT 480*600*150MM 58KG 1C 10YEAR/6000 CYCLES'
  assert.equal(stripSupplierTags(newGen), newGen)
  assert.equal(stripSupplierTags(oldGen), oldGen)
  assert.equal(hasSupplierTag(newGen), false)
})

test('the three Volta rows stay distinguishable after a strip', () => {
  // VOLTA-STAGE1-NEWGEN and VOLTA-STAGE1-OG differ by their generation marker
  // and nothing else. If a future edit reclassifies NEW GEN/OLD GEN as noise,
  // these two descriptions collapse into one and this test is the alarm.
  const rows = [
    'Volta 5.12kWh LiFePO₄ Battery - 51.2VDC 100Ah Wall/Floor Mount [OLD GEN]',
    '[NEW GEN] VOLTA BATT 51.2V 100AH LI-ION LiFePO4 5.12KWH WALL/FLOOR MOUNT 480*600*150MM 58KG 1C 10YEAR/6000 CYCLES',
    '[OLD GEN] VOLTA BATT 51.2V 100AH LI-ION LiFePO4 5.12KWH WALL/FLOOR MOUNT 480*600*150MM 58KG 1C 10YEAR/6000 CYCLES',
  ].map((r) => stripSupplierTags(r))
  assert.equal(new Set(rows).size, 3, 'stripping made two Volta batteries indistinguishable')
})

test('a title-case bracketed word is our own product name, not a supplier tag', () => {
  // All 25 "[NEW]" rows are supplier = 'Key Electric' and shouted. All three
  // "(New)" rows are supplier = null — names typed here. In the Synergy one the
  // qualifier sits mid-name, so dropping it renames the product outright.
  for (const raw of [
    'SolarEdge Synergy (New) Unit with RSD 33.3kW',
    'SolarEdge Smart Energy Hot Water Controller 3kW ( New )',
    'SolarEdge Home Hot Water Controller - 5 kW (New)',
  ]) {
    assert.equal(stripSupplierTags(raw), raw)
    assert.equal(hasSupplierTag(raw), false)
  }
  assert.equal(lookupTag('New'), null)
  assert.equal(lookupTag('NEW')?.kind, 'drop')
})

test('an unrecognised bracketed prefix is left for a human to decide', () => {
  // The MAC-AFRIC "(A)" / "{A}" / "{D}" prefixes are not in TAGS, so they
  // survive untouched rather than being guessed at.
  for (const raw of [
    '(A)20V 4A LI-ION BATTERY MAC AFRICA',
    '{A}18V 4A LI-ION BATTERY MAC-AFRIC',
    '{D}18V-20V BATTERY REFORMER FOR S RANGE',
  ]) {
    assert.equal(stripSupplierTags(raw), raw)
    assert.equal(hasSupplierTag(raw), false)
  }
})

// ─── Signals that must not be lost ──────────────────────────────────────────

test('[TEMP OUT OF STOCK] becomes a flag rather than a deletion', () => {
  const raw = '[TEMP OUT OF STOCK] ESENER INVERTER 5.2KW PRO 48VDC-230VAC PURE SINE WAVE+WIFI 1xMPPT 120-430VDC 482x290x113MM 10KG'
  assert.deepEqual(parseSupplierTags(raw), {
    description:
      'ESENER INVERTER 5.2KW PRO 48VDC-230VAC PURE SINE WAVE+WIFI 1xMPPT 120-430VDC 482x290x113MM 10KG',
    temporarilyOutOfStock: true,
    notes: [],
  })
})

test('the duplicate-code warning moves to notes instead of vanishing', () => {
  const raw = '(DO NOT USE - DUPLICATE CODE) CABLE TRAY 114MM H/DUTY STRAIGHT 3M'
  const parsed = parseSupplierTags(raw)
  assert.equal(parsed.description, 'CABLE TRAY 114MM H/DUTY STRAIGHT 3M')
  assert.equal(parsed.temporarilyOutOfStock, false)
  assert.equal(parsed.notes.length, 1)
  assert.match(parsed.notes[0], /duplicate code/i)
})

test('parseSupplierTags leaves an ordinary description and its flags alone', () => {
  const plain = 'CHINT 32A 3P CIRCUIT BREAKER C-CURVE 6KA (181535)'
  assert.deepEqual(parseSupplierTags(plain), {
    description: plain,
    temporarilyOutOfStock: false,
    notes: [],
  })
  assert.deepEqual(parseSupplierTags(null), {
    description: null,
    temporarilyOutOfStock: false,
    notes: [],
  })
})

// ─── Mechanics ──────────────────────────────────────────────────────────────

test('bracket openers and closers may mismatch, as they do in the source data', () => {
  // "{EOL]", "{NO COIL)" and "{A}" all appear in the live catalog.
  assert.equal(stripSupplierTags('{NEW] CHINT CONTACTOR 9A'), 'CHINT CONTACTOR 9A')
  assert.equal(stripSupplierTags('(UNI} BOOTLACE FERRULE'), 'BOOTLACE FERRULE')
})

test('text with no tag comes back byte-identical, stray whitespace and all', () => {
  // The bulk migration keys off "did this change?", so a tag-free row must be a
  // true no-op. Collapsing whitespace unconditionally made 257 untagged rows
  // "change" — a 50-row cleanup that reported 307. These fixtures are real rows
  // that were being rewritten for nothing.
  for (const raw of [
    'SCHNEIDER TELE CONTACTOR  38A 3P AC3 18.5KW 400VAC COIL',
    'VETI 1 -  MEGA-CLUSTER FIXING FRAME (3 X 4X4 SIDE BY SIDE) 370mm x 120mm',
    'ARTEOR 10A 2W 2M  SQ  ALU',
    '  leading and trailing space  ',
  ]) {
    assert.equal(stripSupplierTags(raw), raw)
    assert.equal(parseSupplierTags(raw).description, raw)
  }
})

test('a row that does carry a tag gets its spacing tidied too', () => {
  assert.equal(
    stripSupplierTags('[NEW] CHINT 25A 3P CIRCUIT BREAKER D-CURVE  6KA (480248)'),
    'CHINT 25A 3P CIRCUIT BREAKER D-CURVE 6KA (480248)',
  )
})

test('a tag word without brackets is not a tag', () => {
  // "NEW" and "ECO" are ordinary words in a product name.
  for (const raw of ['NEW GENERATION LED FLOODLIGHT 50W', 'ECONO CABLE TIE 200MM', 'ECO FRIENDLY LAMP']) {
    assert.equal(stripSupplierTags(raw), raw)
    assert.equal(hasSupplierTag(raw), false)
  }
})

test('the regex is stateless across calls (a global flag would skip every other call)', () => {
  const raw = '[NEW] CHINT CONTACTOR 9A'
  assert.equal(hasSupplierTag(raw), true)
  assert.equal(hasSupplierTag(raw), true)
  assert.equal(stripSupplierTags(raw), 'CHINT CONTACTOR 9A')
  assert.equal(stripSupplierTags(raw), 'CHINT CONTACTOR 9A')
})

test('two adjacent groups are read separately, not as one', () => {
  // "(GOOGLE)(NON-DIM)" — the inner text excludes brackets so a match cannot
  // run across the boundary and mistake the pair for one unknown tag.
  assert.equal(lookupTag('GOOGLE'), null)
  assert.equal(stripSupplierTags('[NEW] SONOFF SWITCH (GOOGLE)(NON-DIM)'), 'SONOFF SWITCH (GOOGLE)(NON-DIM)')
})

test('an unclosed bracket cannot swallow the line', () => {
  const raw = '[NEW CHINT 16A 2P CIRCUIT BREAKER C-CURVE 6KA'
  assert.equal(stripSupplierTags(raw), raw)
})

test('null and empty pass straight through', () => {
  assert.equal(stripSupplierTags(null), null)
  assert.equal(stripSupplierTags(undefined), undefined)
  assert.equal(stripSupplierTags(''), '')
  assert.equal(hasSupplierTag(null), false)
})

test('scrubs a whole rendered document, both tag families at once', () => {
  const html =
    '<td>[NEW] CHINT 16A 2P CB</td><td>2</td>' +
    '<td>[EOL] HAGER 50A 3P MCB</td>' +
    '<td>AUS LED FITTING [PROMO WHILE STOCKS LAST]</td>' +
    '<td>[NEW GEN] VOLTA BATT 5.12KWH</td>'
  // Note the space left in the fourth cell. A tag removed at the end of a cell
  // leaves the space that preceded it, exactly as the shipped EOL scrub does.
  // HTML collapses it, so it renders identically — and eating the leading space
  // instead would glue words together mid-description ("2X12(DB-HT24W)"), which
  // is a defect you can actually see. The harmless one is the better trade.
  assert.equal(
    scrubSupplierMarkup(html),
    '<td>CHINT 16A 2P CB</td><td>2</td>' +
      '<td>HAGER 50A 3P MCB</td>' +
      '<td>AUS LED FITTING </td>' +
      '<td>[NEW GEN] VOLTA BATT 5.12KWH</td>',
  )
})

test('a tag removed mid-string does not glue its neighbours together', () => {
  assert.equal(
    scrubSupplierMarkup('<td>TOSUN DB 24 WAY IP65 2X12 [UNI] (DB-HT24W)</td>'),
    '<td>TOSUN DB 24 WAY IP65 2X12 (DB-HT24W)</td>',
  )
})

test('every tag in the table declares why it was classified that way', () => {
  // The `because` text is the record of the decision — a tag added without one
  // is a tag nobody can review later.
  for (const [key, rule] of Object.entries(TAGS)) {
    assert.ok(rule.because.length > 20, `${key} has no reasoning`)
    assert.ok(['drop', 'stock', 'note', 'keep'].includes(rule.kind), `${key} has a bad kind`)
    if (rule.kind === 'note') assert.ok(rule.note, `${key} is a note tag with no note text`)
    assert.equal(key, key.toUpperCase(), `${key} must be stored uppercase to be found`)
  }
})
