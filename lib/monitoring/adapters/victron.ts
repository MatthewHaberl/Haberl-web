/**
 * Victron Energy adapter — uses the VRM Portal API.
 * Docs: https://vrm-api-docs.victronenergy.com/
 * Auth: Personal Access Token (generate in VRM portal: Preferences → Integrations)
 * Base URL: https://vrmapi.victronenergy.com/v2
 * Rate limit: ~2 req/sec (undocumented, be conservative)
 */
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://vrmapi.victronenergy.com/v2'

function mapVrmState(state: number | undefined): DeviceState {
  // VRM connection state: 1=online, 0=offline
  if (state === 1) return 'online'
  if (state === 0) return 'offline'
  return 'unknown'
}

interface VrmAttribute {
  idDataAttribute: number
  description: string
  formatWithUnit: string
  rawValue: number | null
  timestamp: number
}

export const victronAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null): Promise<NormalisedReading> {
    const { access_token, vrm_installation_id } = credentials
    const installId = vrm_installation_id ?? plantId

    if (!access_token || !installId) {
      throw new AdapterError(
        'Victron credentials incomplete (need access_token and vrm_installation_id / plant_id)',
        'victron', false
      )
    }

    const headers: HeadersInit = {
      'X-Authorization': `Token ${access_token}`,
      'Content-Type': 'application/json',
    }

    // Fetch installation overview (online status + site stats)
    const [overviewRes, dataRes] = await Promise.all([
      fetch(`${BASE_URL}/installations/${installId}`, { headers }),
      fetch(`${BASE_URL}/installations/${installId}/widgets/Graph?attributeCodes[]=Pdc&attributeCodes[]=Pac&attributeCodes[]=SOC&attributeCodes[]=BatteryVoltage&attributeCodes[]=GridPower&attributeCodes[]=AcConsumption&attributeCodes[]=PvPower`, { headers }),
    ])

    if (!overviewRes.ok) throw new AdapterError(`Victron installation fetch failed: ${overviewRes.status}`, 'victron')
    if (!dataRes.ok) throw new AdapterError(`Victron data fetch failed: ${dataRes.status}`, 'victron')

    const overview = (await overviewRes.json()) as {
      records?: {
        idSite?: number
        name?: string
        current_time?: string
        timezone?: string
        alarm?: boolean
        alarm_monitoring?: boolean
        gs?: { last_timestamp?: number; relay?: number }
        extended?: VrmAttribute[]
      }
    }

    const data = (await dataRes.json()) as {
      records?: {
        data?: Record<string, { rawValue: number | null }[]>
      }
    }

    const rec = overview.records
    const connectionState = rec?.gs?.relay

    // Extract latest values from the widget data
    function latestVal(key: string): number | null {
      const arr = data.records?.data?.[key]
      if (!arr?.length) return null
      const last = arr[arr.length - 1]
      return last?.rawValue ?? null
    }

    // Victron PV power breakdown — try to get per-MPPT data from extended attributes
    const pvStrings: PvString[] = []
    const extended = rec?.extended ?? []
    let mpptIndex = 1
    for (const attr of extended) {
      if (attr.description?.toLowerCase().includes('pv power') && attr.rawValue != null) {
        pvStrings.push({
          string: mpptIndex++,
          voltage_v: null,  // VRM widget doesn't give per-MPPT voltage easily
          current_a: null,
          power_w: attr.rawValue,
        })
      }
    }

    const pvPower   = latestVal('PvPower')
    const acConsump = latestVal('AcConsumption')
    const gridPower = latestVal('GridPower')
    const soc       = latestVal('SOC')
    const batVolt   = latestVal('BatteryVoltage')
    // Battery power: positive = charging (from PV or grid), negative = discharging
    const batPower  = latestVal('Pdc')

    const faultCodes: string[] = []
    if (rec?.alarm) faultCodes.push('ALARM')

    return {
      recorded_at:       new Date().toISOString(),
      pv_power_w:        pvPower,
      battery_power_w:   batPower,
      grid_power_w:      gridPower,
      load_power_w:      acConsump,
      battery_soc_pct:   soc,
      battery_voltage_v: batVolt,
      grid_frequency_hz: null,  // not in standard VRM widget
      inverter_temp_c:   null,
      pv_strings:        pvStrings,
      fault_codes:       faultCodes,
      device_state:      mapVrmState(connectionState),
      raw_payload:       { overview: rec, data: data.records } as Record<string, unknown>,
    }
  },
}
