/**
 * GoodWe adapter — uses the SEMS Portal API.
 * Docs: https://community.goodwe.com/static/images/2024-08-20597794.pdf
 * Auth: CrossLogin endpoint (username + password → token)
 * Note: GoodWe requires a supplier agreement for API access.
 *       Contact service@goodwe.com to request API credentials.
 * Data freshness: updates every 10 seconds
 */
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://www.semsportal.com/api'

interface SemsTokenResponse {
  data?: {
    token?: string
    uid?: string
    timestamp?: number
    client?: string
    version?: string
    language?: string
  }
  msg?: string
  code?: number
}

async function getToken(account: string, password: string): Promise<{ token: string; uid: string }> {
  const res = await fetch(`${BASE_URL}/v2/Common/CrossLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: '{"version":"v2.1.0","client":"web","language":"en"}' },
    body: JSON.stringify({ account, pwd: password }),
  })
  if (!res.ok) throw new AdapterError(`GoodWe login failed: ${res.status}`, 'goodwe')

  const body = (await res.json()) as SemsTokenResponse
  const token = body.data?.token
  const uid   = body.data?.uid
  if (!token || !uid) throw new AdapterError(`GoodWe auth failed: ${body.msg ?? 'no token'}`, 'goodwe')

  return { token, uid }
}

function mapPowerStation(status: number | undefined): DeviceState {
  switch (status) {
    case 1: return 'online'
    case 2: return 'offline'
    case 3: return 'fault'
    default: return 'unknown'
  }
}

export const goodweAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null): Promise<NormalisedReading> {
    const { account, password } = credentials

    if (!account || !password || !plantId) {
      throw new AdapterError(
        'GoodWe credentials incomplete (need account, password, and plant_id). Also requires supplier API agreement.',
        'goodwe', false
      )
    }

    const { token, uid } = await getToken(account, password)
    const tokenHeader = JSON.stringify({ version: 'v2.1.0', client: 'web', language: 'en', token, uid })

    // Fetch power station overview
    const res = await fetch(`${BASE_URL}/v2/PowerStation/GetMonitorDetailByPowerstationId`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: tokenHeader },
      body: JSON.stringify({ powerStationId: plantId }),
    })

    if (!res.ok) throw new AdapterError(`GoodWe station detail failed: ${res.status}`, 'goodwe')

    const body = (await res.json()) as {
      msg?: string
      code?: number
      data?: {
        kpi?: {
          pac?: number          // current AC power kW
          power?: number        // alternative field
          e_day?: number        // today kWh
          e_month?: number
          e_total?: number
          load?: number         // load power kW
          grid?: number         // grid power kW (+ import, - export)
          battery?: number      // battery power kW
          soc?: number          // battery SOC %
        }
        inverter?: Array<{
          invert_full?: {
            status?: number
            tempperature?: number  // yes, typo in their API
            vpv1?: number; ipv1?: number; ppv1?: number
            vpv2?: number; ipv2?: number; ppv2?: number
            vpv3?: number; ipv3?: number; ppv3?: number
            vpv4?: number; ipv4?: number; ppv4?: number
            vac1?: number; fac1?: number
            eday?: number
            bat_volt?: number
          }
          error_codes?: string
        }>
        powerstation?: { status?: number }
      }
    }

    if (body.code !== 0 && body.code != null) {
      throw new AdapterError(`GoodWe API error ${body.code}: ${body.msg}`, 'goodwe')
    }

    const d = body.data
    if (!d) throw new AdapterError('GoodWe: empty data', 'goodwe')

    const kpi      = d.kpi
    const inverter = d.inverter?.[0]?.invert_full
    const errCode  = d.inverter?.[0]?.error_codes

    const pvStrings: PvString[] = []
    if (inverter) {
      for (let i = 1; i <= 4; i++) {
        const v = (inverter as Record<string, number | undefined>)[`vpv${i}`] ?? null
        const a = (inverter as Record<string, number | undefined>)[`ipv${i}`] ?? null
        const p = (inverter as Record<string, number | undefined>)[`ppv${i}`] ?? null
        if (v != null || a != null || p != null) {
          pvStrings.push({
            string: i,
            voltage_v: v,
            current_a: a,
            power_w: p != null ? p * 1000 : (v != null && a != null ? Math.round(v * a) : null),
          })
        }
      }
    }

    const faultCodes: string[] = errCode && errCode !== '0' ? [errCode] : []

    return {
      recorded_at:       new Date().toISOString(),
      pv_power_w:        kpi?.pac != null ? kpi.pac * 1000 : (kpi?.power != null ? kpi.power * 1000 : null),
      battery_power_w:   kpi?.battery != null ? kpi.battery * 1000 : null,
      grid_power_w:      kpi?.grid != null ? kpi.grid * 1000 : null,
      load_power_w:      kpi?.load != null ? kpi.load * 1000 : null,
      battery_soc_pct:   kpi?.soc ?? null,
      battery_voltage_v: inverter?.bat_volt ?? null,
      grid_frequency_hz: inverter?.fac1 ?? null,
      inverter_temp_c:   inverter?.tempperature ?? null,  // their typo
      pv_strings:        pvStrings,
      fault_codes:       faultCodes,
      device_state:      mapPowerStation(d.powerstation?.status),
      raw_payload:       body as Record<string, unknown>,
    }
  },
}
