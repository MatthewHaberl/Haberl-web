// Hourly energy-balance engine — the calculation foundation behind the
// Savings & Performance view.
//
// Why this exists: the original savings math collapsed a whole month into
// `offset = min(monthlyGeneration, monthlyConsumption)`. That overstates
// self-consumption (it ignores that solar peaks at midday while load peaks in
// the evening) and can't model export, feed-in credit, or a battery at all.
//
// This module runs a representative-day-per-month simulation (12 days × 24 h)
// over an actual generation shape and load shape, with a battery state-of-charge
// loop, to produce an honest split of every kWh into: used directly, stored &
// later used, imported from grid, and exported/curtailed. Everything downstream
// (payback, 20-year, NPV, %-from-solar) reads off this single result.
//
// It is a pure module — no Supabase, no React, safe on server and client.

import { LOAD_CURVES, MONTH_LABELS, normalizeCurve } from './system-design'

// Non-leap calendar. Matches generation-calculator's DAYS_PER_MONTH.
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Typical clear-day PV output shape for Gauteng (~26°S), un-normalised weights,
// midnight→23h. Zero before dawn / after dusk, bell around solar noon. Callers
// with per-orientation hourly data should pass their own shape; this is the
// sensible default so the module stands alone.
export const DEFAULT_PV_DAY_SHAPE: number[] = [
  0, 0, 0, 0, 0, 0, 0.05, 0.2, 0.45, 0.7, 0.9, 1.0,
  1.0, 0.95, 0.85, 0.65, 0.4, 0.18, 0.05, 0, 0, 0, 0, 0,
]

// ── Loss model ─────────────────────────────────────────────────────────────
// Single source of truth lives in ./loss-model (a leaf module with no solar
// imports) so the hourly generation model (generation-calculator) consumes the
// EXACT same derate without a circular import. Re-exported here so the existing
// call sites + tests that import it from energy-balance keep working.
export { buildLossModel, DEFAULT_LOSS_COMPONENTS } from './loss-model'
export type { LossComponent, LossModel } from './loss-model'

// ── Battery ──────────────────────────────────────────────────────────────────

export interface BatteryParams {
  /** Nameplate storage (kWh). */
  capacityKwh: number
  /** Usable fraction (depth of discharge). LiFePO4 ≈ 0.9. */
  usableFraction?: number
  /** AC→storage→AC round-trip efficiency. LiFePO4 + inverter ≈ 0.90. */
  roundTripEfficiency?: number
}

// ── Inputs / outputs ───────────────────────────────────────────────────────

export interface EnergyBalanceInput {
  /** Net AC generation per month (kWh), Jan→Dec. Already post-loss. */
  generationMonthlyKwh: number[]
  /** Consumption per month (kWh), Jan→Dec. */
  consumptionMonthlyKwh: number[]
  /** Import tariff (R/kWh). */
  tariffRate: number
  /** Export / feed-in tariff (R/kWh). Default 0 — most SA tariffs pay nothing. */
  feedInRate?: number
  /**
   * Whether surplus may be exported to the grid. When false (the SA default —
   * no feed-in agreement), midday surplus the battery can't absorb is curtailed
   * (wasted), never exported, and earns no credit.
   */
  allowExport?: boolean
  /** Battery, or null for a grid-tie system with no storage. */
  battery?: BatteryParams | null
  /** 24-h consumption shape (any scale — normalised internally). */
  loadShape?: number[]
  /** 24-h generation shape (any scale — normalised internally). */
  pvDayShape?: number[]
}

export interface MonthlyEnergyRow {
  month: string
  generationKwh: number
  consumptionKwh: number
  /** Solar that served load directly or via the battery. */
  selfConsumedKwh: number
  importedKwh: number
  /** Surplus sent to grid (0 when allowExport is false). */
  exportedKwh: number
  /** Surplus wasted because it couldn't be stored or exported. */
  curtailedKwh: number
  exportCreditR: number
  billBeforeR: number
  billAfterR: number
  savingR: number
}

export interface EnergyBalanceAnnual {
  generationKwh: number
  consumptionKwh: number
  selfConsumedKwh: number
  importedKwh: number
  exportedKwh: number
  curtailedKwh: number
  exportCreditR: number
  billBeforeR: number
  billAfterR: number
  savingR: number
  /** Generation ÷ consumption × 100. The headline "Energy from Solar" — can exceed 100 %. */
  energyFromSolarPct: number
  /** Self-consumed ÷ generation × 100. How much of what's made is actually used. */
  selfConsumptionPct: number
  /** Self-consumed ÷ consumption × 100. How much of the bill the solar removes. */
  gridIndependencePct: number
}

export interface EnergyBalanceResult {
  months: MonthlyEnergyRow[]
  annual: EnergyBalanceAnnual
}

// ── Core simulation ──────────────────────────────────────────────────────────

interface DayResult {
  served: number
  imported: number
  surplus: number
  endSoc: number
}

/**
 * One representative day. genH/loadH are 24 hourly kWh values (already scaled to
 * the day's totals). Returns load served by solar (direct + battery), grid
 * import, and the surplus that left the system (export or curtail).
 */
function simulateDay(
  genH: number[],
  loadH: number[],
  battery: BatteryParams | null | undefined,
  startSoc: number,
): DayResult {
  const usable = battery ? battery.capacityKwh * (battery.usableFraction ?? 0.9) : 0
  // Split the round-trip loss evenly across charge and discharge.
  const legEff = battery ? Math.sqrt(battery.roundTripEfficiency ?? 0.9) : 1

  let soc = Math.min(startSoc, usable)
  let served = 0
  let imported = 0
  let surplus = 0

  for (let h = 0; h < 24; h++) {
    const gen = genH[h] ?? 0
    const load = loadH[h] ?? 0

    const direct = Math.min(gen, load)
    served += direct
    const hourSurplus = gen - direct
    const hourDeficit = load - direct

    if (usable > 0 && hourSurplus > 0) {
      // Charge: stored energy is limited by free capacity; the draw needed to
      // store it is larger by the charge-leg loss. Anything left over leaves.
      const stored = Math.min(usable - soc, hourSurplus * legEff)
      const draw = stored / legEff
      soc += stored
      surplus += hourSurplus - draw
    } else if (usable > 0 && hourDeficit > 0) {
      // Discharge: deliverable energy is the stored energy minus the
      // discharge-leg loss. The rest of the deficit is imported.
      const deliverable = soc * legEff
      const delivered = Math.min(hourDeficit, deliverable)
      soc -= delivered / legEff
      served += delivered
      imported += hourDeficit - delivered
    } else {
      // No battery (or a neutral hour): surplus leaves, deficit is imported.
      surplus += hourSurplus
      imported += hourDeficit
    }
  }

  return { served, imported, surplus, endSoc: soc }
}

/**
 * Iterate the representative day until the battery's start/end state of charge
 * settles (periodic steady state), then return the converged day.
 */
function steadyStateDay(
  genH: number[],
  loadH: number[],
  battery: BatteryParams | null | undefined,
): DayResult {
  let soc = 0
  let result = simulateDay(genH, loadH, battery, soc)
  for (let pass = 0; pass < 3; pass++) {
    result = simulateDay(genH, loadH, battery, result.endSoc)
  }
  return result
}

export function simulateEnergyBalance(input: EnergyBalanceInput): EnergyBalanceResult {
  const {
    generationMonthlyKwh,
    consumptionMonthlyKwh,
    tariffRate,
    feedInRate = 0,
    allowExport = false,
    battery = null,
  } = input

  const pvShape = normalizeCurve(input.pvDayShape ?? DEFAULT_PV_DAY_SHAPE)
  const loadShape = normalizeCurve(input.loadShape ?? LOAD_CURVES.home_all_day)

  const months: MonthlyEnergyRow[] = []
  const acc: EnergyBalanceAnnual = {
    generationKwh: 0, consumptionKwh: 0, selfConsumedKwh: 0, importedKwh: 0,
    exportedKwh: 0, curtailedKwh: 0, exportCreditR: 0, billBeforeR: 0,
    billAfterR: 0, savingR: 0, energyFromSolarPct: 0, selfConsumptionPct: 0,
    gridIndependencePct: 0,
  }

  for (let m = 0; m < 12; m++) {
    const days = DAYS_PER_MONTH[m]
    const monthGen = generationMonthlyKwh[m] ?? 0
    const monthLoad = consumptionMonthlyKwh[m] ?? 0
    const dailyGen = monthGen / days
    const dailyLoad = monthLoad / days

    const genH = pvShape.map((f) => f * dailyGen)
    const loadH = loadShape.map((f) => f * dailyLoad)

    const day = steadyStateDay(genH, loadH, battery)

    const selfConsumed = day.served * days
    const imported = day.imported * days
    const surplus = day.surplus * days
    const exported = allowExport ? surplus : 0
    const curtailed = allowExport ? 0 : surplus
    const exportCreditR = exported * feedInRate

    const billBeforeR = monthLoad * tariffRate
    const billAfterR = Math.max(0, imported * tariffRate - exportCreditR)
    const savingR = billBeforeR - billAfterR

    months.push({
      month: MONTH_LABELS[m],
      generationKwh: round1(monthGen),
      consumptionKwh: round1(monthLoad),
      selfConsumedKwh: round1(selfConsumed),
      importedKwh: round1(imported),
      exportedKwh: round1(exported),
      curtailedKwh: round1(curtailed),
      exportCreditR: roundR(exportCreditR),
      billBeforeR: roundR(billBeforeR),
      billAfterR: roundR(billAfterR),
      savingR: roundR(savingR),
    })

    acc.generationKwh += monthGen
    acc.consumptionKwh += monthLoad
    acc.selfConsumedKwh += selfConsumed
    acc.importedKwh += imported
    acc.exportedKwh += exported
    acc.curtailedKwh += curtailed
    acc.exportCreditR += exportCreditR
    acc.billBeforeR += billBeforeR
    acc.billAfterR += billAfterR
    acc.savingR += savingR
  }

  const annual: EnergyBalanceAnnual = {
    generationKwh: round1(acc.generationKwh),
    consumptionKwh: round1(acc.consumptionKwh),
    selfConsumedKwh: round1(acc.selfConsumedKwh),
    importedKwh: round1(acc.importedKwh),
    exportedKwh: round1(acc.exportedKwh),
    curtailedKwh: round1(acc.curtailedKwh),
    exportCreditR: roundR(acc.exportCreditR),
    billBeforeR: roundR(acc.billBeforeR),
    billAfterR: roundR(acc.billAfterR),
    savingR: roundR(acc.savingR),
    energyFromSolarPct: pct(acc.generationKwh, acc.consumptionKwh),
    selfConsumptionPct: pct(acc.selfConsumedKwh, acc.generationKwh),
    gridIndependencePct: pct(acc.selfConsumedKwh, acc.consumptionKwh),
  }

  return { months, annual }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Spread an annual total across 12 months by a seasonal factor array. */
export function spreadAnnual(annualKwh: number, factors: number[]): number[] {
  const norm = normalizeCurve(factors)
  return norm.map((f) => annualKwh * f)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function roundR(n: number): number {
  return Math.round(n)
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}
