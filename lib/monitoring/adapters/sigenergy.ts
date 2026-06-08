/**
 * Sigenergy adapter.
 * Developer portal: https://developer.sigencloud.com
 * Auth: username + password + plant_id → session token
 * Supports SigenStor inverters + SigenStack batteries.
 */
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://api.sigencloud.com'

async function getToken(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new AdapterError(`Sigenergy login failed: ${res.status}`, 'sigenergy')

  const data = (await res.json()) as { data?: { access_token?: string }; msg?: string }
  const token = data.data?.access_token
  if (!token) throw new AdapterError(`Sigenergy auth failed: ${data.msg ?? 'no token'}`, 'sigenergy')
  return token
}

function mapDeviceState(status: string | undefined): DeviceState {
  switch (status?.toLowerCase()) {
    case 'online':   return 'online'
    case 'offline':  return 'offline'
    case 'fault':
    case 'alarm':    return 'fault'
    case 'standby':  return 'standby'
    default:         return 'unknown'
  }
}

export const sigenegyAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null): Promise<NormalisedReading> {
    const { username, password } = credentials
    if (!username || !password || !plantId) {
      throw new AdapterError('Sigenergy credentials incomplete (need username, password, and plant_id)', 'sigenergy', false)
    }

    const token = await getToken(username, password)

    const res = await fetch(`${BASE_URL}/plant/realtime?plantId=${plantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new AdapterError(`Sigenergy plant fetch failed: ${res.status}`, 'sigenergy')

    const body = (await res.json()) as {
      data?: {
        pvPower?: number
        batteryPower?: number
        gridPower?: number
        loadPower?: number
        batterySoc?: number
        batteryVoltage?: number
        gridFrequency?: number
        inverterTemp?: number
        deviceStatus?: string
        pvStringList?: Array<{
          stringIndex: number
          voltage?: number
          current?: number
          power?: number
        }>
        faultList?: Array<{ code: string }>
      }
      msg?: string
    }

    const d = body.data
    if (!d) throw new AdapterError(`Sigenergy empty response: ${body.msg ?? 'no data'}`, 'sigenergy')

    const pvStrings: PvString[] = (d.pvStringList ?? []).map((s) => ({
      string: s.stringIndex,
      voltage_v: s.voltage ?? null,
      current_a: s.current ?? null,
      power_w:   s.power   ?? null,
    }))

    return {
      recorded_at:      new Date().toISOString(),
      pv_power_w:       d.pvPower      ?? null,
      battery_power_w:  d.batteryPower ?? null,
      grid_power_w:     d.gridPower    ?? null,
      load_power_w:     d.loadPower    ?? null,
      battery_soc_pct:  d.batterySoc   ?? null,
      battery_voltage_v: d.batteryVoltage ?? null,
      grid_frequency_hz: d.gridFrequency  ?? null,
      inverter_temp_c:   d.inverterTemp   ?? null,
      pv_strings:       pvStrings,
      fault_codes:      (d.faultList ?? []).map((f) => f.code),
      device_state:     mapDeviceState(d.deviceStatus),
      raw_payload:      body as Record<string, unknown>,
    }
  },
}
