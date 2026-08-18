import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyScope, importScopeAsPackage, newScopeLine, type QuoteScope } from '../scope'
import { summariseQuoteRow } from '../quote-list-summary'

/** What the quotes list is allowed to say about a quote it hasn't opened. */

/**
 * A scope worth `sellR` in materials. Its labour block is left at the built-in
 * hourly default, which always carries the R750 call-out — the same R750 the
 * builder's own totals panel shows, so the expectations below include it.
 */
function scopeWorth(sellR: number, summary = 'Work'): QuoteScope {
  const s = emptyScope({ sections: ['Materials'] })
  s.summary = summary
  s.lines = [{ ...newScopeLine('Materials', 'material'), description: 'Item', qty: 1, unitSellR: sellR }]
  return s
}

const CALLOUT = 750

test('a draft scope quote is priced from its own lines', () => {
  const out = summariseQuoteRow({ status: 'pending', scope: scopeWorth(4000) })
  assert.equal(out.totalR, 4000 + CALLOUT)
  assert.equal(out.draft, true)
  assert.deepEqual(out.packages, [])
})

test('the generated total wins over the draft arithmetic', () => {
  const out = summariseQuoteRow({
    status: 'sent',
    total_amount: 402_686,          // cents, from /generate
    scope: scopeWorth(9999),        // the builder has moved on since
  })
  assert.equal(out.totalR, 4026.86)
  assert.equal(out.draft, false)
})

test('a solar draft falls back to the canvas working total', () => {
  const out = summariseQuoteRow({ status: 'pending', working_total_rands: 148_500 })
  assert.equal(out.totalR, 148_500)
  assert.equal(out.draft, true)
})

test('an untouched scope shows no figure — not the bare call-out default', () => {
  const out = summariseQuoteRow({ status: 'pending', scope: emptyScope({ sections: ['Materials'] }) })
  assert.equal(out.totalR, null)
  assert.equal(out.draft, false)
})

test('unpriced lines are counted, not folded into the total', () => {
  const s = scopeWorth(4000)
  s.lines.push({ ...newScopeLine('Materials', 'material'), description: 'Awaiting supplier', qty: 1 })
  const out = summariseQuoteRow({ status: 'pending', scope: s })
  assert.equal(out.totalR, 4000 + CALLOUT)
  assert.equal(out.needsPricing, 1)
})

test('a combined quote lists each job at its standalone price', () => {
  const { scope } = importScopeAsPackage(scopeWorth(4000, 'Board'), scopeWorth(2500, 'Lights'), {
    label: 'Downlights', existingLabel: 'Board',
  })
  const out = summariseQuoteRow({ status: 'pending', scope })
  assert.equal(out.packages.length, 2)
  assert.deepEqual(out.packages.map((p) => p.name), ['Board', 'Downlights'])
  // Each part carries its own visit — that is what makes the bundle cheaper.
  assert.equal(out.packages[0].ownTotalR, 4000 + CALLOUT)
  assert.equal(out.packages[1].ownTotalR, 2500 + CALLOUT)
  // The option's own figure is the bundled price: one visit, not two.
  assert.equal(out.totalR, 4000 + 2500 + CALLOUT)
})
