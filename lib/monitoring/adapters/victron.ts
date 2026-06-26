/**
 * Victron Energy adapter — uses the VRM Portal API.
 * Docs: https://vrm-api-docs.victronenergy.com/
 * Auth: Personal Access Token (generate in VRM portal: Preferences → Integrations)
 * Base URL: https://vrmapi.victronenergy.com/v2
 * Rate limit: ~2 req/sec (undocumented, be conservative)
 *
 * Live values come from the `/diagnostics` endpoint, whose "System overview"
 * device exposes the consolidated flow values (PV, battery, grid, load, SOC) in
 * one call. NOTE: the bare `GET /installations/{id}` endpoint does NOT exist —
 * it returns HTTP 400 — so we must use a sub-resource like /diagnostics.
 */
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://vrmapi.victronenergy.com/v2'

/** One row from VRM /diagnostics — the latest value of a single data attribute. */
interface VrmDiagRecord {
  Device: string
  instance: number
  code: string
  description: string
  rawValue: number | string | null
  formattedValue: string | null
}

/** Coerce a VRM rawValue (number | numeric-string | other) to a number or null. */
function numOrNull(v: number | string | null | undefined): number | null {
  if (typeof v === 'number') return v
  if (v != null && v !== '' && !isNaN(Number(v))) return Number(v)
  return null
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

    // Single call: the latest value of every data attribute for this site.
    const res = await fetch(`${BASE_URL}/installations/${installId}/diagnostics?count=1000`, { headers })
    if (!res.ok) {
      throw new AdapterError(`Victron diagnostics fetch failed: ${res.status}`, 'victron')
    }

    const json = (await res.json()) as { success?: boolean; records?: VrmDiagRecord[] }
    const records = json.records ?? []

    /** Latest value of a System-overview attribute by its VRM code. */
    function sysVal(code: string): number | null {
      const r = records.find((x) => x.code === code && x.Device === 'System overview')
      return r ? numOrNull(r.rawValue) : null
    }

    // Consolidated flow values (System overview device, instance 0).
    const pvPower   = sysVal('Pdc')  // PV - DC-coupled (total PV watts)
    const batPower  = sysVal('bp')   // Battery Power: + charging, − discharging
    const gridPower = sysVal('g1')   // Grid L1
    const loadPower = sysVal('a1')   // AC Consumption L1
    const soc       = sysVal('bs')   // Battery SOC %
    const batVolt   = sysVal('bv')   // Battery voltage

    // Grid frequency from VE.Bus output frequency, if reported.
    const ofRec = records.find((x) => x.code === 'OF')
    const gridFreq = ofRec ? numOrNull(ofRec.rawValue) : null

    // Per-MPPT PV strings from each Solar Charger (PVP power, PVV voltage, ScI current).
    const pvStrings: PvString[] = []
    let stringIdx = 1
    for (const r of records) {
      if (r.code === 'PVP' && r.Device === 'Solar Charger' && r.rawValue != null) {
        const volt = records.find((x) => x.code === 'PVV' && x.Device === 'Solar Charger' && x.instance === r.instance)
        const curr = records.find((x) => x.code === 'ScI' && x.Device === 'Solar Charger' && x.instance === r.instance)
        pvStrings.push({
          string: stringIdx++,
          voltage_v: volt ? numOrNull(volt.rawValue) : null,
          current_a: curr ? numOrNull(curr.rawValue) : null,
          power_w: numOrNull(r.rawValue),
        })
      }
    }

    // Active alarms: numeric alarm attributes with a non-zero value.
    const faultCodes: string[] = []
    for (const r of records) {
      if (/alarm/i.test(r.description) && typeof r.rawValue === 'number' && r.rawValue > 0) {
        faultCodes.push(r.description)
      }
    }

    // We received live values → online. (VRM diagnostics returns last-known data,
    // so treat "no consolidated values at all" as unknown rather than offline.)
    const deviceState: DeviceState =
      soc != null || pvPower != null || batPower != null ? 'online' : 'unknown'

    return {
      recorded_at:       new Date().toISOString(),
      pv_power_w:        pvPower,
      battery_power_w:   batPower,
      grid_power_w:      gridPower,
      load_power_w:      loadPower,
      battery_soc_pct:   soc,
      battery_voltage_v: batVolt,
      grid_frequency_hz: gridFreq,
      inverter_temp_c:   null,  // not exposed as a clean inverter temp in diagnostics
      pv_strings:        pvStrings,
      fault_codes:       faultCodes,
      device_state:      deviceState,
      raw_payload:       { source: 'diagnostics', system_overview: records.filter((x) => x.Device === 'System overview') } as Record<string, unknown>,
    }
  },
}
