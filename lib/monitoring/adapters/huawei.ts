/**
 * Huawei FusionSolar adapter — uses the Northbound API.
 * Docs: https://support.huawei.com/enterprise/en/doc/EDOC1100440661
 * Auth: Northbound username + password → xsrf-token session cookie
 * Setup: FusionSolar portal → System → Company Management → Northbound Management
 * Rate limit: Very strict — create one Northbound account per plant to avoid hitting limits.
 * Base URL: https://intl.fusionsolar.huawei.com/thirdData (international)
 */
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://intl.fusionsolar.huawei.com/thirdData'

interface HuaweiSession {
  xsrfToken: string
  cookie: string
}

async function login(username: string, systemCode: string): Promise<HuaweiSession> {
  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: username, systemCode }),
  })

  if (!res.ok) throw new AdapterError(`Huawei FusionSolar login failed: ${res.status}`, 'huawei')

  const body = (await res.json()) as { success?: boolean; failCode?: number; message?: string }
  if (!body.success) {
    throw new AdapterError(
      `Huawei FusionSolar auth failed: ${body.message ?? body.failCode ?? 'unknown'}`,
      'huawei',
      body.failCode !== 407  // 407 = rate limit, not retryable immediately
    )
  }

  const cookie   = res.headers.get('set-cookie') ?? ''
  const xsrfToken = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''

  if (!xsrfToken) throw new AdapterError('Huawei FusionSolar: no XSRF token in response', 'huawei')

  return { xsrfToken, cookie }
}

function mapHuaweiStatus(status: number | undefined): DeviceState {
  switch (status) {
    case 1:  return 'online'   // Grid-connected
    case 2:  return 'online'   // Grid-connected, power limited
    case 3:  return 'online'   // Grid-connected, self-derating
    case 256: return 'standby'
    case 512: return 'offline'
    case 513: return 'fault'
    default:  return 'unknown'
  }
}

export const huaweiAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null): Promise<NormalisedReading> {
    const { northbound_username, northbound_password, station_dn } = credentials
    const stationCode = station_dn ?? plantId

    if (!northbound_username || !northbound_password || !stationCode) {
      throw new AdapterError(
        'Huawei FusionSolar credentials incomplete (need northbound_username, northbound_password, and station_dn / plant_id)',
        'huawei', false
      )
    }

    const { xsrfToken, cookie } = await login(northbound_username, northbound_password)

    const authHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      'XSRF-TOKEN': xsrfToken,
      Cookie: cookie,
    }

    // Fetch station real-time power
    const stationRes = await fetch(`${BASE_URL}/getStationRealKpi`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ stationCodes: stationCode }),
    })

    if (!stationRes.ok) throw new AdapterError(`Huawei station KPI fetch failed: ${stationRes.status}`, 'huawei')

    const stationBody = (await stationRes.json()) as {
      success?: boolean
      failCode?: number
      message?: string
      data?: Array<{
        stationCode?: string
        dataItemMap?: {
          total_power?: number         // current PV power kW
          day_power?: number           // today kWh
          month_power?: number
          total_lifetime_energy?: number
          radiation_intensity?: number
          theoretical_yield?: number
        }
      }>
    }

    if (!stationBody.success) {
      const isRateLimit = stationBody.failCode === 407
      throw new AdapterError(
        `Huawei station KPI error: ${stationBody.message ?? stationBody.failCode}${isRateLimit ? ' (rate limit — try again later)' : ''}`,
        'huawei', !isRateLimit
      )
    }

    const stationData = stationBody.data?.[0]?.dataItemMap

    // Fetch device list for inverter-level data
    const devRes = await fetch(`${BASE_URL}/getDevList`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ stationCodes: stationCode }),
    })

    if (!devRes.ok) throw new AdapterError(`Huawei device list fetch failed: ${devRes.status}`, 'huawei')

    const devBody = (await devRes.json()) as {
      success?: boolean
      data?: Array<{ devDn?: string; devTypeId?: number; softwareVersion?: string }>
    }

    // Get the first inverter device
    const inverterDev = devBody.data?.find((d) => d.devTypeId === 1)

    let inverterKpi: Record<string, number | null> = {}
    const pvStrings: PvString[] = []

    if (inverterDev?.devDn) {
      const kpiRes = await fetch(`${BASE_URL}/getDevRealKpi`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ devDns: inverterDev.devDn, devTypeId: 1 }),
      })

      if (kpiRes.ok) {
        const kpiBody = (await kpiRes.json()) as {
          success?: boolean
          data?: Array<{
            devDn?: string
            dataItemMap?: Record<string, number | null>
          }>
        }
        inverterKpi = kpiBody.data?.[0]?.dataItemMap ?? {}

        // Huawei PV strings: pv1_u, pv1_i, pv2_u, pv2_i, pv3_u, pv3_i, pv4_u, pv4_i
        for (let i = 1; i <= 4; i++) {
          const v = inverterKpi[`pv${i}_u`] ?? null
          const a = inverterKpi[`pv${i}_i`] ?? null
          if (v != null || a != null) {
            pvStrings.push({
              string: i,
              voltage_v: v,
              current_a: a,
              power_w: v != null && a != null ? Math.round(v * a) : null,
            })
          }
        }
      }
    }

    // Huawei battery (LUNA2000) — device type 39
    const batteryDev = devBody.data?.find((d) => d.devTypeId === 39)
    let batteryKpi: Record<string, number | null> = {}

    if (batteryDev?.devDn) {
      const batRes = await fetch(`${BASE_URL}/getDevRealKpi`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ devDns: batteryDev.devDn, devTypeId: 39 }),
      })
      if (batRes.ok) {
        const batBody = (await batRes.json()) as {
          success?: boolean
          data?: Array<{ dataItemMap?: Record<string, number | null> }>
        }
        batteryKpi = batBody.data?.[0]?.dataItemMap ?? {}
      }
    }

    const inverterStatus = inverterKpi['inverter_state'] as number | undefined
    const faultCode = inverterKpi['fault_code']
    const faultCodes: string[] = faultCode != null && faultCode !== 0 ? [`F${faultCode}`] : []

    return {
      recorded_at:       new Date().toISOString(),
      pv_power_w:        stationData?.total_power != null ? stationData.total_power * 1000 : (inverterKpi['active_power'] != null ? inverterKpi['active_power']! * 1000 : null),
      battery_power_w:   batteryKpi['charge_discharge_power'] != null ? batteryKpi['charge_discharge_power']! * 1000 : null,
      grid_power_w:      inverterKpi['grid_active_power'] != null ? inverterKpi['grid_active_power']! * 1000 : null,
      load_power_w:      null,  // Huawei doesn't provide load directly — can calculate PV - grid - battery
      battery_soc_pct:   batteryKpi['battery_soc'] ?? null,
      battery_voltage_v: batteryKpi['battery_voltage'] ?? null,
      grid_frequency_hz: inverterKpi['grid_frequency'] ?? null,
      inverter_temp_c:   inverterKpi['temperature'] ?? null,
      pv_strings:        pvStrings,
      fault_codes:       faultCodes,
      device_state:      mapHuaweiStatus(inverterStatus),
      raw_payload:       { stationBody, devBody, inverterKpi, batteryKpi } as Record<string, unknown>,
    }
  },
}
