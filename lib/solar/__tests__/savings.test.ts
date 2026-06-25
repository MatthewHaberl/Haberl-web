import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  projectSavings,
  buildBalanceInput,
  buildSavingsSummary,
} from '../savings'

test('projectSavings: simple payback is cost ÷ annual saving (flat)', () => {
  const p = projectSavings(10_000, 100_000)
  assert.equal(p.paybackYears, 10)
  // 20 flat years of R10k.
  assert.equal(p.cumulativeFlatR, 200_000)
})

test('projectSavings: escalation makes escalated payback faster than flat, and lifts cumulative', () => {
  const p = projectSavings(10_000, 100_000)
  assert.ok(p.paybackYearsEscalated !== null)
  assert.ok((p.paybackYearsEscalated as number) < 10, 'escalated payback should beat flat 10y')
  assert.ok((p.paybackYearsEscalated as number) > 0)
  assert.ok(p.cumulativeEscalatedR > p.cumulativeFlatR, 'escalation raises the 20y total')
  // ROI is positive once 20y savings clear the cost.
  assert.ok((p.roiPct as number) > 0)
})

test('projectSavings: zero saving yields no payback and negative NPV', () => {
  const p = projectSavings(0, 100_000)
  assert.equal(p.paybackYears, null)
  assert.equal(p.paybackYearsEscalated, null)
  assert.ok(p.npvR < 0)
})

test('buildBalanceInput: monthly arrays preserve the annual totals', () => {
  const input = buildBalanceInput(12_000, 9_600, 10, { tariffRate: 2.75 })
  const genSum = input.generationMonthlyKwh.reduce((s, v) => s + v, 0)
  const conSum = input.consumptionMonthlyKwh.reduce((s, v) => s + v, 0)
  assert.ok(Math.abs(genSum - 12_000) < 1)
  assert.ok(Math.abs(conSum - 9_600) < 1)
  assert.equal(input.generationMonthlyKwh.length, 12)
  assert.ok(input.battery && input.battery.capacityKwh === 10)
})

test('buildBalanceInput: no battery passes null', () => {
  const input = buildBalanceInput(12_000, 9_600, 0, { tariffRate: 2.75 })
  assert.equal(input.battery, null)
})

test('buildSavingsSummary: produces a coherent saving and projection', () => {
  const s = buildSavingsSummary(12_000, 9_600, 10, 150_000, { tariffRate: 2.75 })
  assert.ok(s.annualSavingR > 0)
  assert.equal(s.balance.months.length, 12)
  // The saving can't exceed the whole bill.
  assert.ok(s.annualSavingR <= s.balance.annual.billBeforeR + 1)
  assert.equal(s.financial.paybackYears, 150_000 / s.annualSavingR)
})
