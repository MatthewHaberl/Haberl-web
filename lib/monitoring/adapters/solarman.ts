/**
 * Solarman adapter — covers Deye AND Sunsynk inverters.
 * Both brands use the Solarman WiFi data logger as their cloud backend.
 * API docs: https://doc.solarmanpv.com
 * Auth: AppID + AppSecret + SHA256-hashed password → OAuth access token
 * Rate limit: 50 requests / minute
 */
import { createHmac, createHash } from 'crypto'
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://globalapi.solarmanpv.com'

async function getToken(appId: string, appSecret: string, username: string, password: string): Promise<string> {
  const passwordHash = createHash('sha256').update(password).digest('hex')
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = Math.random().toString(36).substring(2, 12)
  const signature = createHmac('sha256', appSecret)
    .update(`${appId}${timestamp}${nonce}`)
    .digest('hex')
    .toUpperCase()

  const res = await fetch(`${BASE_URL}/account/v1.0/token?appId=${appId}&language=en`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appSecret,
      email: username,
      password: passwordHash,
      timestamp,
      nonce,
      sign: signature,
    }),
  })

  if (!res.ok) throw new AdapterError(`Solarman token request failed: ${res.status}`, 'deye')

  const data = (await res.json()) as { access_token?: string; msg?: string }
  if (!data.access_token) throw new AdapterError(`Solarman auth failed: ${data.msg ?? 'no token'}`, 'deye')

  return data.access_token
}

function mapDeviceState(state: number | undefined): DeviceState {
  switch (state) {
    case 1: return 'online'
    case 2: return 'offline'
    case 3: return 'fault'
    default: return 'unknown'
  }
}

function findDataValue(datalist: Array<{ key: string; value: string }>, key: string): number | null {
  const entry = datalist.find((d) => d.key === key)
  if (!entry || entry.value === '' || entry.value === '--') return null
  const n = parseFloat(entry.value)
  return isNaN(n) ? null : n
}

export const solarmanAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null): Promise<NormalisedReading> {
    const { app_id, app_secret, username, password } = credentials
    if (!app_id || !app_secret || !username || !password) {
      throw new AdapterError('Solarman credentials incomplete (need app_id, app_secret, username, password)', 'deye', false)
    }

    const token = await getToken(app_id, app_secret, username, password)

    // Fetch station realtime data
    const stationRes = await fetch(`${BASE_URL}/station/v1.0/realTime?language=en`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stationId: Number(plantId) }),
    })

    if (!stationRes.ok) throw new AdapterError(`Solarman station fetch failed: ${stationRes.status}`, 'deye')
    const station = (await stationRes.json()) as {
      generationPower?: number
      batteryPower?: number
      gridPower?: number
      purchasePower?: number
      usePower?: number
      batterySoc?: number
      batteryCapacitySoc?: number
      deviceListItems?: Array<{
        deviceSn: string
        deviceState: number
        dataList?: Array<{ key: string; value: string }>
      }>
    }

    const device = station.deviceListItems?.[0]
    const datalist = device?.dataList ?? []

    // Extract per-string data (Solarman keys: DC_Voltage_PV1, DC_Current_PV1, etc.)
    const pvStrings: PvString[] = []
    for (let i = 1; i <= 4; i++) {
      const v = findDataValue(datalist, `DC_Voltage_PV${i}`)
      const a = findDataValue(datalist, `DC_Current_PV${i}`)
      if (v !== null || a !== null) {
        pvStrings.push({
          string: i,
          voltage_v: v,
          current_a: a,
          power_w: v !== null && a !== null ? Math.round(v * a) : null,
        })
      }
    }

    const faultCodes: string[] = []
    const faultVal = findDataValue(datalist, 'Fault_Code')
    if (faultVal !== null && faultVal !== 0) faultCodes.push(`F${faultVal}`)

    return {
      recorded_at: new Date().toISOString(),
      pv_power_w: station.generationPower != null ? station.generationPower * 1000 : null,
      battery_power_w: station.batteryPower != null ? station.batteryPower * 1000 : null,
      grid_power_w: station.purchasePower != null ? station.purchasePower * 1000 : null,
      load_power_w: station.usePower != null ? station.usePower * 1000 : null,
      battery_soc_pct: station.batterySoc ?? station.batteryCapacitySoc ?? null,
      battery_voltage_v: findDataValue(datalist, 'Battery_Voltage'),
      grid_frequency_hz: findDataValue(datalist, 'Grid_Frequency'),
      inverter_temp_c: findDataValue(datalist, 'DC_Temperature') ?? findDataValue(datalist, 'Temperature'),
      pv_strings: pvStrings,
      fault_codes: faultCodes,
      device_state: mapDeviceState(device?.deviceState),
      raw_payload: station as Record<string, unknown>,
    }
  },
}
