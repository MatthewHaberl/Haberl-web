import test from 'node:test'
import assert from 'node:assert/strict'
import { hasEolMarker, stripEolMarker, parseEolDescription } from '../eol'

// Every bracket variant below was taken from the live Key Electric import.
const REAL_MARKERS: [string, string][] = [
  ['[EOL] CHINT 16A 2P CIRCUIT BREAKER C-CURVE 6KA (181519)', 'CHINT 16A 2P CIRCUIT BREAKER C-CURVE 6KA (181519)'],
  ['(EOL) CHINT ISOLATOR 4P 63A DIN RAIL', 'CHINT ISOLATOR 4P 63A DIN RAIL'],
  ['{EOL] TOMZN 63A 2P PV MCB', 'TOMZN 63A 2P PV MCB'],
  ['[EOL DEYE HYBRID INVERTER 8KW', 'DEYE HYBRID INVERTER 8KW'],
  ['PROMO - [EOL] KING FUSE DISCONNECT 3P', 'PROMO - KING FUSE DISCONNECT 3P'],
]

test('strips every EOL marker the price lists actually use', () => {
  for (const [raw, clean] of REAL_MARKERS) {
    assert.equal(stripEolMarker(raw), clean)
    assert.equal(hasEolMarker(raw), true)
  }
})

test('leaves an ordinary description alone', () => {
  const plain = 'CHINT 32A 3P CIRCUIT BREAKER C-CURVE 6KA (181535)'
  assert.equal(stripEolMarker(plain), plain)
  assert.equal(hasEolMarker(plain), false)
})

test('a bare "eol" inside a word is not a marker', () => {
  // No brackets, so nothing to strip — the marker is a bracketed prefix, not the letters.
  assert.equal(hasEolMarker('NEOLITE CABLE GLAND'), false)
  assert.equal(stripEolMarker('NEOLITE CABLE GLAND'), 'NEOLITE CABLE GLAND')
})

test('the regex is stateless across calls (global flag would skip every other match)', () => {
  const raw = '[EOL] CHINT CONTACTOR 9A'
  assert.equal(hasEolMarker(raw), true)
  assert.equal(hasEolMarker(raw), true)
  assert.equal(hasEolMarker(raw), true)
})

test('scrubs a marker out of a whole rendered document, not just one field', () => {
  const html = '<td>[EOL] CHINT 16A 2P CB</td><td>2</td><td>(EOL) HAGER 50A 3P MCB</td>'
  assert.equal(
    stripEolMarker(html),
    '<td>CHINT 16A 2P CB</td><td>2</td><td>HAGER 50A 3P MCB</td>',
  )
})

test('null and empty pass straight through', () => {
  assert.equal(stripEolMarker(null), null)
  assert.equal(stripEolMarker(undefined), undefined)
  assert.equal(stripEolMarker(''), '')
  assert.equal(hasEolMarker(null), false)
})

test('parseEolDescription splits the text from the status', () => {
  assert.deepEqual(parseEolDescription('[EOL] HAGER 50A 3P MCB 6KA C-CURVE'), {
    description: 'HAGER 50A 3P MCB 6KA C-CURVE',
    endOfLife: true,
  })
  assert.deepEqual(parseEolDescription('HAGER 50A 3P MCB 6KA C-CURVE'), {
    description: 'HAGER 50A 3P MCB 6KA C-CURVE',
    endOfLife: false,
  })
  assert.deepEqual(parseEolDescription(null), { description: null, endOfLife: false })
})
