/**
 * DessMonitor / SmartESS adapter — talks to the Eybond cloud
 * (api.dessmonitor.com), the same backend the SmartESS / EnergyMate /
 * WatchPower apps and the dessmonitor.com web portal use. Covers inverters
 * that report via an Eybond Wi-Fi Pro datalogger (SRNE, PowMr, MUST, and many
 * other white-label hybrids).
 *
 * There is no official public API. This is the well-trodden, SHA-1-signed REST
 * API the community Home-Assistant integrations use; it has been stable for
 * years but is unofficial and could change.
 *   Reference: andreas-glaser/ha-dessmonitor, SilverFire/dessmonitor-homeassistant.
 *
 * Auth flow (Eybond "authSource"):
 *   salt  = current epoch ms
 *   sign  = SHA1( salt + SHA1(password) + actionString )      // login
 *   →  returns { token, secret, expire } (token good ~7 days)
 *   sign  = SHA1( salt + secret + token + actionString )       // every later call
 *
 * Device resolution mirrors the app's own drill-down:
 *   queryPlants → webQueryCollectorsEs(pid) → queryCollectorDevices(pn)
 *   → queryDeviceLastData(pn, devcode, devaddr, sn)
 *
 * The last-data call returns an array of { title, val, unit } points whose
 * titles vary by inverter firmware, so fields are matched fuzzily on the title
 * (same approach as the Sunsynk day-chart classifier). Provisional mapping —
 * verify the first live read.
 */
import { createHash } from 'crypto'
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://api.dessmonitor.com/public/'
const DEFAULT_COMPANY_KEY = 'bnrl_frRFjEz8Mkn'
const BRAND = 'dessmonitor' as const

const sha1Hex = (value: string): string => createHash('sha1').update(value, 'utf8').digest('hex')

/** Coerce the API's number-or-string values to a finite number, else null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === '--') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

interface ApiEnvelope<T> { err?: number; desc?: string; dat?: T }
interface AuthState { token: string; secret: string }

/** Build the `&k=v` action string that is both signed and appended to the URL. */
function buildActionString(action: string, params: Record<string, string | number>): string {
  let s = `&action=${action}`
  for (const [k, v] of Object.entries(params)) s += `&${k}=${v}`
  return s
}

/**
 * Perform a signed GET. When `auth` is omitted this is an unauthenticated call
 * (only `authSource` uses that path, with a pre-built sign); otherwise the sign
 * is salt+secret+token+actionString and the token rides on the query string.
 */
async function request<T>(
  action: string,
  params: Record<string, string | number>,
  auth: AuthState,
): Promise<T> {
  const salt = Date.now()
  const actionString = buildActionString(action, params)
  const sign = sha1Hex(`${salt}${auth.secret}${auth.token}${actionString}`)
  const url = `${BASE_URL}?sign=${sign}&salt=${salt}&token=${auth.token}${actionString}`

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new AdapterError(`SmartESS request failed: ${res.status} (${action})`, BRAND)
  const body = (await res.json()) as ApiEnvelope<T>
  if (body.err && body.err !== 0) {
    // err 0 = ok. A bad token surfaces here; treat data errors as retryable.
    throw new AdapterError(`SmartESS ${action} error ${body.err}: ${body.desc ?? 'unknown'}`, BRAND)
  }
  if (body.dat === undefined) throw new AdapterError(`SmartESS ${action} returned no data`, BRAND)
  return body.dat
}

/** authSource: SHA1(salt + SHA1(password) + actionString); returns token + secret. */
async function login(username: string, password: string, companyKey: string): Promise<AuthState> {
  const salt = Date.now()
  const params: Record<string, string> = {
    usr: username,
    'company-key': companyKey,
    source: '1',
    _app_client_: 'web',
    _app_id_: 'haberl-web',
    _app_version_: '1.0',
  }
  const actionString = buildActionString('authSource', params)
  const sign = sha1Hex(`${salt}${sha1Hex(password)}${actionString}`)
  const url = `${BASE_URL}?sign=${sign}&salt=${salt}${actionString}`

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new AdapterError(`SmartESS login failed: HTTP ${res.status}`, BRAND)
  const body = (await res.json()) as ApiEnvelope<{ token?: string; secret?: string }>
  const token = body.dat?.token
  const secret = body.dat?.secret
  if ((body.err && body.err !== 0) || !token || !secret) {
    // Wrong email/password (or wrong company key) is the expected failure — not retryable.
    throw new AdapterError(`SmartESS login rejected: ${body.desc ?? `err ${body.err}`}`, BRAND, false)
  }
  return { token, secret }
}

/** First array-valued property of `dat` (the Eybond list key name varies by call). */
function firstArray(dat: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(dat)) return dat as Array<Record<string, unknown>>
  if (dat && typeof dat === 'object') {
    for (const v of Object.values(dat as Record<string, unknown>)) {
      if (Array.isArray(v)) return v as Array<Record<string, unknown>>
    }
  }
  return []
}

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v)

interface DeviceRef { pn: string; devcode: string; devaddr: string; sn: string }

/** Resolve the inverter device list: plant → collector(s) → device(s). */
async function resolveDevices(auth: AuthState, plantId: string | null): Promise<DeviceRef[]> {
  // 1. Pick the plant (pid). Honour a supplied plant_id, else take the first.
  let pid = plantId
  if (!pid) {
    const plants = firstArray(await request('queryPlants', { page: 0, pagesize: 50 }, auth))
    const first = plants.find((p) => str(p.pid))
    pid = first ? str(first.pid) : null
    if (!pid) throw new AdapterError('No SmartESS plants found for this account', BRAND, false)
  }

  // 2. Collectors (Wi-Fi loggers) under the plant.
  const collectors = firstArray(await request('webQueryCollectorsEs', { pid, page: 0, pagesize: 50 }, auth))
  const pns = collectors.map((c) => str(c.pn)).filter((p): p is string => !!p)
  if (pns.length === 0) throw new AdapterError(`No SmartESS dataloggers found for plant ${pid}`, BRAND, false)

  // 3. Devices under each collector.
  const devices: DeviceRef[] = []
  for (const pn of pns) {
    const rows = firstArray(await request('queryCollectorDevices', { pn, page: 0, pagesize: 50 }, auth))
    for (const r of rows) {
      const devcode = str(r.devcode)
      const devaddr = str(r.devaddr)
      const sn = str(r.sn) ?? str(r.pn) ?? pn
      if (devcode && devaddr) devices.push({ pn: str(r.pn) ?? pn, devcode, devaddr, sn })
    }
  }
  if (devices.length === 0) throw new AdapterError(`No SmartESS inverters found for plant ${pid}`, BRAND, false)
  return devices
}

interface DataPoint { title?: unknown; val?: unknown; unit?: unknown; id?: unknown; par?: unknown }

/** Classify a last-data point title into one of our reading fields. */
type Field =
  | 'pv' | 'battery' | 'grid' | 'load' | 'soc'
  | 'battery_v' | 'grid_freq' | 'temp' | 'pv_v' | 'pv_a' | null

function classify(title: string): Field {
  const t = title.toLowerCase()
  if (t.includes('soc') || (t.includes('state') && t.includes('charge')) || t.includes('capacity')) return 'soc'
  if (t.includes('pv') && t.includes('volt')) return 'pv_v'
  if (t.includes('pv') && t.includes('curr')) return 'pv_a'
  if (t.includes('battery') && t.includes('volt')) return 'battery_v'
  if (t.includes('grid') && t.includes('freq')) return 'grid_freq'
  if (t.includes('temp')) return 'temp'
  if (t.includes('soc')) return 'soc'
  if (t.includes('battery') && t.includes('power')) return 'battery'
  if (t.includes('grid') && t.includes('power')) return 'grid'
  if ((t.includes('output') || t.includes('load') || t.includes('consum')) && t.includes('power')) return 'load'
  if ((t.includes('pv') || t.includes('solar')) && t.includes('power')) return 'pv'
  return null
}

/** Power values arrive in W or kW depending on firmware/unit string. */
function toWatts(unit: string | null, raw: number): number {
  return /kw/i.test(unit ?? '') ? Math.round(raw * 1000) : Math.round(raw)
}

export const dessmonitorAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null): Promise<NormalisedReading> {
    const { username, password } = credentials
    const companyKey = credentials.company_key || DEFAULT_COMPANY_KEY
    if (!username || !password) {
      throw new AdapterError('SmartESS credentials incomplete (need account email + password)', BRAND, false)
    }

    const auth = await login(username, password, companyKey)
    const devices = await resolveDevices(auth, plantId)

    // Accumulate across devices (usually one).
    let pvPower = 0, batteryPower = 0, gridPower = 0, loadPower = 0
    let sawPv = false, sawBattery = false, sawGrid = false, sawLoad = false
    let socSum = 0, socCount = 0
    let batteryVoltage: number | null = null
    let gridFreq: number | null = null
    let invTemp: number | null = null
    const pvStrings: PvString[] = []
    const rawByDevice: Record<string, unknown> = {}

    for (const dev of devices) {
      const dat = await request<unknown>('queryDeviceLastData', {
        pn: dev.pn, devcode: dev.devcode, devaddr: dev.devaddr, sn: dev.sn, i18n: 'en',
      }, auth)
      const points = firstArray(dat) as DataPoint[]
      rawByDevice[dev.sn] = dat

      // Per-string DC accumulation, keyed off the title's PV index when present.
      const pvByIndex = new Map<number, { v: number | null; a: number | null }>()

      for (const p of points) {
        const title = str(p.title) ?? str(p.par) ?? str(p.id)
        const value = num(p.val)
        if (!title || value === null) continue
        const unit = str(p.unit)
        const field = classify(title)
        if (!field) continue

        switch (field) {
          case 'pv':       pvPower += toWatts(unit, value); sawPv = true; break
          case 'battery':  batteryPower += toWatts(unit, value); sawBattery = true; break
          case 'grid':     gridPower += toWatts(unit, value); sawGrid = true; break
          case 'load':     loadPower += toWatts(unit, value); sawLoad = true; break
          case 'soc':      socSum += value; socCount += 1; break
          case 'battery_v': if (batteryVoltage === null) batteryVoltage = value; break
          case 'grid_freq': if (gridFreq === null) gridFreq = value; break
          case 'temp':     if (invTemp === null) invTemp = value; break
          case 'pv_v': case 'pv_a': {
            const idx = (title.match(/(\d+)/)?.[1] && Number(title.match(/(\d+)/)![1])) || 1
            const cur = pvByIndex.get(idx) ?? { v: null, a: null }
            if (field === 'pv_v') cur.v = value; else cur.a = value
            pvByIndex.set(idx, cur)
            break
          }
        }
      }

      for (const [string, { v, a }] of [...pvByIndex.entries()].sort((x, y) => x[0] - y[0])) {
        pvStrings.push({ string, voltage_v: v, current_a: a, power_w: v !== null && a !== null ? Math.round(v * a) : null })
      }
    }

    return {
      recorded_at: new Date().toISOString(),
      pv_power_w: sawPv ? Math.round(pvPower) : null,
      battery_power_w: sawBattery ? Math.round(batteryPower) : null,
      grid_power_w: sawGrid ? Math.round(gridPower) : null,
      load_power_w: sawLoad ? Math.round(loadPower) : null,
      battery_soc_pct: socCount > 0 ? socSum / socCount : null,
      battery_voltage_v: batteryVoltage,
      grid_frequency_hz: gridFreq,
      inverter_temp_c: invTemp,
      pv_strings: pvStrings,
      fault_codes: [],
      device_state: 'online' as DeviceState,
      raw_payload: rawByDevice,
    }
  },
}
