/**
 * Growatt adapter — uses the Growatt V1 API.
 * Docs: https://growatt.pl/wp-content/uploads/2020/01/Growatt-Server-API-Guide.pdf
 * Auth: API token (generate in web UI: Settings → Account Management → API Key)
 * Base URL: server.growatt.com
 * Rate limit: relaxed on V1 API (avoid classic API — 24h lockout on excess)
 */
import { createHash } from 'crypto'
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://server.growatt.com'

function hashPassword(password: string): string {
  return createHash('md5').update(password).digest('hex')
}

async function login(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({
    account: username,
    password: hashPassword(password),
  })
  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new AdapterError(`Growatt login request failed: ${res.status}`, 'growatt')
  const data = (await res.json()) as { result?: number; msg?: string; back?: { header?: { csrf_token?: string } } }
  if (data.result !== 1) throw new AdapterError(`Growatt login failed: ${data.msg ?? 'unknown'}`, 'growatt')
  // Extract session cookie from headers — Growatt uses cookie-based session
  const setCookie = res.headers.get('set-cookie') ?? ''
  const session = setCookie.match(/JSESSIONID=([^;]+)/)?.[1]
  if (!session) throw new AdapterError('Growatt: no session cookie returned', 'growatt')
  return session
}

function mapDeviceStatus(status: string | number | undefined): DeviceState {
  const s = String(status ?? '').toLowerCase()
  if (s === '1' || s === 'normal' || s === 'generating') return 'online'
  if (s === '0' || s === 'offline' || s === 'disconnect') return 'offline'
  if (s === '2' || s === 'fault') return 'fault'
  if (s === '3' || s === 'standby') return 'standby'
  return 'unknown'
}

export const growattAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null): Promise<NormalisedReading> {
    const { username, password, api_token } = credentials

    if (!plantId) throw new AdapterError('Growatt requires plant_id', 'growatt', false)

    // Use API token if available (preferred), otherwise fall back to session login
    let headers: HeadersInit
    if (api_token) {
      headers = { token: api_token, 'Content-Type': 'application/json' }
    } else if (username && password) {
      const session = await login(username, password)
      headers = { Cookie: `JSESSIONID=${session}`, 'Content-Type': 'application/json' }
    } else {
      throw new AdapterError('Growatt credentials incomplete (need api_token or username+password)', 'growatt', false)
    }

    // Fetch plant data
    const res = await fetch(`${BASE_URL}/panel/getDevicesByPlantList?plantId=${plantId}&currPage=1`, {
      headers,
    })
    if (!res.ok) throw new AdapterError(`Growatt plant fetch failed: ${res.status}`, 'growatt')

    const body = (await res.json()) as {
      result?: number
      obj?: {
        datas?: Array<{
          deviceSn?: string
          status?: string | number
          pac?: number          // current AC power (W)
          ppv?: number          // PV power (W)
          batterySOC?: number
          vac?: number          // AC voltage
          frequency?: number
          temperature?: number
          epvToday?: number
          vpv1?: number; ipv1?: number
          vpv2?: number; ipv2?: number
          vpv3?: number; ipv3?: number
          vpv4?: number; ipv4?: number
          pGridOutput?: number  // grid output/input
          pLocalLoad?: number   // load
          storagePpv?: number
        }>
      }
    }

    if (body.result !== 1) throw new AdapterError(`Growatt API error: result ${body.result}`, 'growatt')

    const device = body.obj?.datas?.[0]
    if (!device) throw new AdapterError('Growatt: no device data returned', 'growatt')

    const pvStrings: PvString[] = []
    for (let i = 1; i <= 4; i++) {
      const v = (device as Record<string, number | undefined>)[`vpv${i}`] ?? null
      const a = (device as Record<string, number | undefined>)[`ipv${i}`] ?? null
      if (v != null || a != null) {
        pvStrings.push({
          string: i,
          voltage_v: v,
          current_a: a,
          power_w: v != null && a != null ? Math.round(v * a) : null,
        })
      }
    }

    return {
      recorded_at:      new Date().toISOString(),
      pv_power_w:       device.ppv ?? device.storagePpv ?? null,
      battery_power_w:  null,  // Growatt doesn't cleanly separate charge/discharge in summary
      grid_power_w:     device.pGridOutput ?? null,
      load_power_w:     device.pLocalLoad ?? null,
      battery_soc_pct:  device.batterySOC ?? null,
      battery_voltage_v: null,
      grid_frequency_hz: device.frequency ?? null,
      inverter_temp_c:   device.temperature ?? null,
      pv_strings:       pvStrings,
      fault_codes:      [],
      device_state:     mapDeviceStatus(device.status),
      raw_payload:      body as Record<string, unknown>,
    }
  },
}
