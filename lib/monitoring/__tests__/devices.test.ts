import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseVebusModel, parseMpptModel, vebusUnitCount, vebusLayout,
  summariseInventory, batteryKwhFromAh, type InventoryDevice,
} from '../devices'

test('parseVebusModel reads VA out of Victron model names', () => {
  assert.deepEqual(parseVebusModel('Quattro 48/15000/200-2x100'), { kva: 15, kw: 12 })
  assert.deepEqual(parseVebusModel('MultiPlus-II 48/10000/140-100/100'), { kva: 10, kw: 8 })
  assert.deepEqual(parseVebusModel('MultiPlus 48/3000/35-16'), { kva: 3, kw: 2.4 })
  assert.deepEqual(parseVebusModel('Cerbo GX MK2'), { kva: null, kw: null })
})

test('parseMpptModel reads the charge current and maps it to array capacity', () => {
  assert.deepEqual(parseMpptModel('SmartSolar MPPT VE.Can 250/100 rev2'), { volts: 250, amps: 100, pv_kw: 5.8 })
  assert.deepEqual(parseMpptModel('BlueSolar Charger MPPT 150/45 rev3'), { volts: 150, amps: 45, pv_kw: 2.6 })
  assert.deepEqual(parseMpptModel('SmartSolar Charger MPPT 250/60'), { volts: 250, amps: 60, pv_kw: 3.4 })
  // Unlisted rating still totals, via the range's ~58 W/A.
  assert.equal(parseMpptModel('SmartSolar MPPT 250/75').pv_kw, 4.4)
  assert.equal(parseMpptModel('Generic charger').pv_kw, null)
})

test('vebusUnitCount prefers the per-phase counts, falls back to serials', () => {
  assert.equal(vebusUnitCount({ devicesPerPhase: { L1: 3, L2: 0, L3: 0 } }, 3), 3)
  assert.equal(vebusUnitCount({ devicesPerPhase: { L1: 2, L2: 2, L3: 2 } }, 6), 6)
  assert.equal(vebusUnitCount(null, 2), 2)          // no vid → count the serials
  assert.equal(vebusUnitCount({ devicesPerPhase: { L1: 0, L2: 0, L3: 0 } }, 0), 1)  // never zero
})

test('vebusLayout describes the bank', () => {
  assert.equal(vebusLayout({ devicesPerPhase: { L1: 3, L2: 0, L3: 0 } }), '3 in parallel on L1')
  assert.equal(vebusLayout({ devicesPerPhase: { L1: 1, L2: 0, L3: 0 } }), 'single unit on L1')
  assert.equal(vebusLayout({ devicesPerPhase: { L1: 2, L2: 2, L3: 2 } }), '3-phase, 2 per phase')
  assert.equal(vebusLayout(null), null)
})

test('summariseInventory totals a parallel bank, not one unit', () => {
  const devices: InventoryDevice[] = [
    { role: 'inverter', model: 'Quattro 48/15000/200-2x100', count: 3, kva: 15, kw: 12, detail: '3 in parallel on L1' },
    { role: 'battery', model: 'BYD Premium', count: 1, kwh: 92.4 },
    { role: 'pv_inverter', model: 'SMA PV Inverter', count: 12 },
    { role: 'gateway', model: 'Ekrano GX', count: 1 },
  ]
  const s = summariseInventory(devices)
  assert.equal(s.inverter_kva, 45)
  assert.equal(s.inverter_kw, 36)
  assert.equal(s.inverter_count, 3)
  assert.equal(s.pv_inverter_count, 12)
  assert.equal(s.mppt_kw, null)          // AC-coupled site has no MPPTs
  assert.equal(s.battery_kwh, 92.4)
  assert.match(s.summary ?? '', /^3 x Quattro 48\/15000\/200-2x100 \(3 in parallel on L1\)/)
})

test('summariseInventory totals mixed MPPTs', () => {
  const devices: InventoryDevice[] = [
    { role: 'inverter', model: 'Quattro 48/15000/200-2x100', count: 1, kva: 15, kw: 12 },
    { role: 'mppt', model: 'SmartSolar MPPT VE.Can 250/100 rev2', count: 2, pv_kw: 5.8 },
    { role: 'mppt', model: 'SmartSolar MPPT VE.Can 150/100 rev2', count: 1, pv_kw: 5.8 },
    { role: 'mppt', model: 'SmartSolar Charger MPPT 150/85', count: 1, pv_kw: 4.9 },
    { role: 'mppt', model: 'SmartSolar Charger MPPT 250/60', count: 1, pv_kw: 3.4 },
  ]
  const s = summariseInventory(devices)
  assert.equal(s.mppt_kw, 25.7)
  assert.equal(s.inverter_kw, 12)
})

test('batteryKwhFromAh uses the LFP nominal for 48 V packs and the pack voltage for HV', () => {
  assert.equal(batteryKwhFromAh(1782, 56.2), 91.2)     // BYD 48 V class → 51.2 V nominal
  assert.equal(batteryKwhFromAh(100, 490.3), 49)       // HV pack → its own voltage
  assert.equal(batteryKwhFromAh(null, 51), null)
  assert.equal(batteryKwhFromAh(300, null), null)
})
