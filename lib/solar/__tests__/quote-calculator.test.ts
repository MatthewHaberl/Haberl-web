// Run with: npx tsx --test lib/solar/__tests__/quote-calculator.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateQuote,
  getTariffRateForMunicipality,
  verifyPanelString,
  type CalculatorInput,
  type EquipmentCatalogItem,
} from '../quote-calculator'

// Real catalog reference: Sunsynk 16kW 1P (500V max, 150V MPPT min, 3 MPPT, 6
// strings) + Aiko Neostar 500W (Voc 45.02V) — the combination Matthew reviewed.
const sunsynk16k = (extra: Record<string, unknown> = {}): EquipmentCatalogItem => ({
  id: 'inv', category: 'inverter', brand: 'Sunsynk', sku: 'SS-1P-16K-H-LV',
  description: 'Sunsynk 16kW 1P Hybrid', watts_ac: 16000, watts_dc: null, kwh: null,
  phase: 'single', cost_rands: 0, isc_amps: null, voc_volts: null, active: true, sort_order: 0,
  notes: JSON.stringify({
    max_dc_voltage: 500, mppt_min_voltage: 150, mppt_count: 3, max_strings: 6,
    max_isc_per_mppt_a: 44, max_pv_kwp: 20.8, ...extra,
  }),
})
const aiko500 = (): EquipmentCatalogItem => ({
  id: 'pan', category: 'panel', brand: 'Aiko', sku: 'AIKO-C-A500-MAH60MB',
  description: 'Aiko Neostar 2S60 500W', watts_ac: null, watts_dc: 500, kwh: null,
  phase: 'any', cost_rands: 0, isc_amps: 13.5, voc_volts: 45.02, active: true, sort_order: 0, notes: null,
})

const michelleFixture: CalculatorInput = {
  quoteNumber: 'QUO-2026-027',
  customerName: 'Michelle',
  customerPhone: '+27 83 645 5441',
  customerEmail: 'TBC',
  siteAddress: 'TBC',
  municipality: 'City of Johannesburg',
  gridSupply: 'Single Phase',
  storeys: '2',
  monthlyKwh: 900,
  batteryHours: 4,
  essentialLoadKw: 2.5,
  tariffRate: 2.92,
  lockedPanelCount: 14,
  equipment: {
    inverter: {
      id: 'inv-sig-8',
      category: 'inverter',
      brand: 'Sigenergy',
      sku: 'SIG-INV-08K-S',
      description: 'SigenStor 8.0kW SP',
      watts_ac: 8000,
      watts_dc: null,
      kwh: null,
      phase: 'single',
      cost_rands: 27968,
      isc_amps: null,
      voc_volts: null,
      active: true,
      sort_order: 0,
      notes: null,
    },
    battery: {
      id: 'bat-sig-10',
      category: 'battery',
      brand: 'Sigenergy',
      sku: 'SIG-BAT-10K',
      description: 'SigenStor Battery 9.04kWh',
      watts_ac: null,
      watts_dc: null,
      kwh: 9.04,
      phase: 'any',
      cost_rands: 38180,
      isc_amps: null,
      voc_volts: null,
      active: true,
      sort_order: 0,
      notes: null,
    },
    panel: {
      id: 'pan-ja-585',
      category: 'panel',
      brand: 'JA Solar',
      sku: 'JAM72D40-585/MB',
      description: 'JA Solar 585W N-Type Bifacial',
      watts_ac: null,
      watts_dc: 585,
      kwh: null,
      phase: 'any',
      cost_rands: 1446.41,
      isc_amps: null,
      voc_volts: null,
      active: true,
      sort_order: 0,
      notes: null,
    },
  },
}

test('calculator produces a deterministic Michelle quote close to the reference job', () => {
  const quote = calculateQuote(michelleFixture)
  const depositTotal = quote.depositItems.reduce((sum, item) => sum + item.amountRands, 0)
  const labourValue = Number(
    quote.labourCost
      .replace(/[R\s\u00A0]/g, '')
      .replace(/\./g, '')
      .replace(',', '.'),
  )

  assert.equal(Number(quote.panelCount), 14)
  assert.equal(Number(quote.batteryQty), 2)
  // Reference 187,024.24 + R2,000 storey premium (RULE-SZ-04) + 2nd string DC
  // breaker (RULE-STR-01) + string-count MC4 formula (RULE-MC4-01)
  assert.ok(Math.abs(quote.quoteTotalRands - 189485.39) <= 250, `Quote total was ${quote.quoteTotalRands}`)
  assert.equal(Number(quote.depositTotalRands.toFixed(2)), Number(depositTotal.toFixed(2)))
  // Labour = base 8,142.50 + R2,000 two-storey access premium
  assert.equal(labourValue, 10142.5)
  assert.equal(Number(quote.earthingSpikeCount), 6)
  assert.ok(Number(quote.paybackMonths) >= 68 && Number(quote.paybackMonths) <= 76, `Payback months was ${quote.paybackMonths}`)
})

test('SANS compliance checks pass on a standard hybrid BOM', () => {
  const quote = calculateQuote(michelleFixture)
  const checks = quote.complianceChecks ?? []

  assert.ok(checks.length >= 10, `Expected a full check list, got ${checks.length}`)
  const blockers = checks.filter((c) => c.status === 'blocker')
  assert.deepEqual(blockers, [], `Unexpected blockers: ${blockers.map((c) => c.id).join(', ')}`)

  // 14 panels with no inverter voltage spec \u2192 assumed 2 strings \u2192 2 DC breakers
  const dcBreakers = quote.supplierBom!.find((item) => item.sku.startsWith('DC-MCB'))
  assert.equal(dcBreakers?.quantity, 2)

  // Glands itemized so RULE-CON-04 is verifiable
  assert.ok(quote.supplierBom!.some((item) => /gland/i.test(item.description)))
})

test('string physics blocks over-voltage strings and EV BOM carries Type B protection', () => {
  const fixture: CalculatorInput = {
    ...michelleFixture,
    evCharger: 'Yes \u2014 7kW',
    equipment: {
      ...michelleFixture.equipment,
      inverter: {
        ...michelleFixture.equipment.inverter,
        // 500V max input forces short strings; 14 panels at 41.3V Voc in one
        // string of 12 would exceed it cold
        notes: JSON.stringify({ max_dc_voltage: 500, mppt_min: 100, mppts: 3 }),
      },
      panel: { ...michelleFixture.equipment.panel, voc_volts: 41.3, isc_amps: 13.95 },
    },
  }
  const quote = calculateQuote(fixture)
  const checks = quote.complianceChecks ?? []

  const voc = checks.find((c) => c.id === 'string-voc')
  assert.equal(voc?.status, 'pass', voc?.detail)

  // EV protection kit (RULE-EV-01) \u2014 all mandatory items present
  for (const id of ['ev-type-b', 'ev-db', 'ev-spd', 'ev-labels']) {
    const check = checks.find((c) => c.id === id)
    assert.equal(check?.status, 'pass', `${id}: ${check?.detail}`)
  }

  // Armoured EV feed carries SWA compression glands (\u00A76.3.7/\u00A76.13)
  const swa = checks.find((c) => c.id === 'armoured-glands')
  assert.equal(swa?.status, 'pass', swa?.detail)
})

test('measured cable routes replace the scalar estimate in the BOM', () => {
  const fixture: CalculatorInput = {
    ...michelleFixture,
    cableRoutes: {
      dcRunsM: [22.5, 18], // two strings — total 40.5m, worst case 22.5m
      acM: 9.5,
      batteryM: 2,
      earthM: 12,
    },
  }
  const quote = calculateQuote(fixture)
  const bom = quote.supplierBom!

  const dcBlack = bom.find((item) => item.sku === 'CAB-PV-004-BK')
  const dcRed = bom.find((item) => item.sku === 'CAB-PV-004-RD')
  const ac = bom.find((item) => item.sku === 'FPW16.0BLACK')
  const earth = bom.find((item) => item.sku === 'FPW6.0GRN-YELL')

  // DC quantity = sum of runs (ceil), AC/earth from their own measured totals
  assert.equal(dcBlack?.quantity, 41)
  assert.equal(dcRed?.quantity, 41)
  assert.equal(ac?.quantity, 10)
  assert.equal(earth?.quantity, 12)
  assert.ok(dcBlack?.description.includes('(measured)'))

  // No "estimate" nudge when routes are measured
  assert.ok(!quote.calculationWarnings?.some((w) => w.includes('estimates')),
    `Unexpected estimate warning: ${quote.calculationWarnings?.join(' | ')}`)

  // Unmeasured fallback uses the 15m default + nudge warning
  const fallback = calculateQuote(michelleFixture)
  const fallbackDc = fallback.supplierBom!.find((item) => item.sku === 'CAB-PV-004-BK')
  assert.equal(fallbackDc?.quantity, 15)
  assert.ok(fallback.calculationWarnings?.some((w) => w.includes('estimates')))
})

test('pricing settings override markup, COC, labour and storey premiums', () => {
  const fixture: CalculatorInput = {
    ...michelleFixture,
    pricing: {
      markup: 1.25,
      cocRands: 2000,
      labourInverterPerW: 0.3,
      labourPanelPerW: 0.8,
      storeyPremium2: 3000,
      storeyPremium3: 7000,
    },
  }
  const quote = calculateQuote(fixture)
  const bom = quote.supplierBom!

  // Equipment sell flexes with the configured markup (cost × 1.25)
  const panel = bom.find((item) => item.sku === 'JAM72D40-585/MB')
  assert.equal(panel?.unitSellRands, Math.round(1446.41 * 1.25 * 100) / 100)

  // COC at the configured fee (no markup on compliance)
  const coc = bom.find((item) => item.sku === 'COC')
  assert.equal(coc?.unitSellRands, 2000)
  assert.equal(coc?.unitCostRands, 2000)

  // Labour formula uses the configured R/W rates: 8000×0.3 + 14×585×0.8
  const labour = bom.find((item) => item.sku === 'LABOUR')
  assert.equal(labour?.unitSellRands, 8952)

  // Two-storey fixture → configured premium
  const access = bom.find((item) => item.sku === 'LABOUR-ACCESS')
  assert.equal(access?.unitSellRands, 3000)

  // Tariff table override resolves per municipality
  assert.equal(
    getTariffRateForMunicipality('City of Johannesburg', { 'City of Johannesburg': 3.5, Eskom: 3 }),
    3.5,
  )

  // And the default path is untouched — reference totals still hold
  const baseline = calculateQuote(michelleFixture)
  assert.ok(Math.abs(baseline.quoteTotalRands - 189485.39) <= 250, `Baseline drifted: ${baseline.quoteTotalRands}`)
})

test('battery voltage class mismatch is a blocker (RULE-INV-06)', () => {
  const fixture: CalculatorInput = {
    ...michelleFixture,
    equipment: {
      ...michelleFixture.equipment,
      // HV-battery inverter (Sungrow SH20T style spec) with a 51.2V LV battery
      inverter: {
        ...michelleFixture.equipment.inverter,
        brand: 'Sungrow',
        description: 'Sungrow 20kW 3P Hybrid',
        notes: JSON.stringify({
          max_dc_voltage: 1000, mppt_min: 150, mppts: 3,
          battery_class: 'HV', battery_voltage_range: '100-700',
        }),
      },
      battery: {
        ...michelleFixture.equipment.battery,
        brand: 'Sunsynk',
        description: 'Sunsynk 5.32kWh LFP Wall Mount',
        notes: JSON.stringify({ voltage: 51.2, battery_class: 'LV' }),
      },
      panel: { ...michelleFixture.equipment.panel, voc_volts: 52.16, isc_amps: 13.89 },
    },
  }
  const quote = calculateQuote(fixture)
  const check = (quote.complianceChecks ?? []).find((c) => c.id === 'battery-class')
  assert.equal(check?.status, 'blocker', check?.detail)
})

test('string verdict: edge-of-cloud caps the Aiko 500W string at 8 panels, splits 41 honestly', () => {
  const verdict = verifyPanelString(sunsynk16k(), aiko500(), 41)
  assert.ok(verdict)
  // 500V ÷ (45.02 × 1.10 cold × 1.20 edge-of-cloud) → max 8 panels per string
  assert.ok(verdict!.notes.some((n) => /Max 8 panels per string/.test(n)), verdict!.notes.join(' | '))
  // 41 doesn't divide into equal strings — surfaced honestly, not "6 × 7 = 42"
  assert.match(verdict!.summary, /6 strings × 6–7 in series · 2 parallel per MPPT/)
  assert.ok(verdict!.notes.some((n) => /5×7 \+ 1×6/.test(n)), verdict!.notes.join(' | '))
  assert.equal(verdict!.level, 'warn') // uneven split, but inside both voltage limits
})

test('string verdict: 9 in series trips the edge-of-cloud ceiling (blocker)', () => {
  // Force a single 9-panel string; cold Voc 445.7V × 1.20 = 534.8V > 500V
  const verdict = verifyPanelString(sunsynk16k({ max_strings: 1 }), aiko500(), 9)
  assert.ok(verdict)
  assert.equal(verdict!.level, 'block')
  assert.ok(verdict!.notes.some((n) => /edge-of-cloud margin .* over the inverter's 500V/.test(n)),
    verdict!.notes.join(' | '))
})

test('string verdict: a single panel is blocked by the MPPT-minimum (lower) limit', () => {
  // The bug Matthew flagged: 1 panel sits well under 500V but the inverter can't
  // track a string below its 150V MPPT floor — must NOT read as a green pass.
  const verdict = verifyPanelString(sunsynk16k(), aiko500(), 1)
  assert.ok(verdict)
  assert.equal(verdict!.level, 'block')
  assert.ok(verdict!.notes.some((n) => /below the 150V MPPT minimum/.test(n)), verdict!.notes.join(' | '))
})
