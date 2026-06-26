/**
 * What can we actually DO with each brand's settings — and by what route?
 *
 * Two distinct things are tracked, and the difference matters:
 *   - *implemented*: wired up in THIS app today (an adapter fetchSettings /
 *     applySettings exists). Drives whether the UI offers an auto button.
 *   - *possible*:    the brand's cloud API is documented to expose / change
 *     settings at all (from the June 2026 capability research). Drives the
 *     "could be automated next" hint and where to invest.
 *
 * The honest default everywhere is MANUAL capture — staff read the values off
 * the brand's own app and type them in. That works for every brand including the
 * local-Modbus-only ones (Huawei, SolaX), so the optimisation layer is never
 * blocked on a gated API.
 *
 * Sources: per-brand API capability research, June 2026. See the monitoring
 * settings wiki page for the underlying endpoint detail.
 */
import type { MonitoringBrand } from '../types'

export type SettingsRoute = 'cloud' | 'local-modbus' | 'manual' | 'none'

export interface BrandSettingsCapability {
  /** We can pull settings from the cloud right now (fetchSettings adapter exists). */
  readImplemented: boolean
  /** We can push a setting change to the cloud right now (applySettings exists). */
  writeImplemented: boolean
  /** Brand cloud API is documented to expose settings (research). */
  cloudReadPossible: boolean
  /** Brand cloud API can change settings — may be gated behind business/installer approval. */
  cloudWritePossible: boolean
  /** Cloud write needs distributor/business/O&M approval or an NDA. */
  cloudWriteGated: boolean
  /** Full settings control is only realistic via an on-site Modbus gateway. */
  localModbusOnly: boolean
  /** One-line human summary shown in the UI. */
  note: string
}

const C = (c: BrandSettingsCapability) => c

export const BRAND_SETTINGS_CAPABILITY: Record<MonitoringBrand, BrandSettingsCapability> = {
  // FoxESS — the cleanest cloud story: settings read/write with just the API
  // key the system already uses. Read is implemented here; write is scaffolded
  // but kept off until live-verified per firmware.
  foxess: C({
    readImplemented: true, writeImplemented: false,
    cloudReadPossible: true, cloudWritePossible: true, cloudWriteGated: false,
    localModbusOnly: false,
    note: 'Cloud API exposes settings with just your API key — auto-read is live; remote change is the next step (needs per-firmware testing).',
  }),

  sunsynk: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: true, cloudWritePossible: true, cloudWriteGated: false,
    localModbusOnly: false,
    note: 'Sunsynk Connect can read and write settings (SoC, work mode, ToU) via the cloud — automatable next; cloud changes lag by a few minutes.',
  }),

  sigenergy: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: true, cloudWritePossible: true, cloudWriteGated: false,
    localModbusOnly: false,
    note: 'Most open of the group — documented settings read plus a dispatch/VPP control API. Strong candidate to automate.',
  }),

  growatt: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: true, cloudWritePossible: true, cloudWriteGated: false,
    localModbusOnly: false,
    note: 'OpenAPI reads and writes settings (SoC, charge/discharge power, ToU) with an installer-tier token — automatable.',
  }),

  solis: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: true, cloudWritePossible: true, cloudWriteGated: true,
    localModbusOnly: false,
    note: 'SolisCloud control API can read/write settings but needs a separate owner-account control grant and is known to be flaky.',
  }),

  deye: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: false, cloudWritePossible: true, cloudWriteGated: true,
    localModbusOnly: false,
    note: 'Solarman cloud only shows telemetry; settings change needs business-approved control access. Same hardware as Sunsynk — local Modbus is easy.',
  }),

  victron: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: true, cloudWritePossible: true, cloudWriteGated: false,
    localModbusOnly: false,
    note: 'VRM exposes Dynamic-ESS config; full settings control is via local Modbus TCP / MQTT on the Cerbo GX.',
  }),

  goodwe: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: false, cloudWritePossible: false, cloudWriteGated: true,
    localModbusOnly: false,
    note: 'Public SEMS API is telemetry-only; settings need an NDA Open-API account, or local control via the on-site library.',
  }),

  solax: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: false, cloudWritePossible: false, cloudWriteGated: true,
    localModbusOnly: true,
    note: 'SolaX cloud is telemetry-only. Reading and changing settings needs local Modbus (Pocket WiFi 3.0) — capture manually for now.',
  }),

  huawei: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: false, cloudWritePossible: false, cloudWriteGated: true,
    localModbusOnly: true,
    note: 'FusionSolar Northbound is telemetry-only; settings control is local-Modbus-only (installer login). Capture manually for now.',
  }),

  luxpower: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: false, cloudWritePossible: false, cloudWriteGated: false,
    localModbusOnly: true,
    note: 'No cloud API — settings live on the on-site collector. Capture manually.',
  }),

  local: C({
    readImplemented: false, writeImplemented: false,
    cloudReadPossible: false, cloudWritePossible: false, cloudWriteGated: false,
    localModbusOnly: true,
    note: 'Local collector — settings captured on-site / manually.',
  }),
}

export function getSettingsCapability(brand: MonitoringBrand): BrandSettingsCapability {
  return BRAND_SETTINGS_CAPABILITY[brand]
}

/** Best read route available in-app right now for a brand. */
export function effectiveReadRoute(brand: MonitoringBrand): SettingsRoute {
  const c = getSettingsCapability(brand)
  if (c.readImplemented) return 'cloud'
  if (c.localModbusOnly) return 'local-modbus'
  return 'manual'
}
