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
}

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

export interface InverterUnit {
  id: string
  catalogId: string | null
  model: string
  kw: number
  qty: number
  phases: 1 | 3
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
  /** Per-string connection products, keyed by panel-group id. */
  stringConnections: Record<string, StringConnection>
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
  }
  c.productCode = enclosureCode(c)
  return c
}

export interface AcCombiner {
  id: string
  label: string
  mainBreakerA: number
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
  electrodes: EarthElectrode[]
  bars: EarthBar[]
  conductors: EarthConductor[]
}

export const EARTH_SIZES = [2.5, 4, 6, 10, 16, 25, 35]

export interface ExtraComponent {
  id: string
  type: string
  label: string
  data: Record<string, unknown>
}

export interface NodePosition {
  x: number
  y: number
}

export interface DesignLayout {
  /** Persisted node positions keyed by diagram node id. */
  nodes: Record<string, NodePosition>
}

export interface SystemDesign {
  version: number
  energy: EnergyProfile
  panels: PanelGroup[]
  dcCombiners: DcCombiner[]
  inverters: InverterUnit[]
  batteries: BatteryUnit[]
  bank: BatteryBank
  acCombiners: AcCombiner[]
  earthing: EarthingConfig
  extras: ExtraComponent[]
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
  }
}

export function emptyDesign(): SystemDesign {
  return {
    version: DESIGN_VERSION,
    energy: emptyEnergy(),
    panels: [],
    dcCombiners: [],
    inverters: [],
    batteries: [],
    bank: defaultBank(),
    acCombiners: [],
    earthing: { spikeCount: null, spec: 'CU GY 10mm²', electrodes: [], bars: [], conductors: [] },
    extras: [],
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
  return {
    ...base,
    ...src,
    energy,
    bank: { ...base.bank, ...(src.bank ?? {}) },
    earthing: {
      ...base.earthing,
      ...(src.earthing ?? {}),
      electrodes: (src.earthing?.electrodes ?? []).map((el) => ({ ...el, arrangement: el.arrangement ?? 'line', groupSize: el.groupSize ?? 1, linkMm2: el.linkMm2 ?? 16 })),
    },
    layout: { nodes: { ...(src.layout?.nodes ?? {}) } },
    panels: src.panels ?? [],
    // Backfill combiners saved before the product-driven protection model.
    dcCombiners: (src.dcCombiners ?? []).map((c) => ({
      ...c,
      enclosureCatalogId: c.enclosureCatalogId ?? null,
      stringConnections: c.stringConnections ?? {},
      outputs: (c.outputs ?? []).map((o) => ({ ...o, spdId: o.spdId ?? null, mainBreakerId: o.mainBreakerId ?? null })),
    })),
    inverters: src.inverters ?? [],
    batteries: src.batteries ?? [],
    acCombiners: src.acCombiners ?? [],
    extras: src.extras ?? [],
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

// Stable node ids ↔ design entities.
export const NODE = {
  panel: (i: number) => `panel-${i}`,
  combiner: 'combiner',
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
  | { kind: 'combiner' }
  | { kind: 'grid' }
  | { kind: 'db' }
  | { kind: 'earth' }

export function nodeIdToRef(id: string): DesignNodeRef | null {
  if (id.startsWith('panel-')) {
    const index = parseInt(id.slice('panel-'.length), 10)
    return Number.isInteger(index) ? { kind: 'panel', index } : null
  }
  switch (id) {
    case 'inverter': return { kind: 'inverter' }
    case 'battery': return { kind: 'battery' }
    case 'combiner': return { kind: 'combiner' }
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

/** AC cable whose conductor label reflects the phase (L/N/E vs L1/L2/L3/N/E). */
function acCableData(spec: string, lengthM: number, phase: number): CableEdgeData {
  return { ...cableData('ac', spec, lengthM), conductors: { l1: phase >= 3 } }
}

export interface FlowGraph { nodes: Node[]; edges: Edge[] }

/** Build the diagram from the design. Positions come from saved layout when present. */
export function designToFlow(d: SystemDesign, opts: { gridSupply?: string } = {}): FlowGraph {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const pos = (id: string, fallback: NodePosition): NodePosition => d.layout.nodes[id] ?? fallback

  // Phase comes from real equipment, never a kW heuristic. The grid follows the
  // site supply; the inverter (and the AC it feeds) follows its own spec — so a
  // single-phase 10kW inverter is shown single-phase, not forced to three.
  const gridPhase: 1 | 3 =
    opts.gridSupply?.toLowerCase().includes('three') || opts.gridSupply?.toLowerCase().includes('3 phase') ? 3 : 1
  const inverterPhase: 1 | 3 = d.inverters[0]?.phases ?? gridPhase

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

  // DC combiner
  if (useCombiner && groupCount > 0) {
    const id = NODE.combiner
    const explicit = d.dcCombiners[0]
    nodes.push({
      id,
      type: 'combiner',
      position: pos(id, { x: CX - 110, y: Y_COMB }),
      data: {
        label: explicit?.label || 'DC Combiner Box',
        stringCount: explicit ? (explicit.inputStringIds.length || groupCount) : groupCount,
        hasSpd: explicit ? explicit.outputs.some((o) => !!o.spdId) : true,
        config: explicit ? combinerConfigLabel(explicit) : `${groupCount}-string`,
      },
    })
    d.panels.forEach((_, i) => {
      edges.push({
        id: `e-panel${i}-comb`,
        source: NODE.panel(i),
        target: id,
        sourceHandle: 'dc-out',
        targetHandle: `str-${i}`,
        type: 'cable',
        data: cableData('dc', 'H1Z2Z2 6mm²', 12),
        label: buildEdgeLabel(cableData('dc', 'H1Z2Z2 6mm²', 12)),
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
        hasBattery: d.batteries.length > 0,
        outputCount: 1,
      },
    })

    // PV → inverter (via combiner when present, else direct from first group)
    if (useCombiner && groupCount > 0) {
      edges.push({
        id: 'e-comb-inv', source: NODE.combiner, target: id,
        sourceHandle: 'dc-out', targetHandle: 'pv-in', type: 'cable',
        data: cableData('dc', 'H1Z2Z2 6mm²', 8),
        label: buildEdgeLabel(cableData('dc', 'H1Z2Z2 6mm²', 8)),
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

  // ── Battery bank — granular wiring: batteries → [disconnect] → [busbar] → [main] → inverter
  const batKwh = designBatteryKwh(d)
  const bat0 = d.batteries[0]
  if ((bat0 || batKwh > 0) && (invKw > 0 || inv0)) {
    const bank = d.bank
    const batSize = bank.cableSizeMm2
    // Thick feed sized to worst-case full current; per-battery cables stay single.
    const mainRuns = cableRunsNeeded(batteryDcCurrent(invKw, bank.cutoffVoltage), batSize)
    const cable = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string, runs = 1) =>
      edges.push({
        id, source, target, sourceHandle, targetHandle, type: 'cable',
        data: { ...cableData('battery', `CU ${batSize}mm²`, 2), runs },
        label: `${runs > 1 ? `${runs}× ` : ''}CU ${batSize}mm²`,
      })

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

    if (hasMain) {
      nodes.push({ id: 'bat-main', type: 'busblock', position: pos('bat-main', { x: INV_X + 10, y: Y_MAIN }), data: { kind: 'disconnect', label: 'Main disconnect' } })
      cable('e-main-inv', 'bat-main', NODE.inverter, 'up', 'bat-in', mainRuns)
    }
    if (hasBus) {
      nodes.push({ id: 'bat-busbar', type: 'busblock', position: pos('bat-busbar', { x: INV_X - 30, y: Y_BUS }), data: { kind: 'busbar', label: 'DC busbar' } })
      if (hasMain) cable('e-bus-main', 'bat-busbar', 'bat-main', 'up', 'down', mainRuns)
      else cable('e-bus-inv', 'bat-busbar', NODE.inverter, 'up', 'bat-in', mainRuns)
    }
    const mergeId = hasBus ? 'bat-busbar' : hasMain ? 'bat-main' : NODE.inverter
    const mergeHandle = hasBus || hasMain ? 'down' : 'bat-in'
    // A single battery wired straight to the inverter carries the full feed.
    const directFull = mergeId === NODE.inverter && N === 1 ? mainRuns : 1

    const spacing = 150
    const startX = INV_X + 35 - ((N - 1) * spacing) / 2
    for (let i = 0; i < N; i++) {
      const u = units[i] ?? { model: bat0?.model ?? '', kwh: batKwh }
      const bx = startX + i * spacing
      const bid = i === 0 ? NODE.battery : `batt-${i}`
      nodes.push({ id: bid, type: 'battery', position: pos(bid, { x: bx, y: Y_BATT }), data: { label: `Battery ${i + 1}`, model: u.model, qty: 1, totalKwh: +u.kwh.toFixed(1), chemistry: 'LiFePO4' } })
      if (hasDisc) {
        const did = `bat-disc-${i}`
        nodes.push({ id: did, type: 'busblock', position: pos(did, { x: bx, y: Y_DISC }), data: { kind: 'disconnect', label: 'Disc' } })
        cable(`e-bat${i}-disc`, bid, did, 'bat-out', 'down')
        cable(`e-disc${i}`, did, mergeId, 'up', mergeHandle, directFull)
      } else {
        cable(`e-bat${i}`, bid, mergeId, 'bat-out', mergeHandle, directFull)
      }
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
    nodes.push({
      id: dbId, type: 'dbBoard',
      position: pos(dbId, { x: DB_X, y: Y_INV }),
      data: { label: 'Distribution Board', mainBreakerA: inverterPhase === 3 ? 63 : 40, rccbA: 30, phases: inverterPhase },
    })
    edges.push({
      id: 'e-inv-db', source: NODE.inverter, target: dbId,
      sourceHandle: 'ac-out', targetHandle: 'ac-in', type: 'cable',
      data: acCableData('CU 6mm²', 8, inverterPhase), label: buildEdgeLabel(acCableData('CU 6mm²', 8, inverterPhase)),
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

  return { nodes, edges }
}
