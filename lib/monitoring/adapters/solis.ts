/**
 * Solis/Ginlong adapter — uses SolisCloud Platform API v2.
 * Docs: https://oss.soliscloud.com/templet/SolisCloud%20Platform%20API%20Document%20V2.0.pdf
 * Auth: HMAC-SHA1 signed requests with KeyID + KeySecret
 * Credentials: get from soliscloud.com → Service → API Management → Activate
 */
import { createHmac } from 'crypto'
import type { BrandAdapter, BrandCredentials, NormalisedReading, PvString, DeviceState } from '../types'
import { AdapterError } from '../types'

const BASE_URL = 'https://www.soliscloud.com:13333'

function buildHeaders(keyId: string, keySecret: string, path: string, body: string): HeadersInit {
  const contentType = 'application/json'
  const date = new Date().toUTCString()
  const contentMd5 = Buffer.from(
    JSON.stringify({ data: body })
  ).toString('base64')

  // Solis sign string format
  const stringToSign = `POST\n${contentMd5}\n${contentType}\n${date}\n${path}`
  const signature = createHmac('sha1', keySecret)
    .update(stringToSign)
    .digest('base64')

  return {
    'Content-Type': contentType,
    Date: date,
    Authorization: `API ${keyId}:${signature}`,
  }
}

function mapSolisStatus(status: number | undefined): DeviceState {
  switch (status) {
    case 1: return 'online'
    case 2: return 'fault'
    case 3: return 'offline'
    default: return 'unknown'
  }
}

export const solisAdapter: BrandAdapter = {
  async fetchReading(credentials: BrandCredentials, plantId: string | null): Promise<NormalisedReading> {
    const { key_id, key_secret } = credentials

    if (!key_id || !key_secret || !plantId) {
      throw new AdapterError('Solis credentials incomplete (need key_id, key_secret, and plant_id)', 'solis', false)
    }

    const path = '/v1/api/stationDetail'
    const bodyPayload = JSON.stringify({ id: plantId })
    const headers = buildHeaders(key_id, key_secret, path, bodyPayload)

    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: bodyPayload,
    })

    if (!res.ok) throw new AdapterError(`Solis station detail fetch failed: ${res.status}`, 'solis')

    const body = (await res.json()) as {
      code?: string
      msg?: string
      data?: {
        id?: string
        power?: number          // current PV power kW
        dayEnergy?: number      // today kWh
        monthEnergy?: number
        yearEnergy?: number
        allEnergy?: number
        batteryPower?: number   // battery power kW (+ charge, - discharge)
        batteryPercent?: number // SOC %
        batteryVoltage?: number
        gridPower?: number      // grid power kW (+ import, - export)
        homeLoadPower?: number  // load kW
        gridFrequency?: number
        temperature?: number
        inverterStatus?: number
        dataTimestamp?: number
        pvList?: Array<{ power?: number; voltage?: number; current?: number }>
        faultList?: Array<{ code?: string | number }>
      }
    }

    if (body.code !== '0') {
      throw new AdapterError(`Solis API error: ${body.msg ?? body.code}`, 'solis')
    }

    const d = body.data
    if (!d) throw new AdapterError('Solis: empty data', 'solis')

    const pvStrings: PvString[] = (d.pvList ?? []).map((pv, i) => ({
      string: i + 1,
      voltage_v: pv.voltage ?? null,
      current_a: pv.current ?? null,
      power_w:   pv.power != null ? pv.power * 1000 : null,  // Solis reports in kW
    }))

    const faultCodes = (d.faultList ?? []).map((f) => String(f.code ?? '')).filter(Boolean)

    return {
      recorded_at:       new Date().toISOString(),
      pv_power_w:        d.power != null ? d.power * 1000 : null,
      battery_power_w:   d.batteryPower != null ? d.batteryPower * 1000 : null,
      grid_power_w:      d.gridPower != null ? d.gridPower * 1000 : null,
      load_power_w:      d.homeLoadPower != null ? d.homeLoadPower * 1000 : null,
      battery_soc_pct:   d.batteryPercent ?? null,
      battery_voltage_v: d.batteryVoltage ?? null,
      grid_frequency_hz: d.gridFrequency ?? null,
      inverter_temp_c:   d.temperature ?? null,
      pv_strings:        pvStrings,
      fault_codes:       faultCodes,
      device_state:      mapSolisStatus(d.inverterStatus),
      raw_payload:       body as Record<string, unknown>,
    }
  },
}
