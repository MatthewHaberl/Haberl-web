export type MonitoringBrand =
  | 'sunsynk' | 'sigenergy' | 'foxess' | 'deye' | 'growatt'
  | 'victron'  | 'goodwe'   | 'solax'  | 'solis' | 'huawei'
  | 'luxpower' | 'local'

export type DeviceState = 'online' | 'offline' | 'fault' | 'standby' | 'unknown'

export interface PvString {
  string: number
  voltage_v: number | null
  current_a: number | null
  power_w: number | null
}

/** Normalised reading shape — same as monitoring_readings columns */
export interface NormalisedReading {
  recorded_at: string          // ISO timestamp
  pv_power_w: number | null
  battery_power_w: number | null
  grid_power_w: number | null
  load_power_w: number | null
  battery_soc_pct: number | null
  battery_voltage_v: number | null
  grid_frequency_hz: number | null
  inverter_temp_c: number | null
  pv_strings: PvString[]
  fault_codes: string[]
  device_state: DeviceState
  raw_payload: Record<string, unknown>
}

/** Stored credentials shape per brand */
export interface BrandCredentials {
  // Solarman / Deye / Sunsynk
  app_id?: string
  app_secret?: string
  // Sunsynk direct API
  username?: string
  password?: string
  // FoxESS
  api_key?: string
  // Sigenergy
  plant_id?: string
  // Growatt
  api_token?: string
  // Victron
  access_token?: string
  vrm_installation_id?: string
  // GoodWe
  account?: string
  // SolaX
  token_id?: string
  sn?: string
  // Solis
  key_id?: string
  key_secret?: string
  // Huawei
  northbound_username?: string
  northbound_password?: string
  station_dn?: string
  // Generic
  [key: string]: string | undefined
}

/** Where a stored reading came from. */
export type ReadingSource = 'live' | 'backfill' | 'import'

export interface BrandAdapter {
  fetchReading(credentials: BrandCredentials, plantId: string | null, deviceSn: string | null): Promise<NormalisedReading>
  /**
   * Optional historical pull for one UTC day [dayStart, dayStart+24h). Returns
   * every timestep the brand cloud retains for that day (5-min for Sunsynk,
   * 15-min for Victron), oldest-first. An empty array means "no data that day"
   * — the backfill worker uses runs of empty days to detect the install date.
   * Brands without a history endpoint simply omit this method.
   */
  fetchHistory?(
    credentials: BrandCredentials,
    plantId: string | null,
    deviceSn: string | null,
    dayStartUtc: Date,
  ): Promise<NormalisedReading[]>
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly brand: MonitoringBrand,
    public readonly retryable: boolean = true
  ) {
    super(message)
    this.name = 'AdapterError'
  }
}
