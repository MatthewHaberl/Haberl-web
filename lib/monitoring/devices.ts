/**
 * Device inventory — what hardware is actually installed behind a monitored
 * system, and what it adds up to.
 *
 * Motivation: a site's inverter capacity is NOT one inverter's nameplate. Hotel
 * Nieu runs three Quattro 48/15000 in parallel (45 kVA), which the fleet page
 * had no way to know — it only carried a single hand-typed kWp figure. The
 * brand clouds do report the full device list, so we read it rather than
 * guessing, and total it here.
 *
 * Everything in this file is pure: adapters hand over a device list, these
 * functions turn model names into numbers. That keeps the ratings testable and
 * in one place instead of scattered through the adapters.
 */

/** What a device does in the system — drives how its rating is totalled. */
export type DeviceRole =
  | 'inverter'       // battery inverter / inverter-charger (the VE.Bus units, the Deye)
  | 'mppt'           // DC-coupled solar charge controller
  | 'pv_inverter'    // AC-coupled PV inverter (SMA, Fronius…)
  | 'battery'        // battery / BMS
  | 'gateway'        // Cerbo, Ekrano, dongle
  | 'meter'          // energy meter, Shelly
  | 'other'

export interface InventoryDevice {
  role: DeviceRole
  /** Manufacturer's model string as the cloud reports it. */
  model: string
  /** How many identical units this entry represents (a parallel bank = 3). */
  count: number
  /** Per-unit apparent power, inverters only. */
  kva?: number | null
  /** Per-unit continuous output power. */
  kw?: number | null
  /** Per-unit max PV array the device can carry (MPPTs, in kW). */
  pv_kw?: number | null
  /** Usable/nominal energy, batteries only. */
  kwh?: number | null
  /** Free-text extras worth showing: serials, phase layout, module count. */
  detail?: string | null
}

export interface SystemInventory {
  devices: InventoryDevice[]
  /** Total battery-inverter apparent power across the bank. */
  inverter_kva: number | null
  /** Total battery-inverter continuous output. */
  inverter_kw: number | null
  /** Number of battery-inverter units (3 Quattros in parallel = 3). */
  inverter_count: number
  /** Total DC-coupled PV the MPPTs can carry. */
  mppt_kw: number | null
  /** Number of AC-coupled PV inverters. */
  pv_inverter_count: number
  /** Total battery energy. */
  battery_kwh: number | null
  /** Human summary, e.g. "3 x Quattro 48/15000 (parallel)". */
  summary: string | null
}

// ── Victron model parsing ──────────────────────────────────────────────

/**
 * Victron rates the Multi/Quattro range at 80% of VA for continuous output at
 * 25 °C (15000 VA -> 12000 W, 10000 -> 8000, 5000 -> 4000). One ratio, no table.
 */
const VA_TO_W = 0.8

/** "Quattro 48/15000/200-2x100" -> { kva: 15, kw: 12 }. */
export function parseVebusModel(model: string): { kva: number | null; kw: number | null } {
  // <dc volts>/<VA>/<charger amps>, e.g. 48/15000/200 or 48/10000/140-100/100
  const m = /\b(\d{2})\/(\d{3,6})\//.exec(model)
  if (!m) return { kva: null, kw: null }
  const va = Number(m[2])
  if (!Number.isFinite(va) || va <= 0) return { kva: null, kw: null }
  return { kva: va / 1000, kw: Math.round(va * VA_TO_W) / 1000 }
}

/**
 * Max PV array power a Victron MPPT carries on a 48 V battery, by charge
 * current. These are the published figures; anything unlisted falls back to the
 * ~58 W-per-amp the range works out to, so a new model still totals sensibly.
 */
const MPPT_PV_W_48V: Record<number, number> = {
  35: 2000, 45: 2600, 50: 2900, 60: 3400, 70: 4000, 85: 4900, 100: 5800,
}

/** "SmartSolar MPPT VE.Can 250/100 rev2" -> { volts: 250, amps: 100, pv_kw: 5.8 }. */
export function parseMpptModel(model: string): { volts: number | null; amps: number | null; pv_kw: number | null } {
  const m = /\b(\d{2,3})\/(\d{2,3})\b/.exec(model)
  if (!m) return { volts: null, amps: null, pv_kw: null }
  const volts = Number(m[1])
  const amps = Number(m[2])
  if (!Number.isFinite(amps) || amps <= 0) return { volts, amps: null, pv_kw: null }
  const watts = MPPT_PV_W_48V[amps] ?? Math.round((amps * 58) / 100) * 100
  return { volts, amps, pv_kw: watts / 1000 }
}

/**
 * How many VE.Bus units are in the bank. VRM's `vid` field on the device says it
 * outright — an enum label ("Three units configured in parallel") plus a
 * per-phase count. We trust the per-phase numbers and fall back to counting the
 * reported machine serial numbers, which is one per physical unit.
 */
export function vebusUnitCount(
  vid: { devicesPerPhase?: Record<string, number | null> } | null | undefined,
  serials: number,
): number {
  const perPhase = vid?.devicesPerPhase
  if (perPhase) {
    const total = Object.values(perPhase).reduce<number>((sum, n) => sum + (typeof n === 'number' ? n : 0), 0)
    if (total > 0) return total
  }
  return serials > 0 ? serials : 1
}

/** "L1: 3, L2: 0, L3: 0" -> "3 in parallel"; three phases -> "3-phase". */
export function vebusLayout(vid: { devicesPerPhase?: Record<string, number | null> } | null | undefined): string | null {
  const perPhase = vid?.devicesPerPhase
  if (!perPhase) return null
  const phases = Object.entries(perPhase).filter(([, n]) => typeof n === 'number' && n > 0)
  if (phases.length === 0) return null
  if (phases.length === 1) {
    const n = phases[0][1] as number
    return n > 1 ? `${n} in parallel on ${phases[0][0]}` : `single unit on ${phases[0][0]}`
  }
  const per = phases.map(([, n]) => n as number)
  const even = per.every((n) => n === per[0])
  return even && per[0] > 1
    ? `3-phase, ${per[0]} per phase`
    : `3-phase (${phases.map(([p, n]) => `${p}:${n}`).join(' ')})`
}

/**
 * Collapse repeats into one row with a count — twelve identical SMA PV
 * inverters should read "12 x SMA PV Inverter", not twelve lines. Devices the
 * installer labelled individually ("MPPT 1 EAST") keep their own row, because
 * that label is how the site is actually wired.
 */
export function mergeIdenticalDevices(devices: InventoryDevice[]): InventoryDevice[] {
  const out: InventoryDevice[] = []
  const index = new Map<string, InventoryDevice>()
  for (const d of devices) {
    const key = `${d.role}|${d.model}|${d.detail ?? ''}`
    const hit = index.get(key)
    if (hit) { hit.count += d.count; continue }
    const copy = { ...d }
    index.set(key, copy)
    out.push(copy)
  }
  return out
}

// ── Totalling ──────────────────────────────────────────────────────────

const sumBy = (devices: InventoryDevice[], role: DeviceRole, pick: (d: InventoryDevice) => number | null | undefined) => {
  let total: number | null = null
  for (const d of devices) {
    if (d.role !== role) continue
    const v = pick(d)
    if (v == null) continue
    total = (total ?? 0) + v * d.count
  }
  return total == null ? null : Math.round(total * 100) / 100
}

const countOf = (devices: InventoryDevice[], role: DeviceRole) =>
  devices.reduce((n, d) => (d.role === role ? n + d.count : n), 0)

/** Roll a device list up into the per-system totals the portal displays. */
export function summariseInventory(devices: InventoryDevice[]): SystemInventory {
  const inverters = devices.filter((d) => d.role === 'inverter')
  const inverterCount = countOf(devices, 'inverter')
  const summaryParts: string[] = []
  for (const inv of inverters) {
    summaryParts.push(`${inv.count} x ${inv.model}${inv.detail ? ` (${inv.detail})` : ''}`)
  }
  const mpptCount = countOf(devices, 'mppt')
  if (mpptCount > 0) summaryParts.push(`${mpptCount} MPPT${mpptCount > 1 ? 's' : ''}`)
  const pvInverters = countOf(devices, 'pv_inverter')
  if (pvInverters > 0) summaryParts.push(`${pvInverters} AC-coupled PV inverter${pvInverters > 1 ? 's' : ''}`)

  return {
    devices,
    inverter_kva: sumBy(devices, 'inverter', (d) => d.kva),
    inverter_kw: sumBy(devices, 'inverter', (d) => d.kw),
    inverter_count: inverterCount,
    mppt_kw: sumBy(devices, 'mppt', (d) => d.pv_kw),
    pv_inverter_count: pvInverters,
    battery_kwh: sumBy(devices, 'battery', (d) => d.kwh),
    summary: summaryParts.length > 0 ? summaryParts.join(' + ') : null,
  }
}

/**
 * Battery energy from what a BMS reports: capacity in Ah at the pack's nominal
 * voltage. LFP packs sit ~51.2 V nominal for a "48 V" bank; a high-voltage pack
 * reports its own working voltage, so we round the measured voltage to the
 * nearest sensible nominal rather than assuming 48 V.
 */
export function batteryKwhFromAh(capacityAh: number | null, measuredVolts: number | null): number | null {
  if (capacityAh == null || !(capacityAh > 0)) return null
  const v = measuredVolts != null && measuredVolts > 0 ? measuredVolts : null
  if (v == null) return null
  // A 48 V-class pack floats around 51–58 V; use the LFP nominal, not the float.
  const nominal = v < 70 ? 51.2 : v
  return Math.round((capacityAh * nominal) / 100) / 10
}
