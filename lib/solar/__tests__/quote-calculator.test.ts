// Run with: npx tsx --test lib/solar/__tests__/quote-calculator.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateQuote, type CalculatorInput } from '../quote-calculator'

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
  cableRouteMetres: 15,
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
