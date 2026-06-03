import test from 'node:test'
import assert from 'node:assert/strict'
import type { CalculatorInput } from '../quote-calculator'

// @ts-expect-error Node's strip-types runner needs the file extension here.
const { calculateQuote } = await import('../quote-calculator.ts')

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
  assert.ok(Math.abs(quote.quoteTotalRands - 187024.24) <= 200, `Quote total was ${quote.quoteTotalRands}`)
  assert.equal(Number(quote.depositTotalRands.toFixed(2)), Number(depositTotal.toFixed(2)))
  assert.equal(labourValue, 8142.5)
  assert.equal(Number(quote.earthingSpikeCount), 6)
  assert.ok(Number(quote.paybackMonths) >= 68 && Number(quote.paybackMonths) <= 74, `Payback months was ${quote.paybackMonths}`)
})
