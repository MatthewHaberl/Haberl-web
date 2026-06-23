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

export interface EnergyProfile {
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
  /** Optional roof orientation — when both set, the hourly solar model is used. */
  azimuth: number | null
  pitch: number | null
}

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

export interface DcCombiner {
  id: string
  label: string
  stringCount: number
}

export interface AcCombiner {
  id: string
  label: string
  mainBreakerA: number
}

export interface EarthingConfig {
  spikeCount: number | null
  spec: string
}

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
    acCombiners: [],
    earthing: { spikeCount: null, spec: 'CU GY 10mm²' },
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
  return {
    ...base,
    ...src,
    energy: { ...base.energy, ...(src.energy ?? {}) },
    earthing: { ...base.earthing, ...(src.earthing ?? {}) },
    layout: { nodes: { ...(src.layout?.nodes ?? {}) } },
    panels: src.panels ?? [],
    dcCombiners: src.dcCombiners ?? [],
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
export function resolveEnergy(
  e: EnergyProfile,
  record?: { monthly_kwh?: string | number | null } | null,
): ResolvedEnergy {
  const hasHourly = !!e.hourly && e.hourly.some((v) => v > 0)
  let dailyKwh: number | null = null
  let hourly: number[] | null = null
  let source: EnergySource = 'none'

  if (hasHourly) {
    hourly = e.hourly!.slice(0, 24)
    dailyKwh = hourly.reduce((a, b) => a + (b || 0), 0)
    source = 'hourly'
  } else if (e.dailyKwh != null && e.dailyKwh > 0) {
    dailyKwh = e.dailyKwh; source = 'daily'
  } else if (e.weeklyKwh != null && e.weeklyKwh > 0) {
    dailyKwh = e.weeklyKwh / 7; source = 'weekly'
  } else if (e.monthlyKwh != null && e.monthlyKwh > 0) {
    dailyKwh = e.monthlyKwh / DAYS_PER_MONTH; source = 'monthly'
  } else if (e.annualKwh != null && e.annualKwh > 0) {
    dailyKwh = e.annualKwh / 365; source = 'annual'
  } else if (record?.monthly_kwh != null && num(record.monthly_kwh) > 0) {
    dailyKwh = num(record.monthly_kwh) / DAYS_PER_MONTH; source = 'record'
  }

  // Derive an hourly shape from the chosen curve when one isn't hand-entered.
  if (!hasHourly && dailyKwh != null && e.curvePreset && e.curvePreset !== 'custom') {
    const curve = LOAD_CURVES[e.curvePreset]
    if (curve) hourly = normalizeCurve(curve).map((f) => +(f * dailyKwh!).toFixed(3))
  }

  return { dailyKwh, hourly, source }
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

export interface FlowGraph { nodes: Node[]; edges: Edge[] }

/** Build the diagram from the design. Positions come from saved layout when present. */
export function designToFlow(d: SystemDesign, opts: { gridSupply?: string } = {}): FlowGraph {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const pos = (id: string, fallback: NodePosition): NodePosition => d.layout.nodes[id] ?? fallback

  const is3Phase =
    opts.gridSupply?.toLowerCase().includes('three') ||
    opts.gridSupply?.toLowerCase().includes('3 phase') ||
    designInverterKw(d) >= 10

  const groupCount = d.panels.length
  const useCombiner = groupCount > 1 || d.dcCombiners.length > 0

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
    nodes.push({
      id,
      type: 'combiner',
      position: pos(id, { x: CX - 110, y: Y_COMB }),
      data: {
        label: 'DC Combiner Box',
        stringCount: groupCount,
        hasSpd: true,
        config: `${groupCount}-string`,
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
        phases: is3Phase ? 3 : 1,
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

  // Battery
  const batKwh = designBatteryKwh(d)
  const bat0 = d.batteries[0]
  if (bat0 || batKwh > 0) {
    const id = NODE.battery
    const totalQty = d.batteries.reduce((s, b) => s + b.qty, 0) || 1
    nodes.push({
      id,
      type: 'battery',
      position: pos(id, { x: INV_X, y: Y_BAT }),
      data: {
        label: 'Battery Bank',
        model: bat0?.model ?? '',
        qty: totalQty,
        totalKwh: +batKwh.toFixed(1),
        chemistry: 'LiFePO4',
      },
    })
    if (invKw > 0 || inv0) {
      edges.push({
        id: 'e-bat-inv', source: id, target: NODE.inverter,
        sourceHandle: 'bat-out', targetHandle: 'bat-in', type: 'cable',
        data: cableData('battery', 'CU 25mm²', 3),
        label: buildEdgeLabel(cableData('battery', 'CU 25mm²', 3)),
      })
    }
  }

  // Grid + DB + Earth only become meaningful once there's an inverter.
  if (inv0 || invKw > 0) {
    const gridId = NODE.grid
    nodes.push({
      id: gridId, type: 'grid',
      position: pos(gridId, { x: GRID_X, y: Y_INV + 20 }),
      data: { label: 'Grid Supply', utility: 'Eskom', voltage: is3Phase ? 400 : 230, phases: is3Phase ? 3 : 1, breakerA: 63 },
    })
    edges.push({
      id: 'e-grid-inv', source: gridId, target: NODE.inverter,
      sourceHandle: 'ac-out', targetHandle: 'grid-in', type: 'cable',
      data: cableData('ac', 'CU 6mm²', 5), label: buildEdgeLabel(cableData('ac', 'CU 6mm²', 5)),
    })

    const dbId = NODE.db
    nodes.push({
      id: dbId, type: 'dbBoard',
      position: pos(dbId, { x: DB_X, y: Y_INV }),
      data: { label: 'Distribution Board', mainBreakerA: is3Phase ? 63 : 40, rccbA: 30, phases: is3Phase ? 3 : 1 },
    })
    edges.push({
      id: 'e-inv-db', source: NODE.inverter, target: dbId,
      sourceHandle: 'ac-out', targetHandle: 'ac-in', type: 'cable',
      data: cableData('ac', 'CU 6mm²', 8), label: buildEdgeLabel(cableData('ac', 'CU 6mm²', 8)),
    })

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

  return { nodes, edges }
}
