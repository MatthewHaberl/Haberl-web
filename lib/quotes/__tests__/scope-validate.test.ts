// Run with: npx tsx --test lib/quotes/__tests__/scope-validate.test.ts
//
// The scope builder autosaves, so nothing validates on the way in — the gate is
// Generate, and validateScope is what it gates on. These tests pin the two
// silent-corruption cases the builder used to allow through:
//
//   a free-text line with no description, which bills the customer for a blank
//   row (the scope quote renders sections, and sectionDetail() drops empty
//   descriptions, so the section reads as a heading with a price)
//
//   a line with no quantity, which scopeToBom skips outright — the line, and
//   sometimes its whole section, disappears and the total is quietly short
//
// plus the warnings that must stay warnings: R0 labour and unpriced lines are
// legal shapes, and blocking them would stop supply-only and to-be-priced work.

import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyScope, newScopeLine, type QuoteScope, type ScopeLine } from '../scope'
import { validateScope, scopeBlockers, scopeBlockerMessage } from '../scope-validate'

function line(extra: Partial<ScopeLine> = {}): ScopeLine {
  return { ...newScopeLine('Distribution board'), description: 'Item', qty: 1, unitSellR: 100, ...extra }
}

/** A scope that is fully valid, so each test can break exactly one thing. */
function goodScope(over: Partial<QuoteScope> = {}): QuoteScope {
  return {
    ...emptyScope({ sections: ['Distribution board'] }),
    summary: 'Replace the DB board.',
    lines: [line()],
    ...over,
  }
}

const ids = (scope: QuoteScope) => validateScope(scope).map((i) => i.id)

test('a complete scope has no blockers', () => {
  assert.equal(scopeBlockers(goodScope()).length, 0)
  assert.equal(scopeBlockerMessage(goodScope()), null)
})

test('a free-text line with no description blocks — it would bill a blank row', () => {
  const scope = goodScope({ lines: [line({ description: '  ' })] })
  const blockers = scopeBlockers(scope)
  assert.equal(blockers.length, 1)
  assert.equal(blockers[0].field, 'description')
  assert.match(blockers[0].message, /blank row/)
})

test('a catalog-backed line needs no description — generate fills it from the catalog', () => {
  const scope = goodScope({ lines: [line({ description: '', catalogId: 'cat-1' })] })
  assert.equal(scopeBlockers(scope).length, 0)
})

test('a line with no quantity blocks — scopeToBom would drop it silently', () => {
  const scope = goodScope({ lines: [line({ qty: 0 })] })
  const blockers = scopeBlockers(scope)
  assert.equal(blockers.length, 1)
  assert.equal(blockers[0].field, 'qty')
  assert.match(blockers[0].message, /dropped from the quote/)
})

test('line issues name the line and anchor to its row', () => {
  const scope = goodScope({ lines: [line({ id: 'abc', description: '60A breaker', qty: 0 })] })
  const [issue] = scopeBlockers(scope)
  assert.equal(issue.lineId, 'abc')
  assert.equal(issue.anchor, 'line:abc')
  assert.match(issue.message, /60A breaker/)
})

test('an unnamed line is identified by its position in its section', () => {
  const scope = goodScope({ lines: [line(), line({ description: '', sku: '' })] })
  assert.match(scopeBlockers(scope)[0].message, /Line 2 in “Distribution board”/)
})

test('an empty scope blocks with nothing to sell and nothing to price', () => {
  const scope = { ...emptyScope({ sections: ['Distribution board'] }), labour: { ...emptyScope().labour, calloutR: 0 } }
  assert.deepEqual(scopeBlockers(scope).map((i) => i.id), ['nothing-billable'])
})

test('a call-out-only job is a real quote, not an empty scope', () => {
  // No lines at all, labour is the whole job — the commonest small quote there is.
  const scope = { ...emptyScope(), summary: 'Investigate a tripping breaker.' }
  assert.equal(scopeBlockers(scope).length, 0)
})

test('unpriced lines warn but never block — "to be priced separately" is a supported shape', () => {
  const scope = goodScope({ lines: [line({ unitSellR: 0 })] })
  assert.equal(scopeBlockers(scope).length, 0)
  assert.ok(ids(scope).includes('unpriced-lines'))
})

test('an unpriced optional extra does not even warn — it is not in the total', () => {
  const scope = goodScope({ lines: [line(), line({ unitSellR: 0, optional: true })] })
  assert.ok(!ids(scope).includes('unpriced-lines'))
})

test('a labour mode left blank warns in that mode’s own words', () => {
  const daily = goodScope({ labour: { ...emptyScope().labour, mode: 'daily', days: 0 } })
  const issue = validateScope(daily).find((i) => i.id === 'labour-zero')
  assert.match(issue!.message, /Day rate is selected but no days/)
  assert.equal(issue!.level, 'warning')

  const fixed = goodScope({ labour: { ...emptyScope().labour, mode: 'fixed', fixedR: 0 } })
  assert.match(validateScope(fixed).find((i) => i.id === 'labour-zero')!.message, /Fixed-price labour is R0/)
})

test('crew members with no hours warn — they bill R0', () => {
  const scope = goodScope({
    labour: {
      ...emptyScope().labour,
      mode: 'crew',
      crew: [
        { id: 'a', staffId: null, name: 'Sipho', qty: 8, unit: 'hr', days: null, costR: 150, markup: 1.6, sellR: null },
        { id: 'b', staffId: null, name: 'Thabo', qty: 0, unit: 'hr', days: null, costR: 150, markup: 1.6, sellR: null },
      ],
    },
  })
  assert.equal(scopeBlockers(scope).length, 0)
  assert.match(validateScope(scope).find((i) => i.id === 'crew-no-qty')!.message, /One crew member/)
})

test('a section with no lines warns — it never reaches the document', () => {
  const scope = goodScope({ sections: ['Distribution board', 'Generator & changeover'] })
  const issue = validateScope(scope).find((i) => i.id === 'section:Generator & changeover')
  assert.equal(issue!.level, 'warning')
  assert.equal(issue!.anchor, 'section:Generator & changeover')
})

test('empty sections stay quiet until the quote has been started', () => {
  // Every scope quote opens with its work type's sections seeded and empty.
  const untouched = { ...emptyScope({ sections: ['Distribution board', 'Accessories'] }) }
  assert.ok(!validateScope(untouched).some((i) => i.id.startsWith('section:')))
})

test('a missing scope of works warns', () => {
  assert.ok(ids(goodScope({ summary: '' })).includes('no-summary'))
})

test('blockers sort ahead of warnings, so the first one is what Generate scrolls to', () => {
  const scope = goodScope({ summary: '', lines: [line({ unitSellR: 0 }), line({ qty: 0 })] })
  const all = validateScope(scope)
  assert.equal(all[0].level, 'blocker')
  const firstWarning = all.findIndex((i) => i.level === 'warning')
  assert.ok(all.slice(firstWarning).every((i) => i.level === 'warning'))
})

test('one blocker speaks for itself; several are summarised', () => {
  const one = goodScope({ lines: [line({ qty: 0 })] })
  assert.match(scopeBlockerMessage(one)!, /^“Item”.*dropped from the quote/)

  const many = goodScope({ lines: [line({ qty: 0 }), line({ description: '' })] })
  assert.match(scopeBlockerMessage(many)!, /can’t be generated yet/)
})
