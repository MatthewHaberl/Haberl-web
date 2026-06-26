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
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState, SettingsReadResult } from '../types'
import { AdapterError } from '../types'
import { emptySettings, type InverterSettings, type WorkMode } from '../settings/types'

const BASE_URL = 'https://vrmapi.victronenergy.com/v2'

/** Map a VRM ESS-mode label onto our normalised WorkMode. */
function mapEssMode(label: string): WorkMode {
  const m = label.toLowerCase()
  if (m.includes('keep') && m.includes('charg')) return 'backup'        // "Keep batteries charged"
  if (m.includes('optimiz') || m.includes('self'))  return 'self_use'   // "Optimized (with/without BatteryLife)"
  if (m.includes('external'))                       return 'manual'      // "External control"
  return 'unknown'
}

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

// ── Historical stats ───────────────────────────────────────────────────
// VRM serves a per-attribute time series at:
//   GET /v2/installations/{id}/stats?type=custom&interval=15mins
//        &start={epochSec}&end={epochSec}&attributeCodes[]=...
// 15 minutes is the finest interval VRM exposes (the CSV data-download is the
// same resolution); true 1-min/1-sec only lives on the on-site GX device.
// stats attributeCodes share the data-attribute namespace as /diagnostics, so
// we request the same consolidated codes the realtime adapter already reads.
const HISTORY_CODES: Record<string, keyof Pick<
  NormalisedReading,
  'pv_power_w' | 'battery_power_w' | 'grid_power_w' | 'load_power_w' | 'battery_soc_pct' | 'battery_voltage_v'
>> = {
  Pdc: 'pv_power_w',
  bp:  'battery_power_w',
  g1:  'grid_power_w',
  a1:  'load_power_w',
  bs:  'battery_soc_pct',
  bv:  'battery_voltage_v',
}

/** VRM stats records: { code: [[ts, value], ...] }. ts is epoch sec or ms. */
type VrmStatsRecords = Record<string, Array<[number, number | null]> | undefined>

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

  async fetchHistory(
    credentials: BrandCredentials,
    plantId: string | null,
    _deviceSn: string | null,
    dayStartUtc: Date,
  ): Promise<NormalisedReading[]> {
    const { access_token, vrm_installation_id } = credentials
    const installId = vrm_installation_id ?? plantId
    if (!access_token || !installId) {
      throw new AdapterError('Victron credentials incomplete (need access_token + installation id)', 'victron', false)
    }

    const startSec = Math.floor(dayStartUtc.getTime() / 1000)
    const endSec = startSec + 24 * 60 * 60
    const codeParams = Object.keys(HISTORY_CODES).map((c) => `attributeCodes[]=${c}`).join('&')
    const url = `${BASE_URL}/installations/${installId}/stats?type=custom&interval=15mins&start=${startSec}&end=${endSec}&${codeParams}`

    const res = await fetch(url, {
      headers: { 'X-Authorization': `Token ${access_token}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new AdapterError(`Victron stats fetch failed: ${res.status}`, 'victron')

    const json = (await res.json()) as { success?: boolean; records?: VrmStatsRecords }
    const records = json.records ?? {}

    // Pivot per-attribute series into one reading per 15-min timestamp.
    const byTime = new Map<number, NormalisedReading>()
    for (const [code, field] of Object.entries(HISTORY_CODES)) {
      const series = records[code]
      if (!Array.isArray(series)) continue
      for (const point of series) {
        if (!Array.isArray(point)) continue
        const [rawTs, value] = point
        if (rawTs == null || value == null) continue
        const ms = rawTs < 1e12 ? rawTs * 1000 : rawTs   // accept sec or ms
        let reading = byTime.get(ms)
        if (!reading) {
          reading = {
            recorded_at: new Date(ms).toISOString(),
            pv_power_w: null, battery_power_w: null, grid_power_w: null, load_power_w: null,
            battery_soc_pct: null, battery_voltage_v: null, grid_frequency_hz: null,
            inverter_temp_c: null, pv_strings: [], fault_codes: [],
            device_state: 'online', raw_payload: { source: 'stats' },
          }
          byTime.set(ms, reading)
        }
        reading[field] = typeof value === 'number' ? value : null
      }
    }

    return [...byTime.values()].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  },

  /**
   * Read the system's ESS configuration from VRM. The same /diagnostics payload
   * the live read uses also carries the ESS *settings* as named records (when
   * the ESS assistant is installed) — Minimum SOC, ESS mode, grid feed-in,
   * max charge/discharge. We match on each record's human description rather
   * than VRM short codes (which change), and return whatever is present.
   * Note: full Victron control (writing these) is local Modbus on the GX, not
   * VRM — so this is read-only; changes are made on the inverter/Cerbo.
   */
  async fetchSettings(credentials: BrandCredentials, plantId: string | null): Promise<SettingsReadResult> {
    const { access_token, vrm_installation_id } = credentials
    const installId = vrm_installation_id ?? plantId
    if (!access_token || !installId) {
      throw new AdapterError('Victron credentials incomplete (need access_token and installation id)', 'victron', false)
    }

    const res = await fetch(`${BASE_URL}/installations/${installId}/diagnostics?count=1000`, {
      headers: { 'X-Authorization': `Token ${access_token}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new AdapterError(`Victron diagnostics fetch failed: ${res.status}`, 'victron')

    const json = (await res.json()) as { records?: VrmDiagRecord[] }
    const records = json.records ?? []
    const settings: InverterSettings = emptySettings()

    const find = (re: RegExp) => records.find((r) => re.test(r.description ?? ''))
    const asBool = (r: VrmDiagRecord | undefined): boolean | null => {
      if (!r) return null
      const f = (r.formattedValue ?? '').toLowerCase()
      if (/\b(on|enabled|yes|true)\b|^1$/.test(f)) return true
      if (/\b(off|disabled|no|false)\b|^0$/.test(f)) return false
      const n = numOrNull(r.rawValue)
      return n == null ? null : n > 0
    }
    // Watts from a record, honouring a "kW" formatted unit.
    const asWatts = (r: VrmDiagRecord | undefined): number | null => {
      if (!r) return null
      const n = numOrNull(r.rawValue)
      if (n == null) return null
      return /kw/i.test(r.formattedValue ?? '') ? Math.round(n * 1000) : Math.round(n)
    }

    // Minimum SOC (the reserve floor). "Active SOC limit" is the effective one.
    const minSoc = find(/active soc limit/i) ?? find(/minimum (soc|state of charge)|min\.? ?soc/i)
    if (minSoc) settings.batteryMinSocPct = numOrNull(minSoc.rawValue)

    // ESS mode → work mode.
    const ess = find(/ess.*(state|mode)|battery ?life|keep batteries charged|optimiz/i)
    if (ess) settings.workMode = mapEssMode(ess.formattedValue ?? String(ess.rawValue ?? ''))

    // Grid feed-in (export) enable + limit.
    const feed = find(/feed-?in.*(excess|enabled)|grid feed-?in(?!.*limit)/i)
    if (feed) settings.exportEnabled = asBool(feed)
    const feedLimit = find(/(max(imum)?).*feed-?in|feed-?in.*(limit|power)/i)
    if (feedLimit) settings.exportLimitW = asWatts(feedLimit)

    // Charge / discharge limits.
    const mcc = find(/max(imum)? charge current/i)
    if (mcc) settings.maxChargeCurrentA = numOrNull(mcc.rawValue)
    const mcp = find(/max(imum)? charge power/i)
    if (mcp) settings.maxChargePowerW = asWatts(mcp)
    const mdp = find(/max(imum)? discharge power/i)
    if (mdp) settings.maxDischargePowerW = asWatts(mdp)

    return {
      settings,
      raw: {
        source: 'diagnostics',
        settingsRecords: records.filter((r) =>
          /soc|ess|feed-?in|charge|discharge|battery ?life|grid setpoint/i.test(r.description ?? '')),
      },
    }
  },
}
