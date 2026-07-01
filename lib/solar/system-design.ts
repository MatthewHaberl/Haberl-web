// ─────────────────────────────────────────────────────────────────────────────
// SystemDesign — the single source of truth for the Quotes-v2 design canvas.
//
// The section editors (Energy, Panels, Inverter, …) AND the SLD diagram are both
// views over ONE SystemDesign object. There is no second store and no manual
// "sync" step: a diagram edit and a form edit dispatch the same actions, and the
// diagram is rebuilt from the design by the pure `designToFlow` selector below.
//
// Design RULES are reused, not reinvented — sizing constants and the generation
// model come from quote-calculator.ts / generation-calculator.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Node, Edge } from '@xyflow/react'
import type { QuoteData } from './render-quote'
import { buildEdgeLabel, type CableEdgeData } from './sld-builder'
import { calculateStringGeneration, type Season } from './generation-calculator'
import {
  PSH_GAUTENG,
  SYSTEM_EFFICIENCY,
  MAX_RECOMMENDED_DC_AC_RATIO,
  MIN_BATTERY_KWH_PER_INVERTER_KW,
  type EquipmentCatalogCategory,
} from './quote-calculator'

export const DESIGN_VERSION = 1

const DAYS_PER_MONTH = 30.4

// ── Types ──────────────────────────────────────────────────────────────────────

export type CurvePreset = 'home_all_day' | 'business_9_5' | 'evening_peak' | 'custom'

/** Which single granularity the user is entering. Only this field is read. */
export type EnergyMode = 'daily' | 'weekly' | 'monthly' | 'annual'

export interface EnergyProfile {
  /** The one active granularity. Others are ignored until selected. */
  mode: EnergyMode
  /** Load-shape preset; shapes the hourly curve when only totals are known. */
  curvePreset: CurvePreset | null
  /** 24 hourly kWh values (index 0 = 00:00). null = not entered by hand. */
  hourly: number[] | null
  dailyKwh: number | null
  weeklyKwh: number | null
  monthlyKwh: number | null
  annualKwh: number | null
  /** Essential (backed-up) load in kW — basis for battery hours-of-storage. */
  essentialLoadKw: number | null
  /** Shaping overlays the UI edits (items 37–40). They never change the TOTAL
   *  (which still comes from dailyKwh/weeklyKwh/monthlyKwh/annualKwh) — they let
   *  the user redistribute it. Empty/null = flat (no shaping). */
  /** Relative weight per weekday, Mon..Sun (length 7). */
  weekly?: number[] | null
  /** Relative weight per week within a month (length 4 or 5). */
  monthlyProfile?: number[] | null
  /** Relative weight per month, Jan..Dec (length 12). */
  annualProfile?: number[] | null
}

/** Which shaping-overlay array a profile-cell edit targets (items 37–40). */
export type EnergyProfileField = 'weekly' | 'monthlyProfile' | 'annualProfile'

export interface PanelGroup {
  id: string
  label: string
  panelCount: number
  /** DC watts per panel. */
  panelWatts: number
  panelModel: string
  catalogId: string | null
  /** Roof orientation in degrees (0 = N, 90 = E …). Set via the direction picker. */
  azimuth: number | null
  /** Roof tilt in degrees. When azimuth + pitch are both set, the hourly solar model is used. */
  pitch: number | null
  /** Mounting surface — Tile / IBR / Klip-lok / Concrete flat … (free metadata for now). */
  roofType: string
  /** Run length from this string to its DC combiner / inverter, in metres (item 41). */
  distanceFromCombinerM?: number
  /** MC4 jumper pairs for a string spanning rows / roofs (item 42). Each pair is
   *  two MC4 connectors (a male + female extension), costed in design-bom.ts. */
  jumpers?: number
}

// 8-way compass → azimuth degrees (0 = North), matching generation-calculator.
export const DIRECTIONS: Array<{ label: string; azimuth: number }> = [
  { label: 'North', azimuth: 0 },
  { label: 'North-East', azimuth: 45 },
  { label: 'East', azimuth: 90 },
  { label: 'South-East', azimuth: 135 },
  { label: 'South', azimuth: 180 },
  { label: 'South-West', azimuth: 225 },
  { label: 'West', azimuth: 270 },
  { label: 'North-West', azimuth: 315 },
]

export const ROOF_TYPES = [
  'Tile', 'IBR / corrugated steel', 'Klip-lok / standing seam',
  'Concrete (flat)', 'Slate', 'Fibre-cement', 'Ground mount', 'Other',
]

/** Output topology of an inverter (item 50). `phases` stays derived from this for
 *  back-compat: single_230 / american_120 / split_phase are 1-ish, three_phase is 3. */
export type InverterPhaseConfig = 'single_230' | 'split_phase' | 'american_120' | 'three_phase'

export const INVERTER_PHASE_CONFIGS: Array<{ value: InverterPhaseConfig; label: string; phases: 1 | 3 }> = [
  { value: 'single_230', label: 'Single-phase 230V (L/N/E)', phases: 1 },
  { value: 'split_phase', label: 'Split-phase 120/240V (L1/L2/N/E)', phases: 1 },
  { value: 'american_120', label: 'American 120V (L/N/E)', phases: 1 },
  { value: 'three_phase', label: 'Three-phase 400V (L1/L2/L3/N/E)', phases: 3 },
]

export interface InverterUnit {
  id: string
  catalogId: string | null
  model: string
  kw: number
  qty: number
  phases: 1 | 3
  /** AC output topology (item 50). When set, `phases` is derived from it. */
  phaseConfig?: InverterPhaseConfig
  /** Has a built-in MPPT and accepts PV strings directly (item 51). Default true. */
  acceptsPv?: boolean
  /** Accepts a battery (hybrid). Default true. AC-coupled inverters set this false. */
  acceptsBattery?: boolean
}

/** Map a phase config to a 1|3 phase count (item 50). */
export function phaseConfigToPhases(cfg: InverterPhaseConfig): 1 | 3 {
  return cfg === 'three_phase' ? 3 : 1
}

/** The effective phase count for an inverter — phaseConfig wins, else legacy `phases`. */
export function inverterPhases(u: InverterUnit): 1 | 3 {
  return u.phaseConfig ? phaseConfigToPhases(u.phaseConfig) : (u.phases ?? 1)
}

/** Whether the inverter draws PV strings directly (item 51; default true). */
export function inverterAcceptsPv(u: InverterUnit): boolean {
  return u.acceptsPv !== false
}

/** Whether the inverter accepts a battery (item 51; default true). */
export function inverterAcceptsBattery(u: InverterUnit): boolean {
  return u.acceptsBattery !== false
}

export interface BatteryUnit {
  id: string
  catalogId: string | null
  model: string
  /** kWh per unit. */
  kwh: number
  qty: number
}

export type BatteryTopology = 'parallel-busbar' | 'series-string' | 'series-parallel' | 'multi-inverter'

/** A chosen disconnect/switchgear product on a battery section (per-battery or main). */
export type DisconnectKind = 'fuse-disconnect' | 'isolator' | 'breaker' | 'dc-switch' | 'dc-switchgear' | 'none'

export interface DisconnectChoice {
  type: DisconnectKind
  /** catalogId, or a free-text custom label when no catalog product fits. */
  product: string | null
}

export function defaultDisconnectChoice(type: DisconnectKind = 'isolator'): DisconnectChoice {
  return { type, product: null }
}

/** Itemised inter-bank / battery-to-busbar cable run (item 28). */
export interface BankCable {
  id: string
  /** Endpoint refs — battery node id (e.g. 'battery', 'batt-3'), 'bat-busbar', 'bat-main', or a battery group id. */
  fromRef: string
  toRef: string
  label: string
  sizeMm2: string
  material: string
  runs: number
}

export function defaultBankCable(fromRef = '', toRef = ''): BankCable {
  return { id: mkId('bcab'), fromRef, toRef, label: '', sizeMm2: '', material: 'CU', runs: 1 }
}

/** Optional busbar fabrication spec for the battery bank (item 27). */
export interface BatteryBusbarSpec {
  product: string | null
  material: 'copper' | 'aluminium' | null
  lengthMm: number | null
  widthMm: number | null
}

/** How the battery units are wired into a bank — drives the protection BOM + cost. */
export interface BatteryBank {
  topology: BatteryTopology
  voltageClass: 'LV' | 'HV'
  nominalVoltage: number
  /** Discharge-cutoff (worst-case) voltage — sizing uses this, not nominal. */
  cutoffVoltage: number
  /** Each battery gets its own breaker/disconnect onto the busbar. */
  perBatteryDisconnect: boolean
  disconnectRating: string
  busbar: boolean
  mainDisconnect: boolean
  /** Separate disconnect + cable run to each inverter. */
  inverterFeeds: number
  cableSizeMm2: number
  /** Catalog products (null = none / not chosen). */
  cableProductId: string | null
  perBatteryDisconnectId: string | null
  mainDisconnectId: string | null
  /** Chosen per-battery disconnect product + type (item 23; null = use legacy id). */
  perBatteryDisconnectChoice?: DisconnectChoice | null
  /** Chosen main (inverter↔busbar) disconnect product + type (item 23). */
  mainDisconnectChoice?: DisconnectChoice | null
  /** Busbar fabrication spec when a non-default bar is specified (item 27). */
  busbarSpec?: BatteryBusbarSpec | null
  /** Per-cable inter-bank runs; cableSizeMm2 is the fallback default (item 28). */
  cables?: BankCable[]
}

export const BATTERY_TOPOLOGIES: Array<{ value: BatteryTopology; label: string; hint: string }> = [
  { value: 'parallel-busbar', label: 'Parallel — busbar', hint: 'each battery → disconnect → busbar → main' },
  { value: 'series-string', label: 'Series string (HV)', hint: 'batteries in series for a HV inverter' },
  { value: 'series-parallel', label: 'Series-parallel', hint: 'series strings paralleled on a busbar' },
  { value: 'multi-inverter', label: 'Multi-inverter', hint: 'busbar feeds 2+ inverters' },
]

export function defaultBank(): BatteryBank {
  return {
    topology: 'parallel-busbar', voltageClass: 'LV', nominalVoltage: 51.2, cutoffVoltage: 44,
    perBatteryDisconnect: true, disconnectRating: '250A DC',
    busbar: true, mainDisconnect: true, inverterFeeds: 1, cableSizeMm2: 25,
    cableProductId: null, perBatteryDisconnectId: null, mainDisconnectId: null,
    perBatteryDisconnectChoice: defaultDisconnectChoice('breaker'),
    mainDisconnectChoice: defaultDisconnectChoice('isolator'),
    busbarSpec: null,
    cables: [],
  }
}

export type EnclosureMaterial = 'plastic' | 'steel' | 'poly' | 'fibreglass'
export type EnclosureMount = 'surface' | 'flush' | 'weatherproof'

/** One combined DC output of a combiner (which strings tie together onto it). */
export interface CombinerOutput {
  id: string
  label: string
  stringIds: string[]
  /** Per-output protection (catalog product ids) — main breaker when >1 string, + SPD. */
  spdId: string | null
  mainBreakerId: string | null
}

/** Per-string connection products inside a combiner (catalog ids; null = none). */
export interface StringConnection {
  breakerId: string | null
  fuseHolderId: string | null
  fuseId: string | null
  fuseQty: number
  isolatorId: string | null
}

export function defaultStringConnection(): StringConnection {
  return { breakerId: null, fuseHolderId: null, fuseId: null, fuseQty: 1, isolatorId: null }
}

/** A device inside a DC combiner (item 44) — mirrors AcCombiner's DbComponent
 *  shape/kinds so the same "inside component list" UI + BOM itemisation apply.
 *  `kind` reuses DbComponentKind; `product` mirrors DbComponent.productId. */
export interface DcComponent {
  id: string
  kind: DbComponentKind
  label: string
  /** Catalog product id (null = spec'd but no product → goes to quote). */
  product: string | null
  qty: number
  /** Upstream source ids — other DC component ids, a string id, or DB_SUPPLY_ID. */
  fedFrom?: string[]
}

export function defaultDcComponent(kind: DbComponentKind = 'breaker', fedFrom: string[] = []): DcComponent {
  const def = dbComponentKind(kind)
  return { id: mkId('dcc'), kind, label: def.label, product: null, qty: 1, fedFrom }
}

export interface DcCombiner {
  id: string
  label: string
  // Enclosure
  material: EnclosureMaterial
  mount: EnclosureMount
  /** DIN modules per row. */
  ways: number
  rows: number
  ipRating: string
  /** Auto-generated descriptive code; user can override (locks it). */
  productCode: string
  productCodeLocked: boolean
  /** Chosen catalog enclosure (a specific DB product); null = manual config. */
  enclosureCatalogId: string | null
  // Inputs (strings) and outputs (to inverter MPPTs)
  inputStringIds: string[]
  outputs: CombinerOutput[]
  /** Per-string connection products, keyed by panel-group id.
   *  @deprecated legacy — the new UI uses `components`. Kept parseable so old
   *  designs don't crash; design-bom still itemises it when components are empty. */
  stringConnections: Record<string, StringConnection>
  /** Devices mounted inside the box (item 44; mirrors AcCombiner.components).
   *  Default EMPTY — protection is left OUT until the user adds it. */
  components?: DcComponent[]
}

export const ENCLOSURE_MATERIALS: Array<{ value: EnclosureMaterial; label: string }> = [
  { value: 'plastic', label: 'Plastic' },
  { value: 'steel', label: 'Steel (metal)' },
  { value: 'poly', label: 'Poly / PVC (weatherproof)' },
  { value: 'fibreglass', label: 'Fibreglass' },
]

export const ENCLOSURE_MOUNTS: Array<{ value: EnclosureMount; label: string }> = [
  { value: 'surface', label: 'Surface' },
  { value: 'flush', label: 'Flush' },
  { value: 'weatherproof', label: 'Weatherproof (IP65/66)' },
]

export const ENCLOSURE_WAYS = [4, 6, 8, 12, 18, 24, 36]

const MATERIAL_CODE: Record<EnclosureMaterial, string> = { plastic: 'PL', steel: 'STL', poly: 'POLY', fibreglass: 'FG' }
const MOUNT_CODE: Record<EnclosureMount, string> = { surface: 'S', flush: 'F', weatherproof: 'WP' }

/** Descriptive code from the enclosure config, e.g. CHINT-DB-2x12-S-STL. */
export function enclosureCode(c: Pick<DcCombiner, 'material' | 'mount' | 'ways' | 'rows'>): string {
  const size = c.rows > 1 ? `${c.rows}x${c.ways}` : `${c.ways}W`
  return `CHINT-DB-${size}-${MOUNT_CODE[c.mount]}-${MATERIAL_CODE[c.material]}`
}

/** Short "N-in M-out · 2×12" summary for the diagram + cards. */
export function combinerConfigLabel(c: DcCombiner): string {
  const size = c.rows > 1 ? `${c.rows}×${c.ways}` : `${c.ways}-way`
  return `${c.inputStringIds.length}-in ${c.outputs.length}-out · ${size}`
}

/** Enclosure attributes stored on a catalog DB product (in its notes JSON). */
export interface EnclosureSpec {
  material: EnclosureMaterial
  mount: EnclosureMount
  ways: number
  rows: number
  ip: string
}

/** Read an enclosure spec from a catalog item's notes JSON (`{"enclosure": {...}}`). */
export function parseEnclosureSpec(notes: string | null | undefined): EnclosureSpec | null {
  if (!notes) return null
  try {
    const obj = JSON.parse(notes) as { enclosure?: Partial<EnclosureSpec> }
    const e = obj?.enclosure
    if (!e) return null
    return {
      material: (e.material as EnclosureMaterial) ?? 'plastic',
      mount: (e.mount as EnclosureMount) ?? 'surface',
      ways: Number(e.ways) || 12,
      rows: Number(e.rows) || 1,
      ip: e.ip ?? 'IP4X',
    }
  } catch {
    return null
  }
}

/** Serialise an enclosure spec back to the notes JSON for the catalog. */
export function enclosureSpecToNotes(spec: EnclosureSpec): string {
  return JSON.stringify({ enclosure: spec })
}

/** A new combiner pre-wired to the given strings, with rule-based protection defaults. */
export function defaultCombiner(panelIds: string[]): DcCombiner {
  const inputs = panelIds.slice()
  const c: DcCombiner = {
    id: mkId('comb'),
    label: 'DC Combiner',
    material: 'poly',
    mount: 'weatherproof',
    ways: 6,
    rows: 1,
    ipRating: 'IP65',
    productCode: '',
    productCodeLocked: false,
    enclosureCatalogId: null,
    inputStringIds: inputs,
    outputs: [{ id: mkId('out'), label: 'Output 1', stringIds: inputs.slice(), spdId: null, mainBreakerId: null }],
    stringConnections: {},
    components: [],
  }
  c.productCode = enclosureCode(c)
  return c
}

// ── DB internals ─────────────────────────────────────────────────────────────
// The "inside" of an AC board is a list of devices wired from upstream source(s),
// modelling the board as a small single-line diagram. Each device records what it
// is fed from (the incoming supply, or another device on the board); "feeds to" is
// derived from those links so the two can never drift apart.

export type DbComponentKind =
  | 'mainSwitch' | 'breaker' | 'rcbo' | 'rccb' | 'spd' | 'changeover'
  | 'isolator' | 'contactor' | 'timer' | 'meter' | 'indicator' | 'busbar' | 'custom'

export interface DbComponent {
  id: string
  kind: DbComponentKind
  /** Editable display name, e.g. "Main breaker", "Geyser", "Changeover". */
  label: string
  /** Catalog product id (null = spec'd but no product picked → goes to quote). */
  productId: string | null
  qty: number
  /** Upstream source ids feeding this device — other component ids, or the SUPPLY
   *  token (incoming feed / previous DB). Changeovers carry two sources. */
  fedFrom: string[]
}

/** Virtual upstream node: the board's incoming feed (grid / previous DB / inverter). */
export const DB_SUPPLY_ID = 'supply'
export const DB_SUPPLY_LABEL = 'Incoming feed / previous DB'

/** Palette of devices that go inside a DB. `inputs` = how many sources feed it
 *  (changeovers take two); `category` = which catalog category the picker shows. */
export const DB_COMPONENT_KINDS: Array<{ value: DbComponentKind; label: string; category: EquipmentCatalogCategory; inputs: number }> = [
  { value: 'mainSwitch', label: 'Main switch / isolator', category: 'isolator', inputs: 1 },
  { value: 'breaker', label: 'Circuit breaker (MCB)', category: 'breaker', inputs: 1 },
  { value: 'rcbo', label: 'RCBO (breaker + earth leakage)', category: 'breaker', inputs: 1 },
  { value: 'rccb', label: 'Earth leakage (RCCB)', category: 'rccb', inputs: 1 },
  { value: 'spd', label: 'Surge protection (SPD)', category: 'spd', inputs: 1 },
  { value: 'changeover', label: 'Changeover switch', category: 'isolator', inputs: 2 },
  { value: 'isolator', label: 'Isolator / switch-disconnector', category: 'isolator', inputs: 1 },
  { value: 'contactor', label: 'Contactor', category: 'other', inputs: 1 },
  { value: 'timer', label: 'Timer / time switch', category: 'other', inputs: 1 },
  { value: 'meter', label: 'Energy / kWh meter', category: 'other', inputs: 1 },
  { value: 'indicator', label: 'Indicator light', category: 'other', inputs: 1 },
  { value: 'busbar', label: 'Busbar / neutral-earth bar', category: 'other', inputs: 1 },
  { value: 'custom', label: 'Custom component', category: 'other', inputs: 1 },
]

export function dbComponentKind(kind: DbComponentKind) {
  return DB_COMPONENT_KINDS.find((k) => k.value === kind) ?? DB_COMPONENT_KINDS[DB_COMPONENT_KINDS.length - 1]
}

export function defaultDbComponent(kind: DbComponentKind, fedFrom: string[] = []): DbComponent {
  const def = dbComponentKind(kind)
  return { id: mkId('dbc'), kind, label: def.label, productId: null, qty: 1, fedFrom }
}

/** How cables enter the board, top and bottom. */
export type DbConnection = 'glands' | 'glandPlate' | 'trunking' | 'conduit' | 'busbar' | 'direct' | 'none'

export const DB_CONNECTIONS: Array<{ value: DbConnection; label: string }> = [
  { value: 'glands', label: 'Cable glands' },
  { value: 'glandPlate', label: 'Gland plate' },
  { value: 'trunking', label: 'Trunking / cable tray' },
  { value: 'conduit', label: 'Conduit' },
  { value: 'busbar', label: 'Busbar / bus-trunking' },
  { value: 'direct', label: 'Direct entry' },
  { value: 'none', label: 'None' },
]

// ── DB templates + reuse (W83) ───────────────────────────────────────────────
// Starting-point boards you drop in on site and tweak, plus a re-id helper so a
// saved/loaded board's internal wiring stays intact without colliding ids.
export type DbTemplateKey = 'two_inverter_combiner' | 'ac_changeover' | 'essential_db'

export const DB_TEMPLATES: Array<{ key: DbTemplateKey; label: string; hint: string }> = [
  { key: 'two_inverter_combiner', label: '2-inverter combiner', hint: '2 inverters → changeover → output, with SPD + phase light' },
  { key: 'ac_changeover', label: 'AC changeover DB', hint: 'Grid + generator → changeover → load, with SPD' },
  { key: 'essential_db', label: 'Essential loads DB', hint: 'Main + earth-leakage + SPD + way breakers' },
]

export function buildDbTemplate(key: DbTemplateKey): DbComponent[] {
  const c = (kind: DbComponentKind, label: string, fedFrom: string[] = []) => {
    const x = defaultDbComponent(kind, fedFrom); x.label = label; return x
  }
  if (key === 'ac_changeover') {
    const grid = c('breaker', 'Grid incomer', [DB_SUPPLY_ID])
    const gen = c('breaker', 'Generator incomer', [DB_SUPPLY_ID])
    const spd = c('spd', 'AC SPD', [grid.id])
    const co = c('changeover', 'Grid / Gen changeover', [grid.id, gen.id])
    const out = c('breaker', 'Output breaker', [co.id])
    const lamp = c('indicator', 'Supply indicator', [co.id])
    return [grid, gen, spd, co, out, lamp]
  }
  if (key === 'two_inverter_combiner') {
    const grid = c('breaker', 'Grid incomer', [DB_SUPPLY_ID])
    const gen = c('breaker', 'Generator incomer', [DB_SUPPLY_ID])
    const spd = c('spd', 'AC SPD', [grid.id])
    const co1 = c('changeover', 'Changeover — Inverter 1', [grid.id, gen.id])
    const co2 = c('changeover', 'Changeover — Inverter 2', [grid.id, gen.id])
    const in1 = c('breaker', 'Inverter 1 input', [co1.id])
    const out1 = c('breaker', 'Inverter 1 output', [in1.id])
    const in2 = c('breaker', 'Inverter 2 input', [co2.id])
    const out2 = c('breaker', 'Inverter 2 output', [in2.id])
    const lamp = c('indicator', 'Phase indicator', [grid.id])
    return [grid, gen, spd, co1, co2, in1, out1, in2, out2, lamp]
  }
  const main = c('mainSwitch', 'Main switch', [DB_SUPPLY_ID])
  const rccb = c('rccb', 'Earth leakage (RCCB)', [main.id])
  const spd = c('spd', 'AC SPD', [main.id])
  const ways = ['Lights', 'Plugs', 'Geyser', 'Backup'].map((w) => c('breaker', w, [rccb.id]))
  return [main, rccb, spd, ...ways]
}

/** Regenerate component ids (and remap fedFrom) so a saved board can be dropped into
 *  another quote without id collisions. The SUPPLY token is preserved. */
export function reidDbComponents(comps: DbComponent[]): DbComponent[] {
  const map = new Map<string, string>()
  comps.forEach((k) => map.set(k.id, mkId('dbc')))
  return comps.map((k) => ({
    ...k,
    id: map.get(k.id) as string,
    fedFrom: (k.fedFrom ?? []).map((f) => (f === DB_SUPPLY_ID ? DB_SUPPLY_ID : (map.get(f) ?? ''))),
  }))
}

/** AC distribution board — reuses the Chint DB enclosures + AC protection products. */
export interface AcCombiner {
  id: string
  label: string
  enclosureCatalogId: string | null
  material: EnclosureMaterial
  mount: EnclosureMount
  ways: number
  rows: number
  ipRating: string
  productCode: string
  productCodeLocked: boolean
  /** Devices mounted inside the board, in wiring order. */
  components: DbComponent[]
  /** Cable entry on the top / bottom of the enclosure. */
  topConnection: DbConnection
  bottomConnection: DbConnection
  /** @deprecated migrated into `components` by parseDesign — kept for old saved data. */
  mainBreakerId?: string | null
  rccbId?: string | null
  spdId?: string | null
}

export function defaultAcCombiner(): AcCombiner {
  const main = defaultDbComponent('breaker', [DB_SUPPLY_ID]); main.label = 'Main breaker'
  const rccb = defaultDbComponent('rccb', [main.id]); rccb.label = 'Earth leakage (RCCB)'
  const spd = defaultDbComponent('spd', [main.id]); spd.label = 'AC SPD'
  const c: AcCombiner = {
    id: mkId('db'), label: 'Distribution Board',
    enclosureCatalogId: null, material: 'plastic', mount: 'surface',
    ways: 12, rows: 1, ipRating: 'IP4X', productCode: '', productCodeLocked: false,
    components: [main, rccb, spd],
    topConnection: 'glands', bottomConnection: 'glands',
  }
  c.productCode = enclosureCode(c)
  return c
}

/** Backfill a saved AC board: migrate the legacy fixed main/RCCB/SPD trio into the
 *  component list, and default the cable-entry fields. Idempotent. */
export function normalizeAcCombiner(c: AcCombiner): AcCombiner {
  let components = c.components
  if (!Array.isArray(components)) {
    const main = defaultDbComponent('breaker', [DB_SUPPLY_ID]); main.label = 'Main breaker'; main.productId = c.mainBreakerId ?? null
    const rccb = defaultDbComponent('rccb', [main.id]); rccb.label = 'Earth leakage (RCCB)'; rccb.productId = c.rccbId ?? null
    const spd = defaultDbComponent('spd', [main.id]); spd.label = 'AC SPD'; spd.productId = c.spdId ?? null
    components = [main, rccb, spd]
  }
  return {
    ...c,
    components: components.map((x) => ({ ...x, qty: x.qty || 1, fedFrom: Array.isArray(x.fedFrom) ? x.fedFrom : [] })),
    topConnection: c.topConnection ?? 'glands',
    bottomConnection: c.bottomConnection ?? 'glands',
  }
}

export type EarthKind = 'earthing' | 'bonding'
export type EarthArrangement = 'single' | 'line' | 'loop' | 'mat'

export const EARTH_ARRANGEMENTS: Array<{ value: EarthArrangement; label: string }> = [
  { value: 'single', label: 'Single point' },
  { value: 'line', label: 'In a line' },
  { value: 'loop', label: 'Closed loop' },
  { value: 'mat', label: 'Earth mat' },
]

/** Driven earth rods / spike array (a fault-current electrode). */
export interface EarthElectrode {
  id: string
  label: string
  spikeCount: number
  /** How the spikes are laid out. */
  arrangement: EarthArrangement
  /** Spikes joined per group: 1 = all single, 2 = pairs (e.g. 3×2), … */
  groupSize: number
  /** Size of the conductor linking the spikes together. */
  linkMm2: number
}

export function defaultElectrode(label: string, spikeCount: number): EarthElectrode {
  return { id: mkId('el'), label, spikeCount, arrangement: 'line', groupSize: 1, linkMm2: 16 }
}
/** A collection busbar/bar that earth conductors land on. */
export interface EarthBar { id: string; label: string }
/** One sized earth run between two points, tagged earthing (to electrode) or bonding. */
export interface EarthConductor {
  id: string
  fromId: string
  toId: string
  sizeMm2: number
  kind: EarthKind
}

export interface EarthingConfig {
  spikeCount: number | null
  spec: string
  /** Catalog products for pricing the earth spike + bar (null = none → quoted). */
  spikeProductId?: string | null
  barProductId?: string | null
  electrodes: EarthElectrode[]
  bars: EarthBar[]
  conductors: EarthConductor[]
}

export const EARTH_SIZES = [2.5, 4, 6, 10, 16, 25, 35]

/** A sub-component nested inside an extra (item 31) — e.g. an EV charger's cable + breaker. */
export interface ExtraSubComponent {
  id: string
  kind: string
  label: string
  product: string | null
  qty: number
}

export function defaultExtraSubComponent(kind = 'custom', label = ''): ExtraSubComponent {
  return { id: mkId('exsub'), kind, label, product: null, qty: 1 }
}

export interface ExtraComponent {
  id: string
  type: string
  label: string
  productId: string | null
  data: Record<string, unknown>
  /** Nested sub-components priced under this extra (item 31). */
  components?: ExtraSubComponent[]
}

// Palette of standalone extras (rendered on the diagram via SimpleBlock node types).
export const EXTRA_TYPES: Array<{ value: string; label: string; category?: EquipmentCatalogCategory }> = [
  { value: 'dcIsolator', label: 'DC isolator', category: 'isolator' },
  { value: 'acIsolator', label: 'AC isolator', category: 'isolator' },
  { value: 'spd', label: 'SPD', category: 'spd' },
  { value: 'changeover', label: 'Changeover switch' },
  { value: 'meter', label: 'Energy meter' },
  { value: 'evCharger', label: 'EV charger' },
  { value: 'generator', label: 'Generator' },
  { value: 'custom', label: 'Custom block' },
]

export function defaultExtra(type: string, label: string): ExtraComponent {
  return { id: mkId('extra'), type, label, productId: null, data: {}, components: [] }
}

// ── Monitoring (item 26) ─────────────────────────────────────────────────────
// Inverter monitoring/comms hardware. Brand logic (Sunsynk ships bundled, Victron
// needs an added dongle + data-comms) lives in the section UI — this just holds it.

export interface MonitoringDevice {
  id: string
  /** Whether it ships with the inverter ('bundled') or is added on top ('additional'). */
  role: 'bundled' | 'additional'
  catalogId: string | null
  label: string
  /** @deprecated Which inverter this hangs off (null = representative inverter).
   *  Superseded by `targetId` (item 52); kept readable for back-compat. */
  inverterId: string | null
  /** Any node id this device hangs off — inverter, a gateway, a panel … (item 52).
   *  null falls back to inverterId, then to the representative inverter. */
  targetId?: string | null
  /** Comms medium — 'wifi' | 'lan' | 'gsm' | 'rs485' | 'can' | 'other' … (free metadata). */
  commsType: string
  /** Free-text comms description when commsType === 'other' (item 52). */
  commsOther?: string
}

export function defaultMonitoring(role: 'bundled' | 'additional' = 'additional', label = 'Monitoring'): MonitoringDevice {
  return { id: mkId('mon'), role, catalogId: null, label, inverterId: null, targetId: null, commsType: 'wifi', commsOther: '' }
}

// ── Data links (item 30) — comms wiring, modelled like earthing.conductors ─────

export type DataCableType = 'Cat5e' | 'Cat6' | 'Cat7'
export type DataTermination = 'crimp' | 'loose'

export interface DataLink {
  id: string
  fromId: string
  toId: string
  cableType: DataCableType
  termination: DataTermination
  protocol: string
  note: string
}

export interface DataConfig {
  links: DataLink[]
}

export function defaultDataConfig(): DataConfig {
  return { links: [] }
}

export function defaultDataLink(fromId = '', toId = ''): DataLink {
  return { id: mkId('dlink'), fromId, toId, cableType: 'Cat6', termination: 'crimp', protocol: '', note: '' }
}

export interface NodePosition {
  x: number
  y: number
}

/** A cable the user drew by hand on the canvas (item 53). designToFlow emits these
 *  as real `cable` edges that participate in overrides + layers + the BOM. */
export interface UserEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  circuitType?: CableEdgeData['circuitType']
}

export interface DesignLayout {
  /** Persisted node positions keyed by diagram node id. */
  nodes: Record<string, NodePosition>
  /** Per-cable spec overrides keyed by edge id (material, size, runs, phase, conductors…). */
  edgeOverrides?: Record<string, Partial<CableEdgeData>>
  /** Per-component attribute overrides keyed by node id (e.g. busbar connection count, product). */
  nodeOverrides?: Record<string, Record<string, unknown>>
  /** User-drawn cables (item 53) — appended to the auto-derived edges. */
  userEdges?: UserEdge[]
}

export function defaultUserEdge(source = '', target = ''): UserEdge {
  return { id: mkId('uedge'), source, target }
}

/** Site climate + safety margins for temperature-corrected string-voltage sizing.
 *  Structurally matches StringDesignConditions in compliance.ts. */
export interface SiteConditions {
  /** Coldest expected ambient (°C) — sets the maximum Voc. */
  minAmbientC: number
  /** Hottest expected ambient (°C) — drives the hot cell temp → minimum Vmp. */
  maxAmbientC: number
  /** Edge-of-cloud over-irradiance margin (%) added to the cold Voc. */
  edgeOfCloudPct: number
}

// Gauteng / Highveld defaults (editable per project).
export const DEFAULT_SITE_CONDITIONS: SiteConditions = { minAmbientC: -2, maxAmbientC: 35, edgeOfCloudPct: 10 }

// ── Supply / main breaker (W82 breaker-led sizing) ───────────────────────────
// Matthew's on-site starting point: read the incoming main breaker, then size the
// inverter to comfortably take it over.
export interface SupplyConfig {
  /** Incoming main breaker rating (A). */
  mainBreakerA: number
  /** Supply phases. */
  phases: 1 | 3
  /** Line-to-line voltage (V): 230 single-phase, 400 three-phase. */
  voltageV: number
}

export function defaultSupply(): SupplyConfig {
  return { mainBreakerA: 60, phases: 1, voltageV: 230 }
}

/** Apparent power (kVA) the breaker can carry: 1φ = V×A, 3φ = √3×V_LL×A. */
export function supplyKva(s: SupplyConfig): number {
  const va = s.phases >= 3 ? Math.sqrt(3) * s.voltageV * s.mainBreakerA : s.voltageV * s.mainBreakerA
  return va / 1000
}

/** Inverter AC kW to comfortably cover the supply — ~90% of the breaker kVA
 *  (you rarely size the inverter to a full 100% of the main). */
export function recommendedInverterKw(s: SupplyConfig): number {
  return Math.round(supplyKva(s) * 0.9)
}

export interface SystemDesign {
  version: number
  energy: EnergyProfile
  panels: PanelGroup[]
  /** Site climate for string-voltage sizing (falls back to DEFAULT_SITE_CONDITIONS). */
  site?: SiteConditions
  /** Incoming supply / main breaker (W82) — drives breaker-led inverter sizing. */
  supply?: SupplyConfig
  dcCombiners: DcCombiner[]
  inverters: InverterUnit[]
  batteries: BatteryUnit[]
  bank: BatteryBank
  acCombiners: AcCombiner[]
  earthing: EarthingConfig
  extras: ExtraComponent[]
  /** Inverter monitoring/comms hardware (item 26). */
  monitoring?: MonitoringDevice[]
  /** Comms/data cabling links (item 30). */
  data?: DataConfig
  /** Building storeys for the install (drives the access/storey labour premium). */
  storeys?: number
  layout: DesignLayout
}

// ── Construction ────────────────────────────────────────────────────────────────

let idSeq = 0
export function mkId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`
}

export function emptyEnergy(): EnergyProfile {
  return {
    mode: 'monthly',
    curvePreset: null,
    hourly: null,
    dailyKwh: null,
    weeklyKwh: null,
    monthlyKwh: null,
    annualKwh: null,
    essentialLoadKw: null,
    weekly: null,
    monthlyProfile: null,
    annualProfile: null,
  }
}

export function emptyDesign(): SystemDesign {
  return {
    version: DESIGN_VERSION,
    energy: emptyEnergy(),
    panels: [],
    site: { ...DEFAULT_SITE_CONDITIONS },
    dcCombiners: [],
    inverters: [],
    batteries: [],
    bank: defaultBank(),
    acCombiners: [],
    earthing: { spikeCount: null, spec: 'CU GY 10mm²', electrodes: [], bars: [], conductors: [] },
    extras: [],
    monitoring: [],
    data: defaultDataConfig(),
    layout: { nodes: {} },
  }
}

function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const m = value.match(/[\d.]+/)
    return m ? parseFloat(m[0]) : 0
  }
  return 0
}

/**
 * Hydrate a design from a legacy `generated_quote` QuoteData blob, so existing
 * quotes open populated instead of blank. Lossy by design — only the fields the
 * canvas needs are carried across.
 */
export function quoteDataToDesign(q: Partial<QuoteData> | null | undefined): SystemDesign {
  const d = emptyDesign()
  if (!q) return d

  const monthly = num(q.monthlyUsageKwh)
  if (monthly > 0) d.energy.monthlyKwh = monthly

  const panelCount = Math.round(num(q.panelCount))
  const totalKwp = num(q.totalKwp)
  if (panelCount > 0) {
    const watts = totalKwp > 0 ? Math.round((totalKwp * 1000) / panelCount) : 0
    d.panels.push({
      id: mkId('panel'),
      label: 'Solar Array',
      panelCount,
      panelWatts: watts,
      panelModel: q.panelModel ?? '',
      catalogId: null,
      azimuth: null,
      pitch: null,
      roofType: '',
    })
  }

  const invKw = num(q.inverterKw)
  if (q.inverterModel || invKw > 0) {
    d.inverters.push({
      id: mkId('inv'),
      catalogId: null,
      model: q.inverterModel ?? '',
      kw: invKw,
      qty: Math.max(1, Math.round(num(q.inverterQty)) || 1),
      phases: invKw >= 10 ? 3 : 1,
    })
  }

  const batKwh = num(q.batteryKwh)
  if (q.batteryModel || batKwh > 0) {
    const qty = Math.max(1, Math.round(num(q.batteryQty)) || 1)
    d.batteries.push({
      id: mkId('bat'),
      catalogId: null,
      model: q.batteryModel ?? '',
      kwh: qty > 0 ? batKwh / qty : batKwh,
      qty,
    })
  }

  return d
}

/** Parse a stored jsonb value into a usable design (merging onto defaults). */
export function parseDesign(raw: unknown): SystemDesign | null {
  if (!raw) return null
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { return null }
  }
  if (typeof obj !== 'object' || obj === null) return null
  const base = emptyDesign()
  const src = obj as Partial<SystemDesign>
  const energy = { ...base.energy, ...(src.energy ?? {}) }
  if (!src.energy?.mode) energy.mode = inferEnergyMode(energy)
  // Shaping overlays (items 37–40) — keep null/empty when absent.
  energy.weekly = Array.isArray(src.energy?.weekly) ? src.energy!.weekly!.map((v) => num(v)) : (src.energy?.weekly ?? null)
  energy.monthlyProfile = Array.isArray(src.energy?.monthlyProfile) ? src.energy!.monthlyProfile!.map((v) => num(v)) : (src.energy?.monthlyProfile ?? null)
  energy.annualProfile = Array.isArray(src.energy?.annualProfile) ? src.energy!.annualProfile!.map((v) => num(v)) : (src.energy?.annualProfile ?? null)
  return {
    ...base,
    ...src,
    energy,
    bank: {
      ...base.bank,
      ...(src.bank ?? {}),
      // Backfill the disconnect product choices (item 23) from legacy ids when absent.
      perBatteryDisconnectChoice: src.bank?.perBatteryDisconnectChoice
        ?? (src.bank?.perBatteryDisconnectId ? { type: 'breaker', product: src.bank.perBatteryDisconnectId } : base.bank.perBatteryDisconnectChoice),
      mainDisconnectChoice: src.bank?.mainDisconnectChoice
        ?? (src.bank?.mainDisconnectId ? { type: 'isolator', product: src.bank.mainDisconnectId } : base.bank.mainDisconnectChoice),
      busbarSpec: src.bank?.busbarSpec ?? null,
      cables: (src.bank?.cables ?? []).map((c) => ({
        ...c,
        runs: c.runs || 1,
        material: c.material ?? 'CU',
        sizeMm2: c.sizeMm2 ?? '',
        label: c.label ?? '',
      })),
    },
    earthing: {
      ...base.earthing,
      ...(src.earthing ?? {}),
      electrodes: (src.earthing?.electrodes ?? []).map((el) => ({ ...el, arrangement: el.arrangement ?? 'line', groupSize: el.groupSize ?? 1, linkMm2: el.linkMm2 ?? 16 })),
    },
    layout: {
      nodes: { ...(src.layout?.nodes ?? {}) },
      edgeOverrides: { ...(src.layout?.edgeOverrides ?? {}) },
      nodeOverrides: { ...(src.layout?.nodeOverrides ?? {}) },
      // User-drawn cables (item 53).
      userEdges: (src.layout?.userEdges ?? []).map((u) => ({
        ...u,
        id: u.id ?? mkId('uedge'),
        sourceHandle: u.sourceHandle,
        targetHandle: u.targetHandle,
      })),
    },
    // Panel distance + jumpers (items 41/42) — optional, left undefined when absent.
    panels: (src.panels ?? []).map((p) => ({
      ...p,
      distanceFromCombinerM: p.distanceFromCombinerM ?? undefined,
      jumpers: p.jumpers ?? undefined,
    })),
    // Backfill combiners saved before the product-driven protection model. The new
    // internals list (item 44) defaults EMPTY; legacy stringConnections stay parseable.
    dcCombiners: (src.dcCombiners ?? []).map((c) => ({
      ...c,
      enclosureCatalogId: c.enclosureCatalogId ?? null,
      stringConnections: c.stringConnections ?? {},
      outputs: (c.outputs ?? []).map((o) => ({ ...o, spdId: o.spdId ?? null, mainBreakerId: o.mainBreakerId ?? null })),
      components: (c.components ?? []).map((k) => ({ ...k, product: k.product ?? null, qty: k.qty || 1, fedFrom: Array.isArray(k.fedFrom) ? k.fedFrom : [] })),
    })),
    // Inverter phase config + capability toggles (items 50/51). Derive `phases`
    // from phaseConfig when present so existing logic still reads a 1|3.
    inverters: (src.inverters ?? []).map((u) => ({
      ...u,
      phases: u.phaseConfig ? phaseConfigToPhases(u.phaseConfig) : (u.phases ?? 1),
      phaseConfig: u.phaseConfig ?? undefined,
      acceptsPv: u.acceptsPv ?? undefined,
      acceptsBattery: u.acceptsBattery ?? undefined,
    })),
    batteries: src.batteries ?? [],
    acCombiners: (src.acCombiners ?? []).map(normalizeAcCombiner),
    extras: (src.extras ?? []).map((x) => ({
      ...x,
      productId: x.productId ?? null,
      data: x.data ?? {},
      components: (x.components ?? []).map((sc) => ({ ...sc, product: sc.product ?? null, qty: sc.qty || 1 })),
    })),
    monitoring: (src.monitoring ?? []).map((m) => ({
      ...m,
      catalogId: m.catalogId ?? null,
      inverterId: m.inverterId ?? null,
      // Item 52: targetId supersedes inverterId; backfill from it for old saves.
      targetId: m.targetId ?? m.inverterId ?? null,
      role: m.role ?? 'additional',
      commsType: m.commsType ?? 'wifi',
      commsOther: m.commsOther ?? '',
      label: m.label ?? 'Monitoring',
    })),
    data: { links: (src.data?.links ?? []).map((l) => ({ ...l, protocol: l.protocol ?? '', note: l.note ?? '', termination: l.termination ?? 'crimp', cableType: l.cableType ?? 'Cat6' })) },
    version: DESIGN_VERSION,
  }
}

// ── Energy resolution ────────────────────────────────────────────────────────────
// "Fill in one or two fields, or pick a curve, and it infers the rest."

// Relative 24h load shapes (un-normalised weights). Normalised at use.
export const LOAD_CURVES: Record<Exclude<CurvePreset, 'custom'>, number[]> = {
  // At home all day — steady base, morning + evening bumps.
  home_all_day: [
    0.4, 0.35, 0.3, 0.3, 0.35, 0.5, 0.9, 1.1, 1.0, 0.8, 0.7, 0.7,
    0.75, 0.7, 0.65, 0.7, 0.85, 1.1, 1.4, 1.5, 1.35, 1.0, 0.7, 0.5,
  ],
  // Business hours 9–5 — daytime heavy, quiet nights.
  business_9_5: [
    0.15, 0.12, 0.1, 0.1, 0.12, 0.2, 0.35, 0.6, 1.0, 1.3, 1.35, 1.3,
    1.1, 1.25, 1.3, 1.2, 1.0, 0.6, 0.35, 0.25, 0.2, 0.18, 0.16, 0.15,
  ],
  // Evening peak — low daytime, strong evening.
  evening_peak: [
    0.3, 0.25, 0.22, 0.22, 0.25, 0.4, 0.7, 0.8, 0.5, 0.35, 0.3, 0.3,
    0.35, 0.3, 0.3, 0.4, 0.7, 1.1, 1.5, 1.7, 1.6, 1.2, 0.8, 0.45,
  ],
}

export function normalizeCurve(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  return weights.map((w) => w / sum)
}

export type EnergySource =
  | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual' | 'record' | 'none'

export interface ResolvedEnergy {
  /** kWh per day, or null when nothing is known yet. */
  dailyKwh: number | null
  /** 24 hourly values when a shape is known (entered or derived from a curve). */
  hourly: number[] | null
  /** Where the daily magnitude came from. */
  source: EnergySource
}

/**
 * Collapse partial energy inputs into a single daily kWh + optional hourly shape.
 * Magnitude precedence: explicit hourly → daily → weekly → monthly → annual →
 * the survey's monthly_kwh. A curve only shapes the hourly array; it never
 * invents a magnitude.
 */
/** When a stored design predates `mode`, infer it from whichever total is set. */
export function inferEnergyMode(
  e: Pick<EnergyProfile, 'hourly' | 'dailyKwh' | 'weeklyKwh' | 'monthlyKwh' | 'annualKwh'>,
): EnergyMode {
  if ((e.hourly && e.hourly.some((v) => v > 0)) || (e.dailyKwh ?? 0) > 0) return 'daily'
  if ((e.weeklyKwh ?? 0) > 0) return 'weekly'
  if ((e.annualKwh ?? 0) > 0) return 'annual'
  return 'monthly'
}

/**
 * Collapse the energy profile into a single daily kWh + optional hourly shape.
 * Only the ACTIVE mode's field is read — the tabs guarantee one granularity at a
 * time. An empty field falls back to the survey's monthly_kwh. The hourly shape
 * (entered or curve-derived) only applies in daily mode.
 */
export function resolveEnergy(
  e: EnergyProfile,
  record?: { monthly_kwh?: string | number | null } | null,
): ResolvedEnergy {
  const fallback = record?.monthly_kwh != null && num(record.monthly_kwh) > 0
    ? num(record.monthly_kwh) / DAYS_PER_MONTH
    : null
  let dailyKwh: number | null = null
  let hourly: number[] | null = null
  let source: EnergySource = 'none'

  switch (e.mode) {
    case 'daily': {
      const hasHourly = !!e.hourly && e.hourly.some((v) => v > 0)
      if (hasHourly) {
        hourly = e.hourly!.slice(0, 24)
        dailyKwh = hourly.reduce((a, b) => a + (b || 0), 0)
        source = 'hourly'
      } else if (e.dailyKwh != null && e.dailyKwh > 0) {
        dailyKwh = e.dailyKwh; source = 'daily'
      } else if (fallback != null) {
        dailyKwh = fallback; source = 'record'
      }
      if (!hasHourly && dailyKwh != null && e.curvePreset && e.curvePreset !== 'custom') {
        const curve = LOAD_CURVES[e.curvePreset]
        if (curve) hourly = normalizeCurve(curve).map((f) => +(f * dailyKwh!).toFixed(3))
      }
      break
    }
    case 'weekly':
      if (e.weeklyKwh != null && e.weeklyKwh > 0) { dailyKwh = e.weeklyKwh / 7; source = 'weekly' }
      else if (fallback != null) { dailyKwh = fallback; source = 'record' }
      break
    case 'annual':
      if (e.annualKwh != null && e.annualKwh > 0) { dailyKwh = e.annualKwh / 365; source = 'annual' }
      else if (fallback != null) { dailyKwh = fallback; source = 'record' }
      break
    case 'monthly':
    default:
      if (e.monthlyKwh != null && e.monthlyKwh > 0) { dailyKwh = e.monthlyKwh / DAYS_PER_MONTH; source = 'monthly' }
      else if (fallback != null) { dailyKwh = fallback; source = 'record' }
      break
  }

  return { dailyKwh, hourly, source }
}

// ── Seasonal monthly spread (SA) ────────────────────────────────────────────────

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// SA residential seasonal usage shape — winter-heavy — normalised to average 1.0.
export const MONTHLY_USAGE_FACTORS = [0.82, 0.82, 0.88, 0.98, 1.12, 1.30, 1.34, 1.22, 1.02, 0.92, 0.82, 0.76]

/** Spread a representative monthly figure across the year by the seasonal shape. */
export function seasonalMonthly(avgMonthlyKwh: number): number[] {
  return MONTHLY_USAGE_FACTORS.map((f) => Math.round(avgMonthlyKwh * f))
}

export const ENERGY_SOURCE_LABEL: Record<EnergySource, string> = {
  hourly: 'from hourly profile',
  daily: 'from daily figure',
  weekly: 'from weekly figure',
  monthly: 'from monthly figure',
  annual: 'from annual figure',
  record: 'from survey usage',
  none: 'not set',
}

// ── Generation + sizing ──────────────────────────────────────────────────────────

export function panelGroupKwp(g: PanelGroup): number {
  return (g.panelCount * g.panelWatts) / 1000
}

export function designTotalKwp(d: SystemDesign): number {
  return d.panels.reduce((s, g) => s + panelGroupKwp(g), 0)
}

export function designInverterKw(d: SystemDesign): number {
  return d.inverters.reduce((s, u) => s + u.kw * u.qty, 0)
}

export function designBatteryKwh(d: SystemDesign): number {
  return d.batteries.reduce((s, b) => s + b.kwh * b.qty, 0)
}

export interface GenerationOpts {
  sunHours?: number
  efficiency?: number
  season?: Season
}

/**
 * Daily generation (kWh). Per the locked decision this uses the existing
 * constants — 5 kWp ≈ 5.3 × 0.8 ≈ 21 kWh/day — but a panel group that carries a
 * roof azimuth + pitch is run through the hourly solar model instead.
 */
export function generationDailyKwh(d: SystemDesign, opts: GenerationOpts = {}): number {
  const sunHours = opts.sunHours ?? PSH_GAUTENG
  const eff = opts.efficiency ?? SYSTEM_EFFICIENCY
  let total = 0
  for (const g of d.panels) {
    if (g.panelCount <= 0 || g.panelWatts <= 0) continue
    if (g.azimuth != null && g.pitch != null) {
      total += calculateStringGeneration(
        g.panelCount, g.panelWatts, g.azimuth, g.pitch, opts.season ?? 'average',
      ).daily_kwh
    } else {
      total += panelGroupKwp(g) * sunHours * eff
    }
  }
  return total
}

export type VerdictLevel = 'ok' | 'info' | 'warn' | 'block'

export interface SizingVerdict {
  id: string
  level: VerdictLevel
  label: string
}

export interface DesignBalance {
  demandKwh: number | null
  demandSource: EnergySource
  generationKwh: number
  totalKwp: number
  inverterKw: number
  batteryKwh: number
  /** Load basis used for storage hours (essential load, else avg from demand). */
  loadKw: number | null
  storageHours: number | null
  /** generation ÷ demand, as a %. null when demand unknown. */
  coveragePct: number | null
  verdicts: SizingVerdict[]
}

/**
 * The numbers behind the live balance header. Numeric-only and pure: richer
 * catalog-aware checks (verifyPanelString, evaluateBatteryForInverter) are run
 * by the section editors, which already hold the loaded catalog.
 */
export function computeBalance(
  d: SystemDesign,
  record?: { monthly_kwh?: string | number | null } | null,
): DesignBalance {
  const resolved = resolveEnergy(d.energy, record)
  const demandKwh = resolved.dailyKwh
  const generationKwh = generationDailyKwh(d)
  const totalKwp = designTotalKwp(d)
  const inverterKw = designInverterKw(d)
  const batteryKwh = designBatteryKwh(d)

  const essential = d.energy.essentialLoadKw
  const loadKw = essential && essential > 0
    ? essential
    : (demandKwh != null && demandKwh > 0 ? demandKwh / 24 : null)
  const storageHours = batteryKwh > 0 && loadKw && loadKw > 0 ? batteryKwh / loadKw : null
  const coveragePct = demandKwh && demandKwh > 0 ? (generationKwh / demandKwh) * 100 : null

  const verdicts: SizingVerdict[] = []

  if (totalKwp > 0 && inverterKw <= 0) {
    verdicts.push({ id: 'inv-missing', level: 'info', label: 'Add an inverter to size the array' })
  }
  if (totalKwp > 0 && inverterKw > 0) {
    const ratio = totalKwp / inverterKw
    if (ratio > MAX_RECOMMENDED_DC_AC_RATIO) {
      verdicts.push({ id: 'inv-small', level: 'warn', label: `Inverter undersized — DC:AC ${ratio.toFixed(2)} (max ${MAX_RECOMMENDED_DC_AC_RATIO})` })
    } else if (ratio < 0.5) {
      verdicts.push({ id: 'inv-big', level: 'info', label: `Inverter oversized for the array — DC:AC ${ratio.toFixed(2)}` })
    } else {
      verdicts.push({ id: 'inv-ok', level: 'ok', label: `Inverter sizing OK — DC:AC ${ratio.toFixed(2)}` })
    }
  }
  if (inverterKw > 0 && essential && essential > 0 && inverterKw < essential) {
    verdicts.push({ id: 'inv-load', level: 'warn', label: `Inverter ${inverterKw}kW below essential load ${essential}kW` })
  }
  if (inverterKw > 0 && batteryKwh > 0) {
    const minKwh = inverterKw * MIN_BATTERY_KWH_PER_INVERTER_KW
    if (batteryKwh < minKwh) {
      verdicts.push({ id: 'bat-min', level: 'info', label: `Battery ${batteryKwh.toFixed(1)}kWh below ${minKwh.toFixed(0)}kWh guide for ${inverterKw}kW` })
    }
    const cr = batteryCRate(inverterKw, batteryKwh)
    if (cr.level === 'block') verdicts.push({ id: 'bat-crate', level: 'block', label: `Battery ${cr.label}` })
    else if (cr.level === 'warn') verdicts.push({ id: 'bat-crate', level: 'warn', label: `Battery C-rate ${cr.cRate?.toFixed(2)}C — above 0.5C` })
  }

  return {
    demandKwh,
    demandSource: resolved.source,
    generationKwh,
    totalKwp,
    inverterKw,
    batteryKwh,
    loadKw,
    storageHours,
    coveragePct,
    verdicts,
  }
}

// ── Battery electrical (C-rate + DC cable) ──────────────────────────────────────
// LV LiFePO4 nominal; HV stacks differ — see the battery-config reference doc.
export const DEFAULT_BATTERY_VOLTAGE = 51.2

// Conservative single-core copper DC ampacity (A) by mm² (free-air, ~75°C).
export const DC_CABLE_AMPACITY: Record<number, number> = {
  6: 50, 10: 70, 16: 100, 25: 125, 35: 160, 50: 200, 70: 255, 95: 315,
}

export type CRateLevel = 'ideal' | 'good' | 'warn' | 'block'

export interface CRateResult {
  cRate: number | null
  level: CRateLevel | null
  label: string
}

/**
 * Continuous C-rate proxy = inverter kW ÷ battery kWh. Thresholds per Matthew:
 * >1C damages the pack (block), 0.5–1C is hard on it (warn), ≤0.5C realistic
 * (good), ≤0.2C ideal for longevity.
 */
export function batteryCRate(inverterKw: number, batteryKwh: number): CRateResult {
  if (inverterKw <= 0 || batteryKwh <= 0) return { cRate: null, level: null, label: '' }
  const c = inverterKw / batteryKwh
  if (c > 1) return { cRate: c, level: 'block', label: `${c.toFixed(2)}C — over 1C: battery damaged at full inverter draw` }
  if (c > 0.5) return { cRate: c, level: 'warn', label: `${c.toFixed(2)}C — above 0.5C, hard on the pack` }
  if (c > 0.2) return { cRate: c, level: 'good', label: `${c.toFixed(2)}C — realistic (under 0.5C)` }
  return { cRate: c, level: 'ideal', label: `${c.toFixed(2)}C — ideal for longevity (≤0.2C)` }
}

/** Approx battery DC current (A) at full inverter draw. */
export function batteryDcCurrent(inverterKw: number, voltage = DEFAULT_BATTERY_VOLTAGE): number {
  return voltage > 0 ? (inverterKw * 1000) / voltage : 0
}

/** How many parallel runs of a given cable size are needed at 125% of the current. */
export function cableRunsNeeded(currentA: number, sizeMm2: number): number {
  const amp = DC_CABLE_AMPACITY[sizeMm2] ?? 0
  if (amp <= 0 || currentA <= 0) return 1
  return Math.max(1, Math.ceil((currentA * 1.25) / amp))
}

// ── Diagram projection (design → React-Flow) ────────────────────────────────────
// 1:1 nodes so a panel group edited in the diagram maps straight back to the
// Panels section. Edges are auto-derived each render (cosmetic in Phase 1).

// Stable node ids ↔ design entities. The first DC combiner keeps the legacy
// `combiner` id (so saved layouts/overrides still resolve); the rest are indexed.
export const NODE = {
  panel: (i: number) => `panel-${i}`,
  combiner: 'combiner',
  combinerN: (i: number) => (i === 0 ? 'combiner' : `combiner-${i}`),
  inverter: 'inverter',
  battery: 'battery',
  grid: 'grid',
  db: 'db',
  earth: 'earth',
}

export type DesignNodeRef =
  | { kind: 'panel'; index: number }
  | { kind: 'inverter' }
  | { kind: 'battery' }
  | { kind: 'combiner'; index: number }
  | { kind: 'grid' }
  | { kind: 'db' }
  | { kind: 'earth' }

export function nodeIdToRef(id: string): DesignNodeRef | null {
  if (id.startsWith('panel-')) {
    const index = parseInt(id.slice('panel-'.length), 10)
    return Number.isInteger(index) ? { kind: 'panel', index } : null
  }
  if (id.startsWith('combiner-')) {
    const index = parseInt(id.slice('combiner-'.length), 10)
    return Number.isInteger(index) ? { kind: 'combiner', index } : null
  }
  switch (id) {
    case 'inverter': return { kind: 'inverter' }
    case 'battery': return { kind: 'battery' }
    case 'combiner': return { kind: 'combiner', index: 0 }
    case 'grid': return { kind: 'grid' }
    case 'db': return { kind: 'db' }
    case 'earth': return { kind: 'earth' }
    default: return null
  }
}

function cableData(circuitType: CableEdgeData['circuitType'], spec: string, lengthM: number): CableEdgeData {
  return {
    spec, lengthM, circuitType,
    cableType: spec.split(' ')[0],
    crossSection: spec.match(/\d+mm²/)?.[0],
  }
}

/** AC cable whose conductor label reflects the phase (L/N/E vs L1/L2/L3/N/E),
 *  or split-phase L1/L2/N/E when a phaseConfig is supplied (item 50). */
function acCableData(spec: string, lengthM: number, phase: number, phaseConfig?: InverterPhaseConfig): CableEdgeData {
  return { ...cableData('ac', spec, lengthM), conductors: { l1: phase >= 3 }, ...(phaseConfig ? { phaseConfig } : {}) }
}

export interface FlowGraph { nodes: Node[]; edges: Edge[] }

/** Build the diagram from the design. Positions come from saved layout when present. */
export function designToFlow(d: SystemDesign, opts: { gridSupply?: string; detail?: 'simple' | 'detailed' } = {}): FlowGraph {
  const nodes: Node[] = []
  const edges: Edge[] = []
  // Level of detail for canvas readability. BOM + legacy callers omit it → full
  // detail, so the priced cabling is never affected by the simplified view.
  const detail = opts.detail ?? 'detailed'
  const pos = (id: string, fallback: NodePosition): NodePosition => d.layout.nodes[id] ?? fallback

  // Phase comes from real equipment, never a kW heuristic. The grid follows the
  // site supply; the inverter (and the AC it feeds) follows its own spec — so a
  // single-phase 10kW inverter is shown single-phase, not forced to three.
  const gridPhase: 1 | 3 =
    opts.gridSupply?.toLowerCase().includes('three') || opts.gridSupply?.toLowerCase().includes('3 phase') ? 3 : 1
  // Phase + AC topology follow the inverter's phaseConfig when set (item 50).
  const inverterPhase: 1 | 3 = d.inverters[0] ? inverterPhases(d.inverters[0]) : gridPhase
  const inverterPhaseConfig: InverterPhaseConfig | undefined = d.inverters[0]?.phaseConfig
  // Capability toggles (item 51): an inverter without a built-in MPPT draws no PV
  // strings; one that can't take a battery suppresses the battery nodes/edges.
  const acceptsPv = d.inverters[0] ? inverterAcceptsPv(d.inverters[0]) : true
  const acceptsBattery = d.inverters[0] ? inverterAcceptsBattery(d.inverters[0]) : true

  const groupCount = d.panels.length
  const useCombiner = groupCount > 1 || d.dcCombiners.length > 0
  const e = d.earthing
  const hasEarthMap = e.electrodes.length > 0 || e.bars.length > 0 || e.conductors.length > 0

  // Layout anchors (mirror the established SLD layout).
  const CX = 500
  const GAP = 280
  const startX = CX - ((groupCount - 1) * GAP) / 2
  const Y0 = 0
  const Y_COMB = 240
  const Y_INV = useCombiner ? 490 : 290
  const INV_X = CX - 130
  const GRID_X = INV_X - 380
  const DB_X = INV_X + 380
  const Y_BAT = Y_INV + 280

  // Panel groups
  d.panels.forEach((g, i) => {
    const id = NODE.panel(i)
    nodes.push({
      id,
      type: 'solarArray',
      position: pos(id, { x: startX + i * GAP - 110, y: Y0 }),
      data: {
        label: g.label || (groupCount > 1 ? `String ${i + 1}` : 'Solar Array'),
        panelCount: g.panelCount,
        panelModel: g.panelModel,
        wpPerPanel: g.panelWatts,
        totalKwp: +panelGroupKwp(g).toFixed(2),
        config: g.panelCount > 0 ? `${g.panelCount}S` : '',
      },
    })
  })

  // ── DC combiner(s) (items 34/44) ──────────────────────────────────────────────
  // One node per explicit dcCombiners[] entry, each wired from ITS assigned strings
  // (inputStringIds, by panel-group id) and feeding the inverter. Two combiners on
  // two different strings both appear, correctly wired. When there's no explicit
  // combiner but multiple strings exist, a single implicit combiner is emitted.
  const panelIndexById = new Map<string, number>()
  d.panels.forEach((g, i) => panelIndexById.set(g.id, i))
  // The string node-indices feeding each combiner. Explicit combiners use their
  // inputStringIds (falling back to all strings when empty); the implicit combiner
  // gathers every string.
  const combinerStringIdx = (c: DcCombiner | undefined): number[] => {
    if (!c) return d.panels.map((_, i) => i)
    const idx = c.inputStringIds.map((sid) => panelIndexById.get(sid)).filter((x): x is number => x != null)
    return idx.length ? idx : d.panels.map((_, i) => i)
  }
  // The list of combiners to render: explicit entries, or one implicit when needed.
  const renderCombiners: Array<DcCombiner | undefined> =
    d.dcCombiners.length > 0 ? d.dcCombiners : (useCombiner && groupCount > 0 ? [undefined] : [])
  const COMB_GAP = 280
  const combStartX = CX - 110 - ((renderCombiners.length - 1) * COMB_GAP) / 2
  if (groupCount > 0) {
    renderCombiners.forEach((explicit, ci) => {
      const id = NODE.combinerN(ci)
      const strIdx = combinerStringIdx(explicit)
      const outCount = explicit ? Math.max(1, explicit.outputs.length) : 1
      nodes.push({
        id,
        type: 'combiner',
        position: pos(id, { x: combStartX + ci * COMB_GAP, y: Y_COMB }),
        data: {
          label: explicit?.label || 'DC Combiner Box',
          stringCount: strIdx.length || groupCount,
          hasSpd: explicit ? explicit.outputs.some((o) => !!o.spdId) : true,
          config: explicit ? combinerConfigLabel(explicit) : `${groupCount}-string`,
          // Ports (item 22/44): inputs = wired strings, outputs = combined feeds.
          inputCount: strIdx.length || groupCount,
          outputCount: outCount,
        },
      })
      // Input edges from each assigned string.
      strIdx.forEach((pi, k) => {
        edges.push({
          id: ci === 0 ? `e-panel${pi}-comb` : `e-panel${pi}-comb${ci}`,
          source: NODE.panel(pi),
          target: id,
          sourceHandle: 'dc-out',
          targetHandle: `str-${k}`,
          type: 'cable',
          data: cableData('dc', 'H1Z2Z2 6mm²', 12),
          label: buildEdgeLabel(cableData('dc', 'H1Z2Z2 6mm²', 12)),
        })
      })
    })
  }

  // Inverter (Phase 1: single representative node carrying total kW + qty)
  const invKw = designInverterKw(d)
  const inv0 = d.inverters[0]
  if (inv0 || invKw > 0) {
    const id = NODE.inverter
    const totalQty = d.inverters.reduce((s, u) => s + u.qty, 0) || 1
    nodes.push({
      id,
      type: 'inverter',
      position: pos(id, { x: INV_X, y: Y_INV }),
      data: {
        label: totalQty > 1 ? `Inverter ×${totalQty}` : 'Inverter',
        model: inv0?.model ?? '',
        kw: invKw,
        phases: inverterPhase,
        phaseConfig: inverterPhaseConfig,
        acceptsPv,
        acceptsBattery,
        hasBattery: acceptsBattery && d.batteries.length > 0,
        outputCount: 1,
      },
    })

    // PV → inverter. Item 51: when the inverter has no built-in MPPT (acceptsPv ===
    // false) no PV strings/combiners feed it, so no PV edge is drawn. Item 34: each
    // combiner's output feeds the inverter; without a combiner the first string does.
    if (acceptsPv) {
      if (renderCombiners.length > 0 && groupCount > 0) {
        renderCombiners.forEach((_, ci) => {
          edges.push({
            id: ci === 0 ? 'e-comb-inv' : `e-comb${ci}-inv`, source: NODE.combinerN(ci), target: id,
            sourceHandle: 'dc-out', targetHandle: 'pv-in', type: 'cable',
            data: cableData('dc', 'H1Z2Z2 6mm²', 8),
            label: buildEdgeLabel(cableData('dc', 'H1Z2Z2 6mm²', 8)),
          })
        })
      } else if (groupCount > 0) {
        edges.push({
          id: 'e-panel0-inv', source: NODE.panel(0), target: id,
          sourceHandle: 'dc-out', targetHandle: 'pv-in', type: 'cable',
          data: cableData('dc', 'H1Z2Z2 6mm²', 15),
          label: buildEdgeLabel(cableData('dc', 'H1Z2Z2 6mm²', 15)),
        })
      }
    }
  }

  // ── Battery bank — granular wiring: batteries → [disconnect] → [busbar] → [main] → inverter
  // Item 51: an inverter that can't take a battery (acceptsBattery === false, e.g.
  // AC-coupled / grid-tie) suppresses the whole battery sub-graph.
  const batKwh = designBatteryKwh(d)
  const bat0 = d.batteries[0]
  if (acceptsBattery && (bat0 || batKwh > 0) && (invKw > 0 || inv0)) {
    // Simple mode collapses the whole bank to one node for readability; Detailed
    // keeps the per-unit disconnect/busbar wiring. (BOM always uses Detailed edges.)
    if (detail === 'simple') {
      const totalQty = d.batteries.reduce((s, b) => s + b.qty, 0) || 1
      nodes.push({ id: NODE.battery, type: 'battery', position: pos(NODE.battery, { x: INV_X - 30, y: Y_BAT }), data: { label: totalQty > 1 ? `Battery bank ×${totalQty}` : 'Battery', model: bat0?.model ?? '', qty: totalQty, totalKwh: +batKwh.toFixed(1), chemistry: 'LiFePO4' } })
      const mRuns = cableRunsNeeded(batteryDcCurrent(invKw, d.bank.cutoffVoltage), d.bank.cableSizeMm2)
      const bspec = `CU ${d.bank.cableSizeMm2}mm²`
      edges.push({ id: 'e-bat-inv', source: NODE.battery, target: NODE.inverter, sourceHandle: 'bat-out', targetHandle: 'bat-in', type: 'cable', data: { ...cableData('battery', bspec, 2), runs: mRuns }, label: `${mRuns > 1 ? `${mRuns}× ` : ''}${bspec}` })
      edges.push({ id: 'e-bms-comms', source: NODE.battery, target: NODE.inverter, sourceHandle: 'bat-out', targetHandle: 'bat-in', type: 'cable', data: { ...cableData('communication', 'CAN/RS485', 3), circuitLayer: 'communication', routingType: 'bezier' }, label: 'BMS · CAN' })
    } else {
    const bank = d.bank
    const batSize = bank.cableSizeMm2
    // Thick feed sized to worst-case full current; per-battery cables stay single.
    const mainRuns = cableRunsNeeded(batteryDcCurrent(invKw, bank.cutoffVoltage), batSize)
    // Item 28: an itemised bank cable matching this from/to pair overrides the default.
    const bankCables = bank.cables ?? []
    const findBankCable = (from: string, to: string): BankCable | undefined =>
      bankCables.find((c) => (c.fromRef === from && c.toRef === to) || (c.fromRef === to && c.toRef === from))
    const cable = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string, runs = 1) => {
      const match = findBankCable(source, target)
      const material = match?.material || 'CU'
      const size = match?.sizeMm2 || `${batSize}`
      const finalRuns = match ? Math.max(1, Math.round(Number(match.runs) || 1)) : runs
      const spec = `${material} ${size}mm²`
      edges.push({
        id, source, target, sourceHandle, targetHandle, type: 'cable',
        data: { ...cableData('battery', spec, 2), runs: finalRuns },
        label: `${finalRuns > 1 ? `${finalRuns}× ` : ''}${spec}`,
      })
    }

    // One node per physical battery (capped so the row stays readable).
    const units: Array<{ model: string; kwh: number }> = []
    for (const b of d.batteries) for (let k = 0; k < b.qty; k++) units.push({ model: b.model, kwh: b.kwh })
    const N = Math.min(units.length || 1, 12)

    const hasMain = bank.mainDisconnect
    const hasBus = bank.busbar
    const hasDisc = bank.perBatteryDisconnect
    const Y_MAIN = Y_INV + 140
    const Y_BUS = Y_BAT
    const Y_DISC = Y_INV + 430
    const Y_BATT = Y_INV + 560

    // Busbar ports: one per battery by default, or an explicit override count.
    // Battery taps clamp into the available ports below, so any value stays wired.
    const overrideConn = Math.round(Number((d.layout.nodeOverrides?.['bat-busbar'] as { connections?: number } | undefined)?.connections) || 0)
    const busConn = overrideConn > 0 ? overrideConn : N

    // Item 23: the main + per-battery disconnect product/type chosen in the section.
    const mainChoice = bank.mainDisconnectChoice
    const perBatChoice = bank.perBatteryDisconnectChoice
    if (hasMain) {
      nodes.push({
        id: 'bat-main', type: 'busblock', position: pos('bat-main', { x: INV_X + 10, y: Y_MAIN }),
        data: {
          kind: 'disconnect',
          label: mainChoice?.product || 'Main disconnect',
          product: mainChoice?.product ?? bank.mainDisconnectId ?? null,
          disconnectType: mainChoice?.type ?? 'isolator',
          inputCount: 1, outputCount: 1,
        },
      })
      cable('e-main-inv', 'bat-main', NODE.inverter, 'up', 'bat-in', mainRuns)
    }
    if (hasBus) {
      nodes.push({ id: 'bat-busbar', type: 'busblock', position: pos('bat-busbar', { x: INV_X - 30, y: Y_BUS }), data: { kind: 'busbar', label: 'DC busbar', connections: busConn, inputCount: busConn, outputCount: 1 } })
      if (hasMain) cable('e-bus-main', 'bat-busbar', 'bat-main', 'out-0', 'down', mainRuns)
      else cable('e-bus-inv', 'bat-busbar', NODE.inverter, 'out-0', 'bat-in', mainRuns)
    }
    const mergeId = hasBus ? 'bat-busbar' : hasMain ? 'bat-main' : NODE.inverter
    const mergeHandle = hasMain ? 'down' : 'bat-in'   // busbar uses a dedicated port per battery below
    // A single battery wired straight to the inverter carries the full feed.
    const directFull = mergeId === NODE.inverter && N === 1 ? mainRuns : 1

    const spacing = 150
    const startX = INV_X + 35 - ((N - 1) * spacing) / 2
    for (let i = 0; i < N; i++) {
      const u = units[i] ?? { model: bat0?.model ?? '', kwh: batKwh }
      const bx = startX + i * spacing
      const bid = i === 0 ? NODE.battery : `batt-${i}`
      const into = hasBus ? `in-${Math.min(i, busConn - 1)}` : mergeHandle
      nodes.push({ id: bid, type: 'battery', position: pos(bid, { x: bx, y: Y_BATT }), data: { label: `Battery ${i + 1}`, model: u.model, qty: 1, totalKwh: +u.kwh.toFixed(1), chemistry: 'LiFePO4' } })
      if (hasDisc) {
        const did = `bat-disc-${i}`
        nodes.push({
          id: did, type: 'busblock', position: pos(did, { x: bx, y: Y_DISC }),
          data: {
            kind: 'disconnect',
            label: perBatChoice?.product || 'Disc',
            product: perBatChoice?.product ?? bank.perBatteryDisconnectId ?? null,
            disconnectType: perBatChoice?.type ?? 'breaker',
            inputCount: 1, outputCount: 1,
          },
        })
        cable(`e-bat${i}-disc`, bid, did, 'bat-out', 'down')
        cable(`e-disc${i}`, did, mergeId, 'up', into, directFull)
      } else {
        cable(`e-bat${i}`, bid, mergeId, 'bat-out', into, directFull)
      }
    }

    // BMS communications (Data layer) — battery ↔ inverter. Bezier so it rides its
    // own lane instead of overlapping the power/AC cables.
    edges.push({
      id: 'e-bms-comms', source: NODE.battery, target: NODE.inverter,
      sourceHandle: 'bat-out', targetHandle: 'bat-in', type: 'cable',
      data: { ...cableData('communication', 'CAN/RS485', 3), circuitLayer: 'communication', routingType: 'bezier' },
      label: 'BMS · CAN',
    })
    }
  }

  // Grid + DB + Earth only become meaningful once there's an inverter.
  if (inv0 || invKw > 0) {
    const gridId = NODE.grid
    nodes.push({
      id: gridId, type: 'grid',
      position: pos(gridId, { x: GRID_X, y: Y_INV + 20 }),
      data: { label: 'Grid Supply', utility: 'Eskom', voltage: gridPhase === 3 ? 400 : 230, phases: gridPhase, breakerA: 63 },
    })
    edges.push({
      id: 'e-grid-inv', source: gridId, target: NODE.inverter,
      sourceHandle: 'ac-out', targetHandle: 'grid-in', type: 'cable',
      data: acCableData('CU 6mm²', 5, gridPhase), label: buildEdgeLabel(acCableData('CU 6mm²', 5, gridPhase)),
    })

    const dbId = NODE.db
    // Item 22: the board's outgoing ways = the count of devices fed from the supply
    // (its outgoing circuits); default 1 when no explicit AC board is configured.
    const acBoard = d.acCombiners[0]
    const dbOutputCount = acBoard
      ? Math.max(1, acBoard.components.filter((c) => c.fedFrom.includes(DB_SUPPLY_ID)).length)
      : 1
    nodes.push({
      id: dbId, type: 'dbBoard',
      position: pos(dbId, { x: DB_X, y: Y_INV }),
      data: {
        label: acBoard?.label || 'Distribution Board',
        mainBreakerA: inverterPhase === 3 ? 63 : 40, rccbA: 30, phases: inverterPhase,
        inputCount: 1, outputCount: dbOutputCount,
        // W83: the board's internal devices, rendered inside the node (mini single-line).
        // Simple mode collapses to the Main CB / ways summary for readability.
        components: detail === 'simple' || !acBoard ? [] : acBoard.components.map((k) => ({ kind: k.kind, label: k.label, qty: k.qty })),
      },
    })
    edges.push({
      id: 'e-inv-db', source: NODE.inverter, target: dbId,
      sourceHandle: 'ac-out', targetHandle: 'ac-in', type: 'cable',
      // Item 50: the AC output cable's conductors follow the inverter's phaseConfig.
      data: acCableData('CU 6mm²', 8, inverterPhase, inverterPhaseConfig), label: buildEdgeLabel(acCableData('CU 6mm²', 8, inverterPhase, inverterPhaseConfig)),
    })

    // Default single earth node — only until a detailed earth map is drawn.
    if (!hasEarthMap) {
      const earthId = NODE.earth
      nodes.push({
        id: earthId, type: 'earthing',
        position: pos(earthId, { x: DB_X, y: Y_INV + 260 }),
        data: { label: 'Earthing System', spikeCount: d.earthing.spikeCount ?? 2, spec: d.earthing.spec },
      })
      edges.push({
        id: 'e-db-earth', source: dbId, target: earthId,
        sourceHandle: 'earth-out', targetHandle: 'earth-in', type: 'cable',
        data: { ...cableData('earth', 'CU GY 10mm²', 5), circuitLayer: 'earth' }, label: 'CU GY 10mm² · E',
      })
    }
  }

  // ── Earth/bonding overlay (toggled by the Earth layer pill) ──────────────────
  if (hasEarthMap) {
    const earthY = Y_INV + 320
    e.bars.forEach((b, i) => {
      const id = `earthbar-${b.id}`
      nodes.push({ id, type: 'earthing', position: pos(id, { x: GRID_X + i * 240, y: earthY }), data: { label: b.label, spec: 'Earth bar' } })
    })
    e.electrodes.forEach((el, i) => {
      const id = `electrode-${el.id}`
      nodes.push({ id, type: 'earthing', position: pos(id, { x: DB_X + i * 240, y: earthY }), data: { label: el.label, spikeCount: el.spikeCount, spec: e.spec } })
    })
    const resolveEarthId = (pointId: string): string => {
      if (e.bars.some((b) => b.id === pointId)) return `earthbar-${pointId}`
      if (e.electrodes.some((el) => el.id === pointId)) return `electrode-${pointId}`
      return pointId
    }
    e.conductors.forEach((c) => {
      const src = resolveEarthId(c.fromId)
      const tgt = resolveEarthId(c.toId)
      if (!nodes.some((n) => n.id === src) || !nodes.some((n) => n.id === tgt)) return
      edges.push({
        id: `earth-${c.id}`, source: src, target: tgt, type: 'cable',
        sourceHandle: 'earth-s', targetHandle: 'earth-t',
        data: { ...cableData('earth', `CU ${c.sizeMm2}mm²`, 5), circuitLayer: 'earth' },
        label: `CU ${c.sizeMm2}mm² · ${c.kind === 'bonding' ? 'BOND' : 'E'}`,
      })
    })
  }

  // ── Extras (standalone palette components — user-positioned, not auto-wired) ──
  // Item 54: extras carry earth handles so an earthing.conductors run can anchor to
  // them (the SimpleBlock node renders EarthHandles when data.earthHandles is set).
  d.extras.forEach((x, i) => {
    nodes.push({
      id: x.id,
      type: x.type,
      position: pos(x.id, { x: GRID_X - 250, y: 40 + i * 130 }),
      data: { label: x.label, subComponentCount: x.components?.length ?? 0, earthHandles: true },
    })
  })

  // ── Monitoring (item 26/52) — comms hardware on the DATA layer ───────────────
  // The comms edge attaches to the chosen device (item 52: targetId — any node id,
  // inverter / gateway / panel), falling back to the legacy inverterId and finally
  // the representative inverter. The label shows the comms medium (free-text when
  // commsType === 'other').
  const hasInv = !!(inv0 || invKw > 0)
  ;(d.monitoring ?? []).forEach((m, i) => {
    const id = `monitor-${m.id}`
    nodes.push({
      id, type: 'monitoring',
      position: pos(id, { x: INV_X + 220 + i * 170, y: Y_INV - 160 }),
      data: { label: m.label || 'Monitoring', role: m.role, commsType: m.commsType, commsOther: m.commsOther, product: m.catalogId },
    })
    const wantTarget = m.targetId ?? m.inverterId ?? (hasInv ? NODE.inverter : null)
    const target = wantTarget && nodes.some((nn) => nn.id === wantTarget) ? wantTarget : (hasInv ? NODE.inverter : null)
    if (target) {
      const comms = (m.commsType === 'other' ? (m.commsOther || 'other') : (m.commsType || 'comms'))
      edges.push({
        id: `e-monitor-${m.id}`, source: target, target: id,
        sourceHandle: 'ac-out', targetHandle: 'data-in', type: 'cable',
        data: { ...cableData('communication', comms, 2), circuitLayer: 'communication', routingType: 'bezier' },
        label: `${m.role === 'bundled' ? 'Bundled' : 'Monitoring'} · ${comms}`,
      })
    }
  })

  // ── Data links (item 30) — explicit comms cabling, DATA layer ────────────────
  ;(d.data?.links ?? []).forEach((l) => {
    if (!nodes.some((n) => n.id === l.fromId) || !nodes.some((n) => n.id === l.toId)) return
    edges.push({
      id: `data-${l.id}`, source: l.fromId, target: l.toId, type: 'cable',
      sourceHandle: 'data-out', targetHandle: 'data-in',
      data: { ...cableData('communication', l.cableType, 3), circuitLayer: 'communication', routingType: 'bezier', sourceProtocol: l.protocol ? [l.protocol] : undefined },
      label: `${l.cableType}${l.protocol ? ` · ${l.protocol}` : ''}`,
    })
  })

  // ── User-drawn cables (item 53) — appended as real cable edges so they take part
  // in overrides + layers + BOM. Endpoints must resolve to emitted nodes. ─────────
  ;(d.layout.userEdges ?? []).forEach((u) => {
    if (!u.source || !u.target) return
    if (!nodes.some((nn) => nn.id === u.source) || !nodes.some((nn) => nn.id === u.target)) return
    const ct = u.circuitType ?? 'ac'
    const spec = ct === 'dc' ? 'H1Z2Z2 6mm²' : ct === 'earth' ? 'CU GY 10mm²' : ct === 'communication' ? 'Cat6' : 'CU 6mm²'
    const data: CableEdgeData = {
      ...cableData(ct, spec, 5),
      ...(ct === 'earth' ? { circuitLayer: 'earth' as const } : {}),
      ...(ct === 'communication' ? { circuitLayer: 'communication' as const, routingType: 'bezier' as const } : {}),
    }
    edges.push({
      id: `user-${u.id}`, source: u.source, target: u.target, type: 'cable',
      sourceHandle: u.sourceHandle, targetHandle: u.targetHandle,
      data, label: buildEdgeLabel(data),
    })
  })

  // ── Apply diagram-inspector overrides (per component + per cable), then relabel ──
  const nodeOv = d.layout.nodeOverrides ?? {}
  const edgeOv = d.layout.edgeOverrides ?? {}
  for (const node of nodes) {
    const ov = nodeOv[node.id]
    if (ov) node.data = { ...node.data, ...ov }
  }
  for (const edge of edges) {
    const ov = edgeOv[edge.id]
    if (!ov) continue
    const merged = { ...(edge.data as CableEdgeData), ...ov }
    edge.data = merged
    const runs = Math.max(1, Math.round(Number((merged as { runs?: number }).runs) || 1))
    const base = buildEdgeLabel(merged)
    edge.label = runs > 1 ? `${runs}× ${base}` : base
  }

  return { nodes, edges }
}
