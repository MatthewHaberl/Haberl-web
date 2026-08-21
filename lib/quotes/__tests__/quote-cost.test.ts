import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BomLine, DesignBom } from '@/lib/solar/design-bom'
import { bomCost, costFrom, exVatR } from '../quote-cost'
import { emptyScope, newCrewLine, newScopeLine, scopeTotals } from '../scope'
import { scopeToBom } from '../scope-bom'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/**
 * Cost ex VAT. The whole feature is one rule and one trap:
 *   rule  — a bought-in part's cost is the supplier's ex-VAT price × 1.15,
 *           so ex VAT is that cost ÷ 1.15;
 *   trap  — wages, own time and the CoC are quoted cost = sell and never
 *           carried VAT, so dividing the WHOLE cost total by 1.15 invents a
 *           VAT refund on labour. Every test below is really that trap.
 */

const CATALOG = new Map<string, EquipmentCatalogItem>()

function line(over: Partial<BomLine>): BomLine {
  return {
    section: 'Parts', catalogId: 'cat-1', sku: 'X', description: 'x', qty: 1,
    unitCostR: 0, unitSellR: 0, lineCostR: 0, lineSellR: 0, priced: true, status: 'ok',
    ...over,
  }
}

function bomOf(...lines: BomLine[]): DesignBom {
  return {
    sections: [{
      name: 'All', lines,
      costR: lines.reduce((t, l) => t + l.lineCostR, 0),
      sellR: lines.reduce((t, l) => t + l.lineSellR, 0),
      needsPricing: 0,
    }],
    totalCostR: lines.reduce((t, l) => t + l.lineCostR, 0),
    totalSellR: lines.reduce((t, l) => t + l.lineSellR, 0),
    missing: 0,
    needsPricing: 0,
  }
}

// ── The arithmetic ───────────────────────────────────────────────────────────

test('ex VAT is the landed cost with the 15% taken back out', () => {
  assert.equal(exVatR(1150), 1000)
  assert.equal(exVatR(0), 0)
  // A negative cost is nonsense, not a credit — it must never inflate ex VAT.
  assert.equal(exVatR(-500), 0)
})

test('the VAT reported is exactly what separates the two figures', () => {
  const c = costFrom(1150, 0)
  assert.equal(c.landedR, 1150)
  assert.equal(c.exVatR, 1000)
  assert.equal(c.vatR, 150)
  assert.equal(c.landedR - c.vatR, c.exVatR)
})

// ── The trap ─────────────────────────────────────────────────────────────────

test('labour is identical in both figures — no VAT is refunded on wages', () => {
  const c = costFrom(1150, 2000)
  assert.equal(c.landedR, 3150)
  assert.equal(c.exVatR, 3000, 'only the R1150 of parts sheds VAT')
  assert.equal(c.labourR, 2000)
  assert.equal(c.vatR, 150)
})

test('a solar BOM sheds VAT on parts and leaves the Labour section alone', () => {
  const bom = bomOf(
    line({ catalogId: 'cat-1', lineCostR: 1150, lineSellR: 1322.5 }),
    line({ section: 'Labour', catalogId: 'labour:Panel install', lineCostR: 4000, lineSellR: 4000 }),
  )
  const c = bomCost(bom)
  assert.equal(c.landedR, 5150)
  assert.equal(c.materialsExVatR, 1000)
  assert.equal(c.exVatR, 5000)
})

test('a scope BOM reads the same, off kind rather than the section name', () => {
  const bom = bomOf(
    line({ kind: 'material', lineCostR: 2300, lineSellR: 2645 }),
    line({ kind: 'labour', catalogId: 'labour:x', lineCostR: 1000, lineSellR: 1500 }),
    line({ kind: 'fee', catalogId: 'labour:coc', lineCostR: 1500, lineSellR: 1500 }),
  )
  const c = bomCost(bom)
  assert.equal(c.exVatR, 2000 + 1000 + 1500)
})

test('optional extras are out of the cost, as they are out of the total', () => {
  const c = bomCost(bomOf(
    line({ lineCostR: 1150, lineSellR: 1322.5 }),
    line({ lineCostR: 11500, lineSellR: 13225, optional: true }),
  ))
  assert.equal(c.landedR, 1150)
  assert.equal(c.exVatR, 1000)
})

// ── Scope preview agrees with the BOM it generates ───────────────────────────

function scopeWithParts() {
  const scope = emptyScope({ sections: ['Parts'] })
  const part = newScopeLine('Parts', 'material')
  part.description = 'Isolator'
  part.qty = 2
  part.unitCostR = 1150
  part.unitSellR = 1322.5
  scope.lines.push(part)
  scope.labour.mode = 'fixed'
  scope.labour.fixedR = 3000
  scope.coc = { included: true, feeR: 1500 }
  return scope
}

test('the builder preview matches the BOM the quote generates from', () => {
  const scope = scopeWithParts()
  const totals = scopeTotals(scope)
  const bom = bomCost(scopeToBom(scope, CATALOG, 1.15))
  assert.equal(totals.costR, bom.landedR)
  assert.equal(totals.costExVatR, bom.exVatR)
})

test('preview cost: parts shed VAT, the fixed labour and the CoC do not', () => {
  const totals = scopeTotals(scopeWithParts())
  assert.equal(totals.costR, 2300 + 3000 + 1500)
  assert.equal(totals.costExVatR, 2000 + 3000 + 1500)
})

test('crew wages are cost, and they carry no VAT', () => {
  const scope = emptyScope()
  scope.labour.mode = 'crew'
  scope.labour.crew = [newCrewLine({ name: 'Sipho', qty: 8, unit: 'hr', costR: 150 })]
  const totals = scopeTotals(scope)
  assert.ok(totals.costR > 0, 'wages are a cost')
  assert.equal(totals.costExVatR, totals.costR)
})
