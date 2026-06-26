/**
 * FoxESS adapter — uses the official FoxESS Open API.
 * Docs: https://www.foxesscloud.com/public/i18n/en/OpenApiDocument.html
 * Auth: API Key in header (X-Access-Key or token param)
 * Rate limit: 1,440 calls / day per device (~1/min), 1 call/sec query limit
 */
import { createHash } from 'crypto'
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState, SettingsReadResult } from '../types'
import { AdapterError } from '../types'
import { emptySettings, type InverterSettings, type WorkMode } from '../settings/types'

const BASE_URL = 'https://www.foxesscloud.com/op/v0'

function buildHeaders(apiKey: string, path: string): HeadersInit {
  const timestamp = Date.now().toString()
  const signature = createHash('md5')
    .update(`${apiKey}\\${path}\\${timestamp}`)
    .digest('hex')

  return {
    'Content-Type': 'application/json',
    token: apiKey,
    timestamp,
    signature,
    lang: 'en',
  }
}

function mapWorkMode(mode: string | undefined): DeviceState {
  if (!mode) return 'unknown'
  const m = mode.toLowerCase()
  if (m.includes('fault') || m.includes('error')) return 'fault'
  if (m.includes('standby') || m.includes('idle'))  return 'standby'
  if (m.includes('off') || m.includes('sleep'))      return 'offline'
  return 'online'
}

/** POST a FoxESS Open API endpoint and return the parsed JSON body (or throw). */
async function postFox(apiKey: string, path: string, body: Record<string, unknown>): Promise<{ errno?: number; msg?: string; result?: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(apiKey, path),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new AdapterError(`FoxESS ${path} failed: ${res.status}`, 'foxess')
  return (await res.json()) as { errno?: number; msg?: string; result?: unknown }
}

/** Map a FoxESS work-mode string onto our normalised WorkMode. */
function normaliseWorkMode(raw: string | undefined | null): WorkMode | null {
  if (!raw) return null
  const m = raw.toLowerCase().replace(/[\s_-]/g, '')
  if (m.includes('selfuse') || m.includes('selfconsumption')) return 'self_use'
  if (m.includes('feedin')) return 'feed_in_priority'
  if (m.includes('backup'))  return 'backup'
  if (m.includes('peakshaving')) return 'peak_shaving'
  if (m.includes('forcecharge') || m.includes('forcedischarge') || m.includes('manual')) return 'manual'
  return 'unknown'
}

export const foxessAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, _plantId: string | null, deviceSn: string | null): Promise<NormalisedReading> {
    const { api_key } = credentials
    if (!api_key || !deviceSn) {
      throw new AdapterError('FoxESS credentials incomplete (need api_key and device_sn)', 'foxess', false)
    }

    const path = '/device/real/query'
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: buildHeaders(api_key, path),
      body: JSON.stringify({
        sn: deviceSn,
        variables: [
          'pvPower','pv1Power','pv2Power','pv3Power','pv4Power',
          'pv1Volt','pv2Volt','pv3Volt','pv4Volt',
          'pv1Current','pv2Current','pv3Current','pv4Current',
          'batChargePower','batDischargePower','SoC',
          'batVolt','gridFreq','invTempInner',
          'loadsPower','gridConsumptionPower','generationPower',
          'feedinPower','workMode',
        ],
      }),
    })

    if (!res.ok) throw new AdapterError(`FoxESS real query failed: ${res.status}`, 'foxess')

    const body = (await res.json()) as {
      errno?: number
      msg?: string
      result?: Array<{
        variable: string
        unit?: string
        value?: number
        valueText?: string
      }>
    }

    if (body.errno !== 0) {
      throw new AdapterError(`FoxESS API error ${body.errno}: ${body.msg}`, 'foxess', body.errno !== 41001)
    }

    const vals = new Map<string, number | null>()
    const textVals = new Map<string, string>()
    for (const item of body.result ?? []) {
      vals.set(item.variable, item.value ?? null)
      if (item.valueText) textVals.set(item.variable, item.valueText)
    }

    function w(key: string) { return vals.get(key) ?? null }

    // FoxESS: batChargePower when charging, batDischargePower when discharging
    const chargeP  = w('batChargePower')  ?? 0
    const dischargeP = w('batDischargePower') ?? 0
    const batteryPowerW = chargeP > 0 ? chargeP * 1000 : -(dischargeP * 1000)

    // Grid: gridConsumptionPower (import) vs feedinPower (export)
    const gridImport = w('gridConsumptionPower') ?? 0
    const gridExport = w('feedinPower') ?? 0
    const gridPowerW = gridImport > 0 ? gridImport * 1000 : -(gridExport * 1000)

    const pvStrings: PvString[] = []
    for (let i = 1; i <= 4; i++) {
      const v = w(`pv${i}Volt`)
      const a = w(`pv${i}Current`)
      const p = w(`pv${i}Power`)
      if (v !== null || a !== null || p !== null) {
        pvStrings.push({
          string: i,
          voltage_v: v,
          current_a: a,
          power_w:   p != null ? p * 1000 : (v != null && a != null ? Math.round(v * a) : null),
        })
      }
    }

    const workMode = textVals.get('workMode')
    const deviceState = mapWorkMode(workMode)

    return {
      recorded_at:       new Date().toISOString(),
      pv_power_w:        w('pvPower') != null ? (w('pvPower')! * 1000) : null,
      battery_power_w:   batteryPowerW,
      grid_power_w:      gridPowerW,
      load_power_w:      w('loadsPower') != null ? (w('loadsPower')! * 1000) : null,
      battery_soc_pct:   w('SoC'),
      battery_voltage_v: w('batVolt'),
      grid_frequency_hz: w('gridFreq'),
      inverter_temp_c:   w('invTempInner'),
      pv_strings:        pvStrings,
      fault_codes:       [],
      device_state:      deviceState,
      raw_payload:       body as Record<string, unknown>,
    }
  },

  /**
   * Read the inverter's current settings. FoxESS exposes a few dedicated config
   * endpoints; we read each independently and tolerate partial failure so one
   * unsupported key (firmware-dependent) never blocks the rest. The battery SoC
   * limits are the most reliable; work mode / export limit are best-effort and
   * should be confirmed before trusting them for a write.
   */
  async fetchSettings(credentials: BrandCredentials, _plantId: string | null, deviceSn: string | null): Promise<SettingsReadResult> {
    const { api_key } = credentials
    if (!api_key || !deviceSn) {
      throw new AdapterError('FoxESS credentials incomplete (need api_key and device_sn)', 'foxess', false)
    }

    const settings: InverterSettings = emptySettings()
    const raw: Record<string, unknown> = {}

    // Battery min-SoC (on-grid reserve + off-grid floor).
    try {
      const soc = await postFox(api_key, '/op/v0/device/battery/soc/get', { sn: deviceSn })
      raw.batterySoc = soc
      if (soc.errno === 0 && soc.result && typeof soc.result === 'object') {
        const r = soc.result as { minSoc?: number; minSocOnGrid?: number; maxSoc?: number }
        if (typeof r.minSocOnGrid === 'number') settings.batteryMinSocPct = r.minSocOnGrid
        else if (typeof r.minSoc === 'number')  settings.batteryMinSocPct = r.minSoc
        if (typeof r.maxSoc === 'number')        settings.batteryMaxSocPct = r.maxSoc
      }
    } catch (e) { raw.batterySocError = e instanceof Error ? e.message : String(e) }

    // Work mode + export limit via the generic setting/get. Keys are
    // firmware-dependent, so each is attempted independently and ignored on error.
    const scalarKeys: Array<{ key: string; apply: (v: string) => void }> = [
      { key: 'WorkMode',    apply: (v) => { settings.workMode = normaliseWorkMode(v) } },
      { key: 'ExportLimit', apply: (v) => { const n = Number(v); if (Number.isFinite(n)) settings.exportLimitW = n } },
    ]
    const settingResults: Record<string, unknown> = {}
    for (const { key, apply } of scalarKeys) {
      try {
        const r = await postFox(api_key, '/op/v0/device/setting/get', { sn: deviceSn, key })
        settingResults[key] = r
        if (r.errno === 0 && r.result && typeof r.result === 'object') {
          const val = (r.result as { value?: unknown }).value
          if (val != null) apply(String(val))
        }
      } catch (e) { settingResults[`${key}Error`] = e instanceof Error ? e.message : String(e) }
    }
    raw.settings = settingResults

    // exportEnabled is inferred from the export limit when we got one.
    if (settings.exportLimitW != null) settings.exportEnabled = settings.exportLimitW > 0

    return { settings, raw }
  },
}
