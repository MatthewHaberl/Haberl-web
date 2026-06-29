/**
 * Human-readable catalog for the FULL Sunsynk settings object (the ~350-key blob
 * returned by /api/v1/common/setting/{sn}/read and stored verbatim in
 * monitoring_settings_snapshots.raw_payload). It mirrors the six pages of the
 * Sunsynk Connect "Settings" UI so the portal can display every parameter and
 * plot the numeric ones over the snapshot history.
 *
 * This is a DISPLAY catalog only — read-only, no write-back. Any raw key NOT in
 * this catalog is still shown by the UI under an "Other (raw)" group, so nothing
 * is ever hidden. Enum maps cover the values seen on Haberl's fleet; an unknown
 * code falls back to "Code N" (honest, never a wrong guess). The full raw value
 * is always available, so a mislabel is cosmetic.
 */

export type SettingKind = 'toggle' | 'number' | 'enum' | 'time' | 'text'

export interface CatalogField {
  key: string
  label: string
  kind: SettingKind
  unit?: string
  /** enum code (as string) → label */
  options?: Record<string, string>
}

export interface CatalogGroup {
  group: string
  fields: CatalogField[]
}

const ON_OFF = (key: string, label: string): CatalogField => ({ key, label, kind: 'toggle' })
const NUM = (key: string, label: string, unit?: string): CatalogField => ({ key, label, kind: 'number', unit })
const TIME = (key: string, label: string): CatalogField => ({ key, label, kind: 'time' })

const WORK_MODE = { '0': 'Selling First', '1': 'Zero Export To Load', '2': 'Zero Export To CT' }
const ENERGY_PATTERN = { '0': 'Priority Battery', '1': 'Priority Load' }
const BATT_TYPE = { '0': 'BMS Lithium', '1': 'Batt-V Mode', '2': 'No battery' }
const EQUIP_MODE = { '0': 'Master', '1': 'Slave' }
const GRID_FREQ = { '0': '50 Hz', '1': '60 Hz' }
const SMARTLOAD = { '0': 'Generator Input', '1': 'SmartLoad Output', '2': 'MicInv Input' }
const METER = { '0': 'No Meter' }

const SUNSYNK_CATALOG: CatalogGroup[] = [
  {
    group: 'System Mode',
    fields: [
      { key: 'sysWorkMode', label: 'Work Mode', kind: 'enum', options: WORK_MODE },
      NUM('solarMaxSellPower', 'Max Solar Power', 'W'),
      NUM('pvMaxLimit', 'Inverter Power Limiter', 'W'),
      NUM('zeroExportPower', 'Zero Export Power', 'W'),
      ON_OFF('solarSell', 'Solar Export'),
      { key: 'energyMode', label: 'Energy Pattern', kind: 'enum', options: ENERGY_PATTERN },
      ON_OFF('peakAndVallery', 'Use Timer'),
      ON_OFF('mondayOn', 'Timer — Mon'),
      ON_OFF('tuesdayOn', 'Timer — Tue'),
      ON_OFF('wednesdayOn', 'Timer — Wed'),
      ON_OFF('thursdayOn', 'Timer — Thu'),
      ON_OFF('fridayOn', 'Timer — Fri'),
      ON_OFF('saturdayOn', 'Timer — Sat'),
      ON_OFF('sundayOn', 'Timer — Sun'),
      ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
        TIME(`sellTime${n}`, `Time ${n}`),
        NUM(`sellTime${n}Pac`, `Power ${n}`, 'W'),
        NUM(`cap${n}`, `Battery SOC ${n}`, '%'),
        ON_OFF(`time${n}on`, `Grid Charge — Time ${n}`),
        ON_OFF(`genTime${n}on`, `Gen Charge — Time ${n}`),
      ]),
    ],
  },
  {
    group: 'Battery',
    fields: [
      { key: 'battType', label: 'Battery Type', kind: 'enum', options: BATT_TYPE },
      NUM('batteryCap', 'Battery Capacity', 'Ah'),
      NUM('batteryMaxCurrentCharge', 'Charge Amps', 'A'),
      NUM('batteryMaxCurrentDischarge', 'Discharge Amps', 'A'),
      ON_OFF('battery1On', 'Activate Battery 1'),
      ON_OFF('battery2On', 'Activate Battery 2'),
      ON_OFF('parallelBat1AndBat2', 'Parallel Bat1 & Bat2'),
      ON_OFF('sdChargeOn', 'Grid Charge'),
      NUM('sdStartCap', 'Grid Start', '%'),
      NUM('sdBatteryCurrent', 'Grid Amps', 'A'),
      ON_OFF('genChargeOn', 'Gen Charge'),
      ON_OFF('gridSignal', 'Grid Signal'),
      ON_OFF('genSignal', 'Gen Signal'),
      NUM('batteryShutdownCap', 'Shut Down', '%'),
      NUM('batteryRestartCap', 'Restart', '%'),
      NUM('batteryLowCap', 'Low Batt', '%'),
      NUM('maxOperatingTimeOfGen', 'Gen Max Run Time', 'H'),
      NUM('genCoolingTime', 'Gen Down Time', 'H'),
      NUM('generatorStartCap', 'Generator Start SOC', '%'),
      NUM('batteryShutdownVolt', 'Shut Down Voltage', 'V'),
      NUM('batteryRestartVolt', 'Restart Voltage', 'V'),
      NUM('batteryLowVolt', 'Low Batt Voltage', 'V'),
    ],
  },
  {
    group: 'Grid',
    fields: [
      { key: 'gridMode', label: 'Grid Mode (standard)', kind: 'enum', options: { '13': 'NRS097' } },
      { key: 'fac', label: 'Grid Frequency', kind: 'enum', options: GRID_FREQ },
      { key: 'threePhaseOrSplitPhase', label: 'Phase Type', kind: 'enum', options: { '0': 'Three-phase', '1': 'Split-phase' } },
      NUM('outputVoltLevelSetting', 'Grid Level (code)'),
      ON_OFF('notGrounded', 'IT system (neutral not grounded)'),
      NUM('normalUpwardSlope', 'Normal Ramp Rate', 'S'),
      NUM('recoveryTime', 'Reconnection Time', 'S'),
      NUM('reconnMinFreq', 'Reconnect Low Frequency', 'Hz'),
      NUM('reconnMaxFreq', 'Reconnect High Frequency', 'Hz'),
      NUM('reconnMinVolt', 'Reconnect Low Voltage', 'V'),
      NUM('reconnMaxVolt', 'Reconnect High Voltage', 'V'),
      NUM('pf', 'Power Factor (PF)'),
      NUM('overLongVolt', 'Over Voltage U', 'V'),
      NUM('hv1', 'HV1', 'V'), NUM('hv1t', 'HV1 time', 'S'),
      NUM('hv2', 'HV2', 'V'), NUM('hv2t', 'HV2 time', 'S'),
      NUM('hv3', 'HV3', 'V'), NUM('hv3t', 'HV3 time', 'S'),
      NUM('lv1', 'LV1', 'V'), NUM('lv1t', 'LV1 time', 'S'),
      NUM('lv2', 'LV2', 'V'), NUM('lv2t', 'LV2 time', 'S'),
      NUM('lowVolt', 'LV3 / Low Voltage', 'V'),
      NUM('overVolt1', 'Over Voltage 1', 'V'), NUM('overVolt1Delay', 'Over Voltage 1 delay', 'S'),
      NUM('overVolt2', 'Over Voltage 2', 'V'), NUM('overVolt2Delay', 'Over Voltage 2 delay', 'S'),
      NUM('underVolt1', 'Under Voltage 1', 'V'), NUM('underVolt1Delay', 'Under Voltage 1 delay', 'S'),
      NUM('underVolt2', 'Under Voltage 2', 'V'), NUM('underVolt2Delay', 'Under Voltage 2 delay', 'S'),
      NUM('overFreq1', 'HF1 / Over Freq 1', 'Hz'), NUM('overFreq1Delay', 'HF1 delay', 'S'),
      NUM('overFreq2', 'HF2 / Over Freq 2', 'Hz'), NUM('overFreq2Delay', 'HF2 delay', 'S'),
      NUM('underFreq1', 'LF1 / Under Freq 1', 'Hz'), NUM('underFreq1Delay', 'LF1 delay', 'S'),
      NUM('underFreq2', 'LF2 / Under Freq 2', 'Hz'), NUM('underFreq2Delay', 'LF2 delay', 'S'),
      NUM('vacHighProtect', 'AC over-voltage protect', 'V'),
      NUM('vacLowProtect', 'AC under-voltage protect', 'V'),
      NUM('facHighProtect', 'AC over-frequency protect', 'Hz'),
      NUM('facLowProtect', 'AC under-frequency protect', 'Hz'),
      NUM('minCosPhi', 'Min cosphi'),
      ON_OFF('voltReactiveEnable', 'Q(U) — volt/reactive'),
      ON_OFF('wattVoltEnable', 'P(U) — watt/volt'),
      ON_OFF('wattPfEnable', 'PF(P) — power factor curve'),
      ON_OFF('wattVarEnable', 'Q(P) — watt/var'),
      ON_OFF('wattFreqEnable', 'P(f) — watt/freq'),
      ON_OFF('constantReactiveEnable', 'Constant reactive'),
    ],
  },
  {
    group: 'Advanced',
    fields: [
      NUM('backupDelay', 'Backup Delay', 'S'),
      NUM('externalCtRatio', 'CT Ratio'),
      ON_OFF('externalMeter', 'Ex_Meter For CT'),
      { key: 'meterType', label: 'Meter Select', kind: 'enum', options: METER },
      ON_OFF('meter2Enable', 'Grid Tie Meter2'),
      ON_OFF('asymmetricFeedingEnable', 'Asymmetric Phase Feeding'),
      ON_OFF('solar1WindInputEnable', 'DC 1 for Wind Turbine'),
      ON_OFF('solar2WindInputEnable', 'DC 2 for Wind Turbine'),
      ON_OFF('solar3WindInputEnable', 'DC 3 for Wind Turbine'),
      ON_OFF('solar4WindInputEnable', 'DC 4 for Wind Turbine'),
      { key: 'arcFaultType', label: 'ARC Setup', kind: 'enum', options: { '0': 'Off', '1': 'On' } },
      ON_OFF('genPeakShaving', 'Gen Peak-shaving'),
      NUM('genPeakPower', 'Gen Peak-shaving Power', 'W'),
      ON_OFF('gridPeakShaving', 'Grid Peak-shaving'),
      NUM('gridPeakPower', 'Grid Peak-shaving Power', 'W'),
      ON_OFF('parallel', 'Parallel'),
      { key: 'equipMode', label: 'Equipment Mode', kind: 'enum', options: EQUIP_MODE },
      NUM('modbusSn', 'Modbus SN'),
      ON_OFF('drmEnable', 'DRM'),
      ON_OFF('signalIslandModeEnable', 'Signal Island Mode'),
    ],
  },
  {
    group: 'Basic',
    fields: [
      ON_OFF('timeSync', 'Time Sync'),
      ON_OFF('beep', 'Beeper'),
      ON_OFF('ampm', 'AM/PM'),
      ON_OFF('autoDim', 'Auto Dim'),
    ],
  },
  {
    group: 'Auxiliary Load',
    fields: [
      { key: 'loadMode', label: 'SmartLoad Setup', kind: 'enum', options: SMARTLOAD },
      ON_OFF('genConnectGrid', 'GEN connect to Grid input'),
      ON_OFF('microLinkToGrid', 'AC couple on grid side'),
      ON_OFF('microLinkToLoad', 'AC couple on load side'),
    ],
  },
]

/** Catalog for a brand. Only Sunsynk is curated; others rely on the raw view. */
export function getSettingsCatalog(brand: string): CatalogGroup[] {
  return brand === 'sunsynk' ? SUNSYNK_CATALOG : []
}

/** Every key the Sunsynk catalog labels — the UI shows the rest under "Other (raw)". */
export const SUNSYNK_KNOWN_KEYS: Set<string> = new Set(
  SUNSYNK_CATALOG.flatMap((g) => g.fields.map((f) => f.key)),
)

export function knownKeys(brand: string): Set<string> {
  return brand === 'sunsynk' ? SUNSYNK_KNOWN_KEYS : new Set()
}

export function isNumericField(f: CatalogField): boolean {
  return f.kind === 'number'
}

/** A raw settings value as a finite number, else null (for plotting). */
export function rawNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Decode a raw value to a display string given the field's kind. */
export function decodeValue(field: CatalogField, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const s = String(raw)
  switch (field.kind) {
    case 'toggle':
      if (s === '1' || s === 'true') return 'On'
      if (s === '0' || s === 'false') return 'Off'
      if (s === '-1') return '—'
      return s
    case 'enum':
      if (s === '-1') return '—'
      return field.options?.[s] ?? `Code ${s}`
    case 'number': {
      const n = Number(s)
      if (!Number.isFinite(n)) return s
      const num = n.toLocaleString('en-ZA')
      return field.unit ? `${num} ${field.unit}` : num
    }
    case 'time':
    case 'text':
    default:
      return s
  }
}
