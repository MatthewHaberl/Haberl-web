// Run with: npx tsx --test lib/solar/__tests__/render-quote-golden.test.ts
// Regenerate the golden file after an INTENTIONAL output change with:
//   UPDATE_GOLDEN=1 npx tsx --test lib/solar/__tests__/render-quote-golden.test.ts
//
// Byte-for-byte pin on the solar customer quote HTML — the revenue path. This
// is the gate for any refactor that touches lib/solar/render-quote.ts (e.g. the
// planned render-shell chrome extraction, W97 phase 3): the extraction is only
// safe if this test still passes unchanged. renderCustomerQuote is pure string
// templating, so with a fully literal fixture the output is deterministic.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderCustomerQuote, type QuoteData } from '../render-quote'

const GOLDEN_PATH = fileURLToPath(new URL('./fixtures/customer-quote.golden.html', import.meta.url))

// Every value literal and pre-formatted — no Date/locale calls anywhere.
const FIXTURE = {
  quoteNumber: 'QUO-2026-999',
  dateIssued: '10 August 2026',
  dateExpires: '9 September 2026',
  customerName: 'Golden Fixture <script>alert(1)</script>',
  municipality: 'City of Johannesburg',
  customerPhone: '+27 82 000 0000',
  customerEmail: 'golden@example.com',
  siteAddress: '1 Fixture Street, Johannesburg',
  monthlyUsageKwh: '850',
  systemType: 'Hybrid (grid-tied with battery backup)',
  inverterModel: 'Sunsynk SUN-8K-SG01LP1',
  inverterKw: '8',
  batteryModel: 'Sunsynk L5.1',
  batteryKwh: '10.2',
  panelCount: '14',
  panelModel: 'JA Solar 585W',
  totalKwp: '8.19',
  monthlyGenKwh: '1030',
  panelCost: 'R32,000.00',
  panelMountingConsumables: 'R6,500.00',
  panelMountingSubtotal: 'R38,500.00',
  cablesCost: 'R4,200.00',
  cablesSubtotal: 'R4,200.00',
  dcCombinerConfig: '2 strings of 7',
  dcCombinerCost: 'R3,100.00',
  dcProtectionSubtotal: 'R3,100.00',
  inverterQty: '1',
  inverterCost: 'R38,000.00',
  batteryQty: '2',
  batteryCost: 'R56,000.00',
  batteryAccessoriesCost: 'R1,200.00',
  inverterBatterySubtotal: 'R95,200.00',
  acDbCost: 'R7,800.00',
  acDbSubtotal: 'R7,800.00',
  earthingSpikeCount: '2',
  earthingCost: 'R2,400.00',
  earthingSubtotal: 'R2,400.00',
  consumablesCost: 'R3,000.00',
  consumablesSubtotal: 'R3,000.00',
  labourCost: 'R12,550.00',
  labourSubtotal: 'R12,550.00',
  materialsLabourSubtotal: 'R166,750.00',
  quoteTotal: 'R166,750.00',
  depositTotal: 'R129,100.00',
  balanceTotal: 'R37,650.00',
  quoteTotalRands: 166750,
  depositTotalRands: 129100,
  annualOffsetPercent: '78',
  monthlySavingR: 'R2,450.00',
  tariffRate: 'R2.87',
  annualSavingR: 'R29,400.00',
  paybackMonths: '68',
  paybackYears: '5.7',
  paybackMonthsEscalated: '55',
  depositItems: [
    { name: 'Panels', amountRands: 32000 },
    { name: 'Inverter', amountRands: 38000 },
    { name: 'Batteries', amountRands: 56000 },
  ],
  supplierBom: [],
  equipmentPhotos: [
    { label: 'Inverter', model: 'Sunsynk 8K', imageUrl: 'https://example.com/inv.png' },
  ],
  monthlyGenTable: [
    {
      month: 'Jan', solarGenKwh: 1100, consumptionKwh: 850, importedKwh: 120,
      energyFromSolarPct: 86, billBefore: 'R2,440.00', billAfter: 'R344.00', saving: 'R2,096.00',
    },
    {
      month: 'Jun', solarGenKwh: 820, consumptionKwh: 900, importedKwh: 310,
      energyFromSolarPct: 66, billBefore: 'R2,583.00', billAfter: 'R890.00', saving: 'R1,693.00',
    },
  ],
  annualSolarGenKwh: '12360',
  annualConsumptionKwh: '10200',
  annualGridOffsetPct: '78',
  evChargerKw: '7kW',
  evChargerCost: 'R12,000.00',
  evChargerSubtotal: 'R12,000.00',
} as unknown as QuoteData

test('solar customer quote HTML is byte-identical to the committed golden file', () => {
  const html = renderCustomerQuote(FIXTURE)

  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(fileURLToPath(new URL('./fixtures/', import.meta.url)), { recursive: true })
    writeFileSync(GOLDEN_PATH, html, 'utf8')
    assert.ok(html.length > 5000)
    return
  }

  assert.ok(existsSync(GOLDEN_PATH),
    'Golden file missing — run UPDATE_GOLDEN=1 npx tsx --test lib/solar/__tests__/render-quote-golden.test.ts once and commit the fixture.')
  const golden = readFileSync(GOLDEN_PATH, 'utf8')
  assert.ok(html === golden,
    'Solar customer quote HTML changed. If this was INTENTIONAL, regenerate with UPDATE_GOLDEN=1 and review the diff; if not, you just altered the revenue path — revert.')
  // Belt-and-braces: user-supplied fields must arrive escaped.
  assert.ok(!html.includes('<script>alert(1)</script>'))
})
