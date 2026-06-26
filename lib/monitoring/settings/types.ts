/**
 * Normalised inverter SETTINGS (configuration), as opposed to the telemetry in
 * lib/monitoring/types.ts. Every brand names these differently; this is the one
 * shape the portal reads, displays, recommends against, and (later) writes back.
 *
 * Every field is nullable: a cloud read may only return some of them, and a
 * manual capture (staff reading the values off the brand app) fills in whatever
 * the installer can see. Unknown === null, never a guessed default.
 */

/** Battery/inverter operating strategy. */
export type WorkMode =
  | 'self_use'         // maximise self-consumption — the SA default
  | 'time_of_use'      // charge/discharge on a schedule (load-shift / arbitrage)
  | 'backup'           // keep the battery full for outages, minimal cycling
  | 'feed_in_priority' // export surplus first
  | 'peak_shaving'     // cap grid import at a demand threshold
  | 'manual'           // forced charge/discharge
  | 'off_grid'
  | 'unknown'

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  self_use:         'Self-use (maximise self-consumption)',
  time_of_use:      'Time-of-use (scheduled)',
  backup:           'Backup priority',
  feed_in_priority: 'Feed-in priority (export first)',
  peak_shaving:     'Peak shaving',
  manual:           'Manual / forced',
  off_grid:         'Off-grid',
  unknown:          'Unknown',
}

/** A scheduled battery action window (time-of-use programming). */
export interface TouWindow {
  /** Minutes past midnight, 0–1439. */
  startMin: number
  endMin: number
  action: 'charge' | 'discharge' | 'idle'
  /** Target state-of-charge for this window, if set. */
  targetSocPct?: number | null
  /** Power cap for the window (W), if set. */
  powerW?: number | null
  /** Whether charging from the grid is permitted in this window. */
  fromGrid?: boolean | null
  /** Free-text day applicability ("weekdays", "all"), brand-dependent. */
  days?: string | null
}

/** The normalised settings record stored in monitoring_settings_snapshots.settings. */
export interface InverterSettings {
  workMode: WorkMode | null
  /** Reserve floor on grid — battery won't discharge below this. */
  batteryMinSocPct: number | null
  /** Charge ceiling. */
  batteryMaxSocPct: number | null
  /** Separate reserve held back for outages, where the inverter distinguishes it. */
  backupReserveSocPct: number | null
  /** Allowed to charge the battery from the grid. */
  gridChargeEnabled: boolean | null
  /** Allowed to export surplus to the grid. */
  exportEnabled: boolean | null
  /** Export power cap (W). 0 = zero-export. null = unknown/uncapped. */
  exportLimitW: number | null
  maxChargeCurrentA: number | null
  maxDischargeCurrentA: number | null
  maxChargePowerW: number | null
  maxDischargePowerW: number | null
  touWindows: TouWindow[] | null
}

/** An empty settings record — all unknown. */
export function emptySettings(): InverterSettings {
  return {
    workMode: null,
    batteryMinSocPct: null,
    batteryMaxSocPct: null,
    backupReserveSocPct: null,
    gridChargeEnabled: null,
    exportEnabled: null,
    exportLimitW: null,
    maxChargeCurrentA: null,
    maxDischargeCurrentA: null,
    maxChargePowerW: null,
    maxDischargePowerW: null,
    touWindows: null,
  }
}

/**
 * Field-level metadata for the manual-capture form and the settings display.
 * Keeps labels/units/help in one place so the form and the read-only view agree.
 */
export interface SettingsFieldMeta {
  key: keyof InverterSettings
  label: string
  unit?: string
  kind: 'percent' | 'power_w' | 'current_a' | 'boolean' | 'workmode' | 'tou'
  help: string
}

export const SETTINGS_FIELDS: SettingsFieldMeta[] = [
  { key: 'workMode',            label: 'Work mode',              kind: 'workmode', help: 'The battery operating strategy. "Self-use" is the usual choice for SA homes with no feed-in tariff.' },
  { key: 'batteryMinSocPct',    label: 'Battery reserve floor',  unit: '%', kind: 'percent', help: 'The lowest the battery is allowed to discharge to on grid. Lower = more usable storage each night; higher = bigger outage buffer.' },
  { key: 'batteryMaxSocPct',    label: 'Charge ceiling',         unit: '%', kind: 'percent', help: 'The highest the battery charges to. 100% captures the most solar; slightly lower can extend battery life.' },
  { key: 'backupReserveSocPct', label: 'Backup reserve',         unit: '%', kind: 'percent', help: 'SoC held back purely for outages, where the inverter keeps this separate from the daily floor.' },
  { key: 'gridChargeEnabled',   label: 'Grid charging',          kind: 'boolean', help: 'Whether the battery may charge from the grid (e.g. cheap off-peak top-up, or pre-loadshedding).' },
  { key: 'exportEnabled',       label: 'Export to grid',         kind: 'boolean', help: 'Whether surplus solar is fed to the grid. Only worthwhile with a feed-in agreement; otherwise keep off / zero-export.' },
  { key: 'exportLimitW',        label: 'Export limit',           unit: 'W', kind: 'power_w', help: 'Cap on grid feed-in. 0 = zero-export (common where the municipality forbids feed-in).' },
  { key: 'maxChargeCurrentA',   label: 'Max charge current',     unit: 'A', kind: 'current_a', help: 'Limits how fast the battery charges. Too low can waste midday solar.' },
  { key: 'maxDischargeCurrentA',label: 'Max discharge current',  unit: 'A', kind: 'current_a', help: 'Limits how fast the battery can supply load.' },
  { key: 'maxChargePowerW',     label: 'Max charge power',       unit: 'W', kind: 'power_w', help: 'Power cap on charging, where set as power instead of current.' },
  { key: 'maxDischargePowerW',  label: 'Max discharge power',    unit: 'W', kind: 'power_w', help: 'Power cap on discharging.' },
]

/** Coerce an arbitrary jsonb blob back into a typed InverterSettings (lenient). */
export function parseSettings(raw: unknown): InverterSettings {
  const base = emptySettings()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : null)
  return {
    workMode: typeof o.workMode === 'string' ? (o.workMode as WorkMode) : null,
    batteryMinSocPct: num(o.batteryMinSocPct),
    batteryMaxSocPct: num(o.batteryMaxSocPct),
    backupReserveSocPct: num(o.backupReserveSocPct),
    gridChargeEnabled: bool(o.gridChargeEnabled),
    exportEnabled: bool(o.exportEnabled),
    exportLimitW: num(o.exportLimitW),
    maxChargeCurrentA: num(o.maxChargeCurrentA),
    maxDischargeCurrentA: num(o.maxDischargeCurrentA),
    maxChargePowerW: num(o.maxChargePowerW),
    maxDischargePowerW: num(o.maxDischargePowerW),
    touWindows: Array.isArray(o.touWindows) ? (o.touWindows as TouWindow[]) : null,
  }
}

/** Pretty-print a single field value for display / recommendation strings. */
export function formatSettingValue(key: keyof InverterSettings, settings: InverterSettings): string {
  const v = settings[key]
  if (v == null) return '—'
  if (key === 'workMode') return WORK_MODE_LABELS[v as WorkMode] ?? String(v)
  if (typeof v === 'boolean') return v ? 'On' : 'Off'
  const meta = SETTINGS_FIELDS.find((f) => f.key === key)
  if (key === 'touWindows') {
    const wins = v as TouWindow[]
    return wins.length ? `${wins.length} window${wins.length > 1 ? 's' : ''}` : 'None'
  }
  return meta?.unit ? `${v}${meta.unit === '%' ? '' : ' '}${meta.unit}` : String(v)
}

/** Minutes-past-midnight → "HH:MM". */
export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
