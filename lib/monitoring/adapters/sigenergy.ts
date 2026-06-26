/**
 * Sigenergy adapter.
 * Developer portal: https://developer.sigencloud.com
 * Auth: username + password + plant_id → session token
 * Supports SigenStor inverters + SigenStack batteries.
 */
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState, SettingsReadResult } from '../types'
import { AdapterError } from '../types'
import { emptySettings, type InverterSettings, type WorkMode } from '../settings/types'

const BASE_URL = 'https://api.sigencloud.com'

/** Map a Sigenergy operating-mode label onto our normalised WorkMode. */
function mapSigenMode(label: string): WorkMode {
  const m = label.toLowerCase()
  if (m.includes('self') || m.includes('consum')) return 'self_use'
  if (m.includes('backup') || m.includes('ups'))  return 'backup'
  if (m.includes('feed') || m.includes('export'))  return 'feed_in_priority'
  if (m.includes('tou') || m.includes('time'))     return 'time_of_use'
  if (m.includes('peak'))                          return 'peak_shaving'
  if (m.includes('manual') || m.includes('command')) return 'manual'
  return 'unknown'
}

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

  /**
   * Read the plant's energy-management settings. NOTE: the SigenCloud settings
   * endpoint + field names are not publicly documented, so this is PROVISIONAL —
   * it fetches the plant setting resource and maps fields by name-pattern across
   * the returned object (one + two levels deep), returning whatever it can match.
   * Verify the first live read; it fails safe (partial/empty) rather than throwing.
   */
  async fetchSettings(credentials: BrandCredentials, plantId: string | null): Promise<SettingsReadResult> {
    const { username, password } = credentials
    if (!username || !password || !plantId) {
      throw new AdapterError('Sigenergy credentials incomplete (need username, password, and plant_id)', 'sigenergy', false)
    }

    const token = await getToken(username, password)
    const res = await fetch(`${BASE_URL}/plant/setting?plantId=${plantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new AdapterError(`Sigenergy settings fetch failed: ${res.status}`, 'sigenergy')

    const body = (await res.json()) as { data?: Record<string, unknown>; msg?: string }

    // Flatten the data object one level so nested config groups are reachable.
    const flat: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body.data ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) flat[k2] = v2
      } else {
        flat[k] = v
      }
    }

    const num = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null
      if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
      return null
    }
    const bool = (v: unknown): boolean | null => {
      if (typeof v === 'boolean') return v
      if (v === 1 || v === '1') return true
      if (v === 0 || v === '0') return false
      if (typeof v === 'string') {
        if (/^(on|enabled|yes|true)$/i.test(v)) return true
        if (/^(off|disabled|no|false)$/i.test(v)) return false
      }
      return null
    }
    const find = (re: RegExp): unknown => {
      for (const [k, v] of Object.entries(flat)) if (re.test(k)) return v
      return undefined
    }

    const settings: InverterSettings = emptySettings()

    const mode = find(/work.?mode|operation.?mode|energy.?mode|runmode|controlmode/i)
    if (typeof mode === 'string') settings.workMode = mapSigenMode(mode)
    else if (num(mode) != null) settings.workMode = 'unknown'  // numeric enum we can't name

    const minSoc = num(find(/min.?soc|reserve.?soc|backup.?soc|discharge.?limit|lower.?soc/i))
    if (minSoc != null) settings.batteryMinSocPct = minSoc
    const maxSoc = num(find(/max.?soc|charge.?limit|upper.?soc/i))
    if (maxSoc != null) settings.batteryMaxSocPct = maxSoc
    const backup = num(find(/backup.?(reserve|soc)|ups.?soc/i))
    if (backup != null) settings.backupReserveSocPct = backup

    const exportEnabled = bool(find(/export|feed.?in|grid.?sell/i))
    if (exportEnabled != null) settings.exportEnabled = exportEnabled
    const exportLimit = num(find(/export.?(limit|power)|feed.?in.?(limit|power)|max.?sell/i))
    if (exportLimit != null) settings.exportLimitW = exportLimit

    const gridCharge = bool(find(/grid.?charge|charge.?from.?grid/i))
    if (gridCharge != null) settings.gridChargeEnabled = gridCharge

    const maxChargeP = num(find(/max.?charge.?power/i))
    if (maxChargeP != null) settings.maxChargePowerW = maxChargeP
    const maxDischargeP = num(find(/max.?discharge.?power/i))
    if (maxDischargeP != null) settings.maxDischargePowerW = maxDischargeP

    return { settings, raw: body as Record<string, unknown> }
  },
}
