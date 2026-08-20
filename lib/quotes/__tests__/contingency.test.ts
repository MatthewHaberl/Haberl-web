import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BomLine, DesignBom } from '@/lib/solar/design-bom'
import {
  applyContingency, computeContingency, contingencyBases, emptyContingency,
  labourSellR, materialsSellR, parseContingency, type QuoteContingency,
} from '../contingency'
import { computeScopeDeposit } from '../scope-bom'
import { computeDeposit } from '@/lib/solar/design-quote'

/**
 * A contingency is money ADDED to a quote, which makes it the one thing on the
 * document that can quietly cost a customer more than the work does. Five
 * properties carry the feature:
 *   it can never be negative (that would be a discount typed into the wrong box);
 *   a percentage of materials must not be a percentage of labour;
 *   rounding takes the TOTAL to the next figure, not the allowance;
 *   it is never part of the deposit, in either engine;
 *   and hidden means folded into labour, never dropped from the total.
 */

function line(over: Partial<BomLine> = {}): BomLine {
  return {
    section: 'Materials', catalogId: 'cat-1', sku: 'SKU', description: 'Part',
    qty: 1, unitCostR: 100, unitSellR: 115, lineCostR: 100, lineSellR: 115,
    priced: true, status: 'ok', ...over,
  }
}

/** A BOM with R10 000 of materials and R5 000 of labour. */
function bom(lines?: BomLine[]): DesignBom {
  const all = lines ?? [
    line({ section: 'Panels', lineSellR: 10_000, unitSellR: 10_000, lineCostR: 8000, unitCostR: 8000 }),
    line({
      section: 'Labour', catalogId: 'labour:Install', sku: '—', description: 'Install',
      lineSellR: 5000, unitSellR: 5000, lineCostR: 5000, unitCostR: 5000,
    }),
  ]
  const names = [...new Set(all.map((l) => l.section))]
  const sections = names.map((name) => {
    const own = all.filter((l) => l.section === name && !l.optional)
    return {
      name,
      lines: all.filter((l) => l.section === name),
      costR: own.reduce((t, l) => t + l.lineCostR, 0),
      sellR: own.reduce((t, l) => t + l.lineSellR, 0),
      needsPricing: 0,
    }
  })
  return {
    sections,
    totalCostR: sections.reduce((t, s) => t + s.costR, 0),
    totalSellR: sections.reduce((t, s) => t + s.sellR, 0),
    missing: 0,
    needsPricing: 0,
  }
}

function contingency(over: Partial<QuoteContingency> = {}): QuoteContingency {
  return { ...emptyContingency(), enabled: true, ...over }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

test('a quote with no contingency parses to none, from every empty shape', () => {
  for (const raw of [null, undefined, {}, '{}', 'not json', [], 42]) {
    assert.equal(parseContingency(raw).enabled, false, `raw: ${JSON.stringify(raw)}`)
  }
})

test('every number is clamped: no negative allowance, no percentage above 100', () => {
  const c = parseContingency({
    enabled: true, basis: 'materials', percent: -5, amountR: -900, roundToR: -100,
  })
  assert.equal(c.percent, 0)
  assert.equal(c.amountR, 0)
  assert.equal(c.roundToR, 0)

  // A fat-fingered "500" in a percent box must not sextuple the quote.
  assert.equal(parseContingency({ enabled: true, percent: 500 }).percent, 100)
})

test('an unrecognised basis falls back to materials rather than throwing', () => {
  assert.equal(parseContingency({ enabled: true, basis: 'moon' }).basis, 'materials')
})

test('a blank label falls back, and visibility defaults to shown', () => {
  const c = parseContingency({ enabled: true, label: '   ' })
  assert.equal(c.label, 'Contingency allowance')
  // Absent `show` must read as VISIBLE: money folded into labour because a
  // field was missing is money nobody chose to hide.
  assert.equal(c.show, true)
  assert.equal(parseContingency({ enabled: true, show: false }).show, false)
})

// ── The bases ────────────────────────────────────────────────────────────────

test('labour is not materials, however the engine marked it', () => {
  // Solar marks its labour with a synthetic `labour:` id and no kind; the scope
  // builder stamps kind:'labour'/'fee'. Both must stay out of the materials base.
  const b = bom([
    line({ section: 'Panels', lineSellR: 10_000 }),
    line({ section: 'Labour', catalogId: 'labour:Install', lineSellR: 3000 }),
    line({ section: 'Labour', catalogId: 'scope:x', kind: 'labour', lineSellR: 1500 }),
    line({ section: 'Compliance', catalogId: 'scope:y', kind: 'fee', lineSellR: 500 }),
  ])
  assert.equal(materialsSellR(b), 10_000)
  assert.equal(labourSellR(b), 5000)
})

test('optional extras are outside the base — the customer may never buy them', () => {
  const b = bom([
    line({ section: 'Panels', lineSellR: 10_000 }),
    line({ section: 'Extras', lineSellR: 4000, optional: true }),
  ])
  assert.equal(materialsSellR(b), 10_000)
})

// ── The arithmetic ───────────────────────────────────────────────────────────

test('5% of materials is 5% of the materials, not of the quote', () => {
  const r = computeContingency(bom(), contingency({ basis: 'materials', percent: 5 }))
  assert.equal(r.baseR, 10_000)
  assert.equal(r.amountR, 500)
  assert.equal(r.afterR, 15_500)
})

test('a fixed allowance ignores the percentage box entirely', () => {
  const r = computeContingency(bom(), contingency({ basis: 'fixed', amountR: 2500, percent: 90 }))
  assert.equal(r.amountR, 2500)
  assert.equal(r.afterR, 17_500)
})

test('rounding takes the TOTAL up to the next step, allowance included', () => {
  const b = bom([line({ section: 'Panels', lineSellR: 47_312.4 })])
  const r = computeContingency(b, contingency({ basis: 'none', roundToR: 500 }))
  assert.equal(r.uplift, 0)
  assert.equal(r.rounding, 187.6)
  assert.equal(r.afterR, 47_500)
})

test('the allowance is applied first, then the rounding on top of the result', () => {
  // 10 000 materials + 5 000 labour = 15 000; +5% of materials = 15 500;
  // rounded up to the next 1 000 = 16 000.
  const r = computeContingency(bom(), contingency({ basis: 'materials', percent: 5, roundToR: 1000 }))
  assert.equal(r.uplift, 500)
  assert.equal(r.rounding, 500)
  assert.equal(r.afterR, 16_000)
})

test('a total already on the step is left alone — no free extra step', () => {
  const r = computeContingency(bom(), contingency({ basis: 'none', roundToR: 500 }))
  assert.equal(r.rounding, 0)
  assert.equal(r.afterR, 15_000)
})

test('disabled adds nothing, whatever is typed in the boxes', () => {
  const r = computeContingency(bom(), contingency({ enabled: false, basis: 'total', percent: 50, roundToR: 1000 }))
  assert.equal(r.amountR, 0)
  assert.equal(r.afterR, 15_000)
})

// ── Applying it to the BOM ───────────────────────────────────────────────────

test('shown: its own section, priced, carrying no cost', () => {
  const { bom: out, placement } = applyContingency(bom(), contingency({ basis: 'materials', percent: 5 }))
  assert.equal(placement, 'line')
  const section = out.sections.find((s) => s.name === 'Contingency')
  assert.ok(section)
  assert.equal(section.sellR, 500)
  // No cost: the money has not been spent on anything yet, so internally it
  // reads as margin earmarked for a problem that may not turn up. Costing it at
  // sell would show a job at break-even on money still in the bank.
  assert.equal(section.costR, 0)
  assert.equal(out.totalSellR, 15_500)
  assert.equal(out.totalCostR, bom().totalCostR)
})

test('hidden: folded into the labour line, and the total is identical', () => {
  const shown = applyContingency(bom(), contingency({ basis: 'materials', percent: 5, show: true }))
  const hidden = applyContingency(bom(), contingency({ basis: 'materials', percent: 5, show: false }))
  assert.equal(hidden.placement, 'labour')
  assert.equal(hidden.bom.totalSellR, shown.bom.totalSellR)
  assert.equal(hidden.bom.sections.some((s) => s.name === 'Contingency'), false)
  const labour = hidden.bom.sections.find((s) => s.name === 'Labour')!
  assert.equal(labour.sellR, 5500)
  // The line itself has to move with the subtotal or the detailed document
  // prints rows that don't add up to their own section.
  assert.equal(labour.lines[0].lineSellR, 5500)
  assert.equal(labour.lines[0].unitSellR, 5500)
})

test('hidden with nothing to hide behind prints as its own line, and says so', () => {
  const materialsOnly = bom([line({ section: 'Panels', lineSellR: 10_000 })])
  const out = applyContingency(materialsOnly, contingency({ basis: 'materials', percent: 5, show: false }))
  assert.equal(out.placement, 'line')
  assert.equal(out.foldFailed, true)
  assert.equal(out.bom.totalSellR, 10_500)
  assert.equal(contingencyBases(materialsOnly).hasLabour, false)
})

test('a per-hour labour line is never the fold target — it would multiply', () => {
  const hourly = bom([
    line({ section: 'Panels', lineSellR: 10_000 }),
    line({
      section: 'Labour', catalogId: 'scope:hrs', kind: 'labour',
      qty: 8, unitSellR: 750, lineSellR: 6000, unitCostR: 750, lineCostR: 6000,
    }),
  ])
  const out = applyContingency(hourly, contingency({ basis: 'materials', percent: 5, show: false }))
  assert.equal(out.placement, 'line')
  assert.equal(out.bom.totalSellR, 16_500)
})

test('nothing is added when the settings work out to zero', () => {
  const base = bom()
  const out = applyContingency(base, contingency({ basis: 'materials', percent: 0 }))
  assert.equal(out.placement, 'none')
  assert.equal(out.bom, base)
})

// ── It never joins the deposit ───────────────────────────────────────────────

test('neither engine bills a deposit on the contingency', () => {
  const scopeBom = applyContingency(
    bom([
      line({ section: 'Materials', kind: 'material', lineSellR: 10_000 }),
      line({ section: 'Labour', catalogId: 'labour:Install', kind: 'labour', lineSellR: 5000 }),
    ]),
    contingency({ basis: 'materials', percent: 10 }),
  ).bom
  // Scope: kind 'fee' is payable on completion, so the deposit is the materials
  // alone — asking for a deposit against money that may never be spent is the
  // fastest way to have to hand it back.
  assert.equal(computeScopeDeposit(scopeBom).totalR, 10_000)

  const solarBom = applyContingency(
    bom([line({ section: 'Panels', lineSellR: 10_000 })]),
    contingency({ basis: 'materials', percent: 10 }),
  ).bom
  // Solar: the deposit is the starred equipment sections, and 'Contingency'
  // is not one of them.
  assert.equal(computeDeposit(solarBom).totalR, 10_000)
})

// ── The bases stamped into the document ──────────────────────────────────────

test('the bases are the figures BEFORE the allowance, so a re-price cannot compound', () => {
  const base = bom()
  const first = applyContingency(base, contingency({ basis: 'materials', percent: 5 }))
  // What gets stamped is read off the BOM the engine produced, not the one this
  // returns — re-pricing from the credited/uplifted total is how a 5% allowance
  // silently becomes 10%.
  const stamped = contingencyBases(base)
  assert.equal(stamped.totalR, 15_000)
  assert.equal(stamped.materialsR, 10_000)
  assert.equal(first.bom.totalSellR, 15_500)

  const second = computeContingency(first.bom, contingency({ basis: 'materials', percent: 5 }))
  assert.notEqual(second.beforeR, stamped.totalR, 'guards the reason bases are stamped, not recomputed')
})
