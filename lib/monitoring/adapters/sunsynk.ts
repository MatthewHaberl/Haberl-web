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
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState, SettingsReadResult } from '../types'
import { AdapterError } from '../types'
import { emptySettings, type InverterSettings, type TouWindow } from '../settings/types'

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

/**
 * The energy-flow snapshot the Sunsynk Connect app itself renders. Magnitudes
 * are positive; direction comes from the boolean flags. We use this to derive
 * TOTAL house load (the inverter exposes no load meter — `output.pac` is only
 * the backup/EPS output and understates load badly when the grid feeds it).
 */
interface FlowData {
  pvPower?: unknown
  battPower?: unknown
  gridOrMeterPower?: unknown
  loadOrEpsPower?: unknown
  homeLoadPower?: unknown   // load on the grid/home side
  upsLoadPower?: unknown    // load on the backup/EPS side
  smartLoadPower?: unknown  // load on the smart-load port
  soc?: unknown
  toBat?: boolean    // charging
  batTo?: boolean    // discharging
  toGrid?: boolean   // exporting
  gridTo?: boolean   // importing
}

// ── Historical day chart ───────────────────────────────────────────────
// Sunsynk Connect / SolArk cloud serves a day's power chart per PLANT at:
//   GET /api/v1/plant/energy/{plantId}/day?date=YYYY-MM-DD&id={plantId}&lan=en
// Response: data.infos[] — one series per metric, each with records[] at
// ~5-minute steps. Record times are plant-local wall clock with no offset;
// Haberl's fleet is all South Africa (SAST, fixed UTC+02:00, no DST), so we
// anchor them at +02:00. Confirmed against judasgutenberg/SolArkMonitor.
const SAST_OFFSET = '+02:00'

interface DayRecord { time?: string; value?: unknown; updateTime?: string }
interface DaySeries { label?: string; unit?: string; records?: DayRecord[] }

/** Classify a series label into one of our reading fields. */
function classifySeries(label: string): 'pv' | 'battery' | 'grid' | 'load' | 'soc' | null {
  const l = label.toLowerCase()
  if (l.includes('soc')) return 'soc'
  if (l.includes('pv') || l.includes('solar') || l.includes('gen')) return 'pv'
  if (l.includes('bat')) return 'battery'
  if (l.includes('grid')) return 'grid'
  if (l.includes('load') || l.includes('use') || l.includes('consum')) return 'load'
  return null
}

/** Scale a series value to base units (W / %), honouring a kW unit. */
function scaleValue(field: string, unit: string | undefined, raw: number): number {
  if (field === 'soc') return raw
  return /kw/i.test(unit ?? '') ? Math.round(raw * 1000) : Math.round(raw)
}

/** Build an empty normalised reading for a given timestamp. */
function blankReading(recordedAt: string): NormalisedReading {
  return {
    recorded_at: recordedAt,
    pv_power_w: null, battery_power_w: null, grid_power_w: null, load_power_w: null,
    battery_soc_pct: null, battery_voltage_v: null, grid_frequency_hz: null,
    inverter_temp_c: null, pv_strings: [], fault_codes: [],
    device_state: 'unknown', raw_payload: {},
  }
}

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
      const [flow, input, battery, output] = await Promise.all([
        getJson<FlowData>(`${BASE_URL}/api/v1/inverter/${sn}/flow`, token),
        getJson<{ pac?: unknown; pvIV?: PvIv[] }>(`${BASE_URL}/api/v1/inverter/${sn}/realtime/input`, token),
        getJson<{ power?: unknown; soc?: unknown; voltage?: unknown; temp?: unknown }>(`${BASE_URL}/api/v1/inverter/battery/${sn}/realtime?sn=${sn}&lan`, token),
        getJson<{ pac?: unknown; fac?: unknown }>(`${BASE_URL}/api/v1/inverter/${sn}/realtime/output`, token),
      ])
      const f = flow.data ?? {}

      // Per-string detail (voltage / current / power) from the input endpoint.
      const ivs = input.data?.pvIV ?? []
      let stringSum = 0
      let sawString = false
      for (const iv of ivs) {
        const v = num(iv.vpv)
        const a = num(iv.ipv)
        const p = num(iv.ppv)
        if (v === null && a === null && p === null) continue
        sawString = true
        stringIndex += 1
        if (p !== null) stringSum += p
        pvStrings.push({
          string: typeof iv.pvNo === 'number' ? iv.pvNo : stringIndex,
          voltage_v: v,
          current_a: a,
          power_w: p ?? (v !== null && a !== null ? Math.round(v * a) : null),
        })
      }

      // Magnitudes + directions from the flow snapshot.
      // `f.pvPower` is unreliable on some firmwares (it reports 0 while the
      // strings are producing kilowatts), so trust the per-string sum / input
      // total first and only fall back to the flow's pvPower.
      const flowPv  = num(f.pvPower)
      const invPv   = (sawString && stringSum > 0) ? stringSum : (num(input.data?.pac) || flowPv || 0)
      // `f.battPower` / `f.gridOrMeterPower` are already signed on some firmwares
      // (e.g. negative while charging), so take the magnitude and let the
      // direction flags decide the sign — firmware-independent.
      const battMag = Math.abs(num(f.battPower) ?? 0)
      const gridMag = Math.abs(num(f.gridOrMeterPower) ?? 0)
      const charging    = f.toBat  === true
      const discharging = f.batTo  === true
      const importing   = f.gridTo === true
      const exporting   = f.toGrid === true

      // Signed to match the gauges: battery +charge / −discharge, grid +import / −export.
      const battSigned = charging ? battMag : discharging ? -battMag : 0
      const gridSigned = importing ? gridMag : exporting ? -gridMag : 0

      // TOTAL household load. Prefer the flow's own load fields (home + UPS/EPS +
      // smart load), which the Sunsynk app sums. Fall back to an energy balance
      // (PV + battery discharge + grid import − charge − export), then to the EPS
      // output meter when no flow snapshot is available.
      const flowLoad = (num(f.homeLoadPower) ?? 0) + (num(f.upsLoadPower) ?? 0) + (num(f.smartLoadPower) ?? 0)
      const haveFlow = flowPv !== null || num(f.battPower) !== null || num(f.gridOrMeterPower) !== null
      const invLoad = flowLoad > 0
        ? flowLoad
        : haveFlow
          ? Math.max(0, invPv
              + (discharging ? battMag : 0) - (charging ? battMag : 0)
              + (importing   ? gridMag : 0) - (exporting ? gridMag : 0))
          : (num(output.data?.pac) ?? 0)

      pvPower      += invPv
      batteryPower += battSigned
      gridPower    += gridSigned
      loadPower    += invLoad

      const soc = num(f.soc) ?? num(battery.data?.soc)
      if (soc !== null) { socSum += soc; socCount += 1 }
      if (batteryVoltage === null) batteryVoltage = num(battery.data?.voltage)
      if (batteryTemp === null) batteryTemp = num(battery.data?.temp)
      if (gridFreq === null) gridFreq = num(output.data?.fac)

      states.push(mapStatus(inv.status))
      rawByInverter[sn] = { flow: f, input: input.data, battery: battery.data, output: output.data }
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

  async fetchHistory(
    credentials: BrandCredentials,
    plantId: string | null,
    _deviceSn: string | null,
    dayStartUtc: Date,
  ): Promise<NormalisedReading[]> {
    const { username, password } = credentials
    if (!username || !password) {
      throw new AdapterError('Sunsynk Connect credentials incomplete (need account email + password)', 'sunsynk', false)
    }
    if (!plantId) {
      throw new AdapterError('Sunsynk history needs a plant/station ID', 'sunsynk', false)
    }

    const token = await login(username, password)

    // The chart is keyed by the plant-local date. Derive that local date from
    // the UTC day-start by shifting +2h (SAST), then formatting Y-M-D.
    const local = new Date(dayStartUtc.getTime() + 2 * 60 * 60 * 1000)
    const date = local.toISOString().slice(0, 10)

    const res = await getJson<{ infos?: DaySeries[] }>(
      `${BASE_URL}/api/v1/plant/energy/${plantId}/day?date=${date}&id=${plantId}&lan=en`,
      token,
    )
    const infos = res.data?.infos ?? []
    if (infos.length === 0) return []

    // Records carry either a full datetime or just HH:mm[:ss] (the chart is
    // already scoped to `date`), or occasionally an epoch. Compose a UTC ISO
    // from the chart day + the record's time-of-day; skip anything unparseable
    // rather than throwing.
    const recordIso = (raw: string): string | null => {
      const t = raw.trim()
      if (!t) return null
      if (/^\d{10,13}$/.test(t)) {
        const ms = t.length <= 10 ? Number(t) * 1000 : Number(t)
        const d = new Date(ms)
        return Number.isNaN(d.getTime()) ? null : d.toISOString()
      }
      const hm = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
      if (!hm) return null
      const d = new Date(`${date}T${hm[1].padStart(2, '0')}:${hm[2]}:${hm[3] ?? '00'}${SAST_OFFSET}`)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }

    // Merge all series into one reading per timestamp.
    const byTime = new Map<string, NormalisedReading>()
    for (const series of infos) {
      const field = classifySeries(series.label ?? '')
      if (!field) continue
      for (const rec of series.records ?? []) {
        const iso = recordIso(String(rec.time ?? rec.updateTime ?? ''))
        const v = num(rec.value)
        if (!iso || v === null) continue
        let reading = byTime.get(iso)
        if (!reading) { reading = blankReading(iso); byTime.set(iso, reading) }
        const scaled = scaleValue(field, series.unit, v)
        if (field === 'pv') reading.pv_power_w = scaled
        else if (field === 'battery') reading.battery_power_w = scaled
        else if (field === 'grid') reading.grid_power_w = scaled
        else if (field === 'load') reading.load_power_w = scaled
        else if (field === 'soc') reading.battery_soc_pct = scaled
        reading.device_state = 'online'
      }
    }

    return [...byTime.values()].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  },

  /**
   * Read the inverter's current settings from Sunsynk Connect. The settings
   * block lives at /api/v1/common/setting/{sn}/read and follows the well-known
   * Sunsynk field model (same fields the Connect app + openHAB binding use):
   *   solarSell           — export to grid enable
   *   solarMaxSellPower   — export power cap (W)
   *   cap1..cap6          — target battery SoC % per time slot
   *   sellTime1..6        — slot start time "HH:MM"
   *   time1on..time6on    — grid charge enabled for that slot
   *   batteryShutdownCap  — shutdown / reserve floor SoC %
   * Field-by-field, tolerant of anything the firmware doesn't return.
   */
  async fetchSettings(credentials: BrandCredentials, plantId: string | null, deviceSn: string | null): Promise<SettingsReadResult> {
    const { username, password } = credentials
    if (!username || !password) {
      throw new AdapterError('Sunsynk Connect credentials incomplete (need account email + password)', 'sunsynk', false)
    }

    const token = await login(username, password)
    const inverters = await resolveInverters(token, plantId, deviceSn)
    const sn = inverters[0].sn

    const res = await getJson<Record<string, unknown>>(`${BASE_URL}/api/v1/common/setting/${sn}/read`, token)
    const d = res.data ?? {}

    const settings: InverterSettings = emptySettings()
    const truthy = (v: unknown) => v === true || v === 1 || v === '1'
    const toMin = (v: unknown): number | null => {
      const m = String(v ?? '').match(/(\d{1,2}):(\d{2})/)
      return m ? Number(m[1]) * 60 + Number(m[2]) : null
    }

    // Export
    if (d.solarSell !== undefined) settings.exportEnabled = truthy(d.solarSell)
    const sellPower = num(d.solarMaxSellPower) ?? num(d.maxSellPower) ?? num(d.pvMaxLimit)
    if (sellPower !== null) settings.exportLimitW = sellPower

    // Battery SoC window from the six time-slot caps.
    const caps = [1, 2, 3, 4, 5, 6].map((i) => num(d[`cap${i}`])).filter((n): n is number => n !== null)
    if (caps.length) {
      settings.batteryMinSocPct = Math.min(...caps)
      settings.batteryMaxSocPct = Math.max(...caps)
    }
    const shutdown = num(d.batteryShutdownCap) ?? num(d.batteryLowCap)
    if (shutdown !== null) settings.backupReserveSocPct = shutdown

    // Grid charging — enabled if any slot allows it.
    const onFlags = [1, 2, 3, 4, 5, 6].map((i) => d[`time${i}on`])
    if (onFlags.some((v) => v !== undefined)) settings.gridChargeEnabled = onFlags.some(truthy)

    // Time-of-use windows: each slot runs until the next slot's start.
    const starts = [1, 2, 3, 4, 5, 6].map((i) => toMin(d[`sellTime${i}`]))
    const windows: TouWindow[] = []
    for (let i = 0; i < 6; i++) {
      const start = starts[i]
      if (start === null) continue
      const next = starts[(i + 1) % 6]
      const fromGrid = truthy(d[`time${i + 1}on`])
      windows.push({
        startMin: start,
        endMin: next ?? 1440,
        action: fromGrid ? 'charge' : 'idle',
        targetSocPct: num(d[`cap${i + 1}`]),
        powerW: null,
        fromGrid,
      })
    }
    if (windows.length) settings.touWindows = windows

    return { settings, raw: d }
  },
}
