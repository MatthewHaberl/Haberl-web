/**
 * SolaX Power adapter — uses SolaX Cloud API.
 * Docs: https://www.solaxcloud.com/user_api/SolaxCloud_User_Monitoring_API_V6.1.pdf
 * Auth: tokenId (get from SolaxCloud portal: Service → API)
 * Rate limit: 10 req/min, 10,000 req/day
 * Data freshness: every 5 min (dongle upload interval)
 */
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://www.solaxcloud.com'

function mapInverterStatus(status: number | undefined): DeviceState {
  switch (status) {
    case 100: return 'standby'
    case 101: return 'online'    // Normal mode / generating
    case 102: return 'online'    // EPS mode
    case 103: return 'fault'
    case 104: return 'offline'   // Shutdown
    default:  return 'unknown'
  }
}

export const solaxAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, _plantId: string | null, deviceSn: string | null): Promise<NormalisedReading> {
    const { token_id, sn } = credentials
    const serialNumber = sn ?? deviceSn

    if (!token_id || !serialNumber) {
      throw new AdapterError('SolaX credentials incomplete (need token_id and sn / device_sn)', 'solax', false)
    }

    const url = `${BASE_URL}/api/v3/data/real-time?tokenId=${encodeURIComponent(token_id)}&sn=${encodeURIComponent(serialNumber)}`
    const res = await fetch(url)

    if (!res.ok) throw new AdapterError(`SolaX API request failed: ${res.status}`, 'solax')

    const body = (await res.json()) as {
      success?: boolean
      exception?: string
      result?: {
        acpower?: number         // load power W
        yieldtoday?: number      // kWh today
        yieldtotal?: number      // kWh total
        feedinpower?: number     // grid export W (positive = export)
        feedinenergy?: number
        consumeenergy?: number
        feedinpowerM2?: number
        soc?: number             // battery SOC %
        peps1?: number
        peps2?: number
        peps3?: number
        inverterStatus?: number
        powerdc1?: number        // PV string 1 power W
        powerdc2?: number        // PV string 2 power W
        powerdc3?: number
        powerdc4?: number
        batPower?: number        // battery power W (+charge/-discharge)
        uploadTime?: string
        batStatus?: number
        gridstatus?: number      // 0=normal, else fault
      }
    }

    if (!body.success) {
      throw new AdapterError(`SolaX API error: ${body.exception ?? 'unknown'}`, 'solax')
    }

    const r = body.result
    if (!r) throw new AdapterError('SolaX: empty result', 'solax')

    // SolaX: feedinpower > 0 = exporting, < 0 = importing
    // Normalise: grid_power_w > 0 = importing, < 0 = exporting
    const feedin = r.feedinpower ?? 0
    const gridPower = -feedin

    // Build PV string array from powerdc1..4
    const pvStrings: PvString[] = []
    for (let i = 1; i <= 4; i++) {
      const p = (r as Record<string, number | undefined>)[`powerdc${i}`] ?? null
      if (p != null && p > 0) {
        pvStrings.push({ string: i, voltage_v: null, current_a: null, power_w: p })
      }
    }

    const pvPower = pvStrings.reduce((sum, s) => sum + (s.power_w ?? 0), 0)

    return {
      recorded_at:       new Date().toISOString(),
      pv_power_w:        pvPower > 0 ? pvPower : null,
      battery_power_w:   r.batPower ?? null,
      grid_power_w:      gridPower,
      load_power_w:      r.acpower ?? null,
      battery_soc_pct:   r.soc ?? null,
      battery_voltage_v: null,
      grid_frequency_hz: null,
      inverter_temp_c:   null,
      pv_strings:        pvStrings,
      fault_codes:       r.inverterStatus === 103 ? ['FAULT'] : [],
      device_state:      mapInverterStatus(r.inverterStatus),
      raw_payload:       body as Record<string, unknown>,
    }
  },
}
