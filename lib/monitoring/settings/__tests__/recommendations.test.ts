import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRecommendations, type RecommendationContext } from '../recommendations'
import { emptySettings } from '../types'

const flat = (v: number) => Array.from({ length: 12 }, () => v)

function baseCtx(over: Partial<RecommendationContext> = {}): RecommendationContext {
  return {
    settings: emptySettings(),
    batteryKwh: 10,
    tariffRate: 3.5,
    feedInRate: 1.2,
    feedInAvailable: false,
    generationMonthlyKwh: flat(700),   // ~8400 kWh/yr
    consumptionMonthlyKwh: flat(600),  // ~7200 kWh/yr
    hasMeasuredData: true,
    ...over,
  }
}

test('baseline always returns a modelled summary', () => {
  const { baseline } = buildRecommendations(baseCtx())
  assert.ok(baseline.annualSavingR > 0, 'should model some saving')
  assert.ok(baseline.selfConsumptionPct >= 0 && baseline.selfConsumptionPct <= 100)
})

test('high reserve floor produces a lower_reserve_floor recommendation with a positive rand delta', () => {
  const ctx = baseCtx({
    settings: { ...emptySettings(), batteryMinSocPct: 40, batteryMaxSocPct: 100, workMode: 'self_use' },
  })
  const { recommendations } = buildRecommendations(ctx)
  const rec = recommendations.find((r) => r.code === 'lower_reserve_floor')
  assert.ok(rec, 'expected lower_reserve_floor')
  assert.ok((rec!.projectedAnnualSavingR ?? 0) > 0, 'expected a positive saving')
  assert.equal(rec!.currentValue, '40%')
  assert.equal(rec!.suggestedValue, '10%')
})

test('exporting with no feed-in tariff flags export_for_free', () => {
  const ctx = baseCtx({
    batteryKwh: null,
    settings: { ...emptySettings(), exportEnabled: true },
    feedInAvailable: false,
    feedInRate: 0,
  })
  const { recommendations } = buildRecommendations(ctx)
  assert.ok(recommendations.some((r) => r.code === 'export_for_free'), 'expected export_for_free')
})

test('feed-in available + wasted solar flags enable_export', () => {
  const ctx = baseCtx({
    batteryKwh: 5,                 // small battery → midday surplus is curtailed
    generationMonthlyKwh: flat(1100),
    consumptionMonthlyKwh: flat(400),
    settings: { ...emptySettings(), exportEnabled: false, batteryMinSocPct: 10, batteryMaxSocPct: 100 },
    feedInAvailable: true,
    feedInRate: 1.2,
  })
  const { recommendations } = buildRecommendations(ctx)
  assert.ok(recommendations.some((r) => r.code === 'enable_export'), 'expected enable_export')
})

test('no battery with heavy import flags an add_battery upgrade', () => {
  const ctx = baseCtx({
    batteryKwh: null,
    generationMonthlyKwh: flat(300),
    consumptionMonthlyKwh: flat(700),
    settings: emptySettings(),
  })
  const { recommendations } = buildRecommendations(ctx)
  const rec = recommendations.find((r) => r.code === 'add_battery')
  assert.ok(rec, 'expected add_battery')
  assert.equal(rec!.category, 'upgrade')
})

test('recommendations are sorted high-severity / high-saving first', () => {
  const ctx = baseCtx({
    settings: { ...emptySettings(), batteryMinSocPct: 50, gridChargeEnabled: false, workMode: 'self_use' },
  })
  const { recommendations } = buildRecommendations(ctx)
  // the info-level grid-charge note must never sort above a money recommendation
  const infoIdx = recommendations.findIndex((r) => r.severity === 'info')
  const oppIdx = recommendations.findIndex((r) => r.severity !== 'info')
  if (infoIdx !== -1 && oppIdx !== -1) assert.ok(oppIdx < infoIdx)
})
