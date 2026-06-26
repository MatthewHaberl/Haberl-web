/**
 * Sunsynk Connect adapter — talks DIRECTLY to Sunsynk's own cloud
 * (api.sunsynk.net), the same backend the Sunsynk Connect app + PowerView
 * portal use. Authenticates with just the app email + password — NO Solarman
 * Business API account (App ID / App Secret) required.
 *
 * Auth flow (RSA-signed password grant — the plain /oauth/token is deprecated):
 *   1. GET  /anonymous/publicKey   → RSA public key
 *   2. RSA-PKCS1v15 encrypt the password with that key
 *   3. POST /oauth/token/new       → bearer access_token
 * Reference: jamesridgway/sunsynk-api-client, AsTheSeaRises/SunSynk_API.
 *
 * Readings are pulled per inverter (resolved from the Station/plant ID, or a
 * supplied inverter SN) and aggregated across inverters for the plant.
 * Realtime power values are already in WATTS — no scaling.
 */
import { createHash, publicEncrypt, constants } from 'crypto'
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://api.sunsynk.net'
const SOURCE = 'sunsynk'
const CLIENT_ID = 'csp-web'

const md5Hex = (value: string): string => createHash('md5').update(value).digest('hex')
const nonce = (): string => Date.now().toString()

/** Coerce the API's number-or-string values to a finite number, else null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === '--') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

interface ApiEnvelope<T> { success?: boolean; code?: number; msg?: string; data?: T }

async function getJson<T>(url: string, token?: string): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new AdapterError(`Sunsynk Connect request failed: ${res.status} (${url.split('?')[0]})`, 'sunsynk')
  return (await res.json()) as ApiEnvelope<T>
}

/** Fetch the RSA public key, RSA-encrypt the password, exchange for a bearer token. */
async function login(username: string, password: string): Promise<string> {
  // 1. public key
  const keyNonce = nonce()
  const keySign = md5Hex(`nonce=${keyNonce}&source=${SOURCE}POWER_VIEW`)
  const keyRes = await getJson<string>(
    `${BASE_URL}/anonymous/publicKey?nonce=${keyNonce}&source=${SOURCE}&sign=${keySign}`,
  )
  const rawKey = keyRes.data
  if (!keyRes.success || !rawKey) {
    throw new AdapterError('Sunsynk Connect public-key fetch failed', 'sunsynk')
  }

  // 2. RSA-PKCS1v15 encrypt the password
  const pem = `-----BEGIN PUBLIC KEY-----\n${rawKey}\n-----END PUBLIC KEY-----`
  const encryptedPassword = publicEncrypt(
    { key: pem, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8'),
  ).toString('base64')

  // 3. token
  const loginNonce = nonce()
  const res = await fetch(`${BASE_URL}/oauth/token/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: encryptedPassword,
      grant_type: 'password',
      client_id: CLIENT_ID,
      source: SOURCE,
      nonce: loginNonce,
      sign: md5Hex(`nonce=${loginNonce}&source=${SOURCE}${rawKey.slice(0, 10)}`),
    }),
  })

  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<{ access_token?: string }>
  const token = body.data?.access_token
  if (!res.ok || !body.success || !token) {
    // A wrong email/password is the expected failure here — not retryable.
    throw new AdapterError(`Sunsynk Connect login failed: ${body.msg ?? `HTTP ${res.status}`}`, 'sunsynk', false)
  }
  return token
}

interface InverterInfo { sn: string; status?: number }

/** Resolve the inverter SN(s) to read for this system. */
async function resolveInverters(token: string, plantId: string | null, deviceSn: string | null): Promise<InverterInfo[]> {
  if (deviceSn) return [{ sn: deviceSn }]
  const q = `page=1&limit=20&total=0&status=-1&sn=&plantId=${plantId ?? ''}&type=-2&softVer=&hmiVer=&agentCompanyId=-1&gsn=`
  const res = await getJson<{ infos?: Array<{ sn: string; status?: number }> }>(`${BASE_URL}/api/v1/inverters?${q}`, token)
  const infos = res.data?.infos ?? []
  if (infos.length === 0) {
    throw new AdapterError(`No inverters found for Sunsynk station ${plantId ?? '(none)'}`, 'sunsynk', false)
  }
  return infos.map((i) => ({ sn: i.sn, status: i.status }))
}

/** Sunsynk inverter status code → our DeviceState. */
function mapStatus(status: number | undefined): DeviceState {
  switch (status) {
    case 1:  return 'online'
    case 2:  return 'online'   // running with a warning
    case 3:  return 'fault'
    case 0:
    case -1: return 'offline'
    default: return 'unknown'
  }
}

interface PvIv { pvNo?: number; vpv?: unknown; ipv?: unknown; ppv?: unknown }

export const sunsynkAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null, deviceSn: string | null): Promise<NormalisedReading> {
    const { username, password } = credentials
    if (!username || !password) {
      throw new AdapterError('Sunsynk Connect credentials incomplete (need account email + password)', 'sunsynk', false)
    }

    const token = await login(username, password)
    const inverters = await resolveInverters(token, plantId, deviceSn)

    // Accumulators across (usually one) inverter.
    let pvPower = 0, loadPower = 0, gridPower = 0, batteryPower = 0
    let socSum = 0, socCount = 0
    let batteryVoltage: number | null = null
    let gridFreq: number | null = null
    let batteryTemp: number | null = null
    const pvStrings: PvString[] = []
    const rawByInverter: Record<string, unknown> = {}
    let stringIndex = 0
    const states: DeviceState[] = []

    for (const inv of inverters) {
      const sn = inv.sn
      const [input, grid, battery, output] = await Promise.all([
        getJson<{ pac?: unknown; pvIV?: PvIv[] }>(`${BASE_URL}/api/v1/inverter/${sn}/realtime/input`, token),
        getJson<{ pac?: unknown; fac?: unknown }>(`${BASE_URL}/api/v1/inverter/grid/${sn}/realtime?sn=${sn}`, token),
        getJson<{ power?: unknown; soc?: unknown; voltage?: unknown; temp?: unknown }>(`${BASE_URL}/api/v1/inverter/battery/${sn}/realtime?sn=${sn}&lan`, token),
        getJson<{ pac?: unknown }>(`${BASE_URL}/api/v1/inverter/${sn}/realtime/output`, token),
      ])

      // PV: prefer summed per-string DC power, fall back to the input pac.
      const ivs = input.data?.pvIV ?? []
      let invPv = 0
      let sawString = false
      for (const iv of ivs) {
        const v = num(iv.vpv)
        const a = num(iv.ipv)
        const p = num(iv.ppv)
        if (v === null && a === null && p === null) continue
        sawString = true
        stringIndex += 1
        if (p !== null) invPv += p
        pvStrings.push({
          string: typeof iv.pvNo === 'number' ? iv.pvNo : stringIndex,
          voltage_v: v,
          current_a: a,
          power_w: p ?? (v !== null && a !== null ? Math.round(v * a) : null),
        })
      }
      pvPower += sawString ? invPv : (num(input.data?.pac) ?? 0)

      loadPower += num(output.data?.pac) ?? 0
      gridPower += num(grid.data?.pac) ?? 0
      batteryPower += num(battery.data?.power) ?? 0

      const soc = num(battery.data?.soc)
      if (soc !== null) { socSum += soc; socCount += 1 }
      if (batteryVoltage === null) batteryVoltage = num(battery.data?.voltage)
      if (batteryTemp === null) batteryTemp = num(battery.data?.temp)
      if (gridFreq === null) gridFreq = num(grid.data?.fac)

      states.push(mapStatus(inv.status))
      rawByInverter[sn] = { input: input.data, grid: grid.data, battery: battery.data, output: output.data }
    }

    // One device_state for the system: fault wins, else online if any online.
    const deviceState: DeviceState =
      states.includes('fault')   ? 'fault'
      : states.includes('online') ? 'online'
      : states.includes('offline') ? 'offline'
      : 'unknown'

    return {
      recorded_at: new Date().toISOString(),
      pv_power_w: Math.round(pvPower),
      battery_power_w: Math.round(batteryPower),
      grid_power_w: Math.round(gridPower),
      load_power_w: Math.round(loadPower),
      battery_soc_pct: socCount > 0 ? socSum / socCount : null,
      battery_voltage_v: batteryVoltage,
      grid_frequency_hz: gridFreq,
      inverter_temp_c: batteryTemp,  // Sunsynk Connect exposes battery temp, not inverter temp
      pv_strings: pvStrings,
      fault_codes: [],               // not surfaced by these realtime endpoints
      device_state: deviceState,
      raw_payload: rawByInverter,
    }
  },
}
