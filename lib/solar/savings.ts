// Savings & Performance read-off (W57 Phase 3).
//
// Pure logic behind the Savings section of the Quotes-v2 design canvas. It does
// NOT run a parallel design/pricing calc — it reads the ANNUAL generation,
// consumption and battery the canvas already computes (computeBalance) plus the
// system cost the BOM already computes (designToBom), feeds the honest hourly
// engine (simulateEnergyBalance), and projects the result forward.

import { simulateEnergyBalance, type EnergyBalanceResult } from './energy-balance'

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Gauteng monthly generation weighting (longer summer days vs clearer winter),
// Jan→Dec. Used ONLY to spread an annual generation total into a monthly shape;
// the annual total itself comes from the canvas, so it stays the source of truth.
const SOLAR_DAILY_FACTORS = [1.18, 1.12, 1.02, 0.9, 0.82, 0.78, 0.82, 0.92, 1.04, 1.14, 1.18, 1.2]
const GEN_MONTH_WEIGHTS = DAYS_PER_MONTH.map((d, i) => d * SOLAR_DAILY_FACTORS[i])

// Financial assumptions. These mirror the constants baked into quote-calculator's
// 20-year table so the Savings view stays consistent with the classic quote.
// (When the W58 settings levers land, these move to company_settings.)
export const TARIFF_ESCALATION_PCT = 12 // %/yr — historical SA grid trend
export const PANEL_DEGRADATION_PCT = 0.5 // %/yr
export const NPV_DISCOUNT_PCT = 10 // %/yr
export const DEFAULT_TARIFF_RATE = 2.75 // R/kWh — sensible default until set per quote

function spread(annual: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0) || 1
  return weights.map((w) => (annual * w) / sum)
}

export interface SavingsInputOpts {
  tariffRate: number
  allowExport?: boolean
  feedInRate?: number
}

/**
 * Build the energy-balance input from annual canvas figures: spread the annual
 * generation and consumption into a monthly shape, and pass the battery through.
 */
export function buildBalanceInput(
  annualGenerationKwh: number,
  annualConsumptionKwh: number,
  batteryKwh: number,
  opts: SavingsInputOpts,
) {
  return {
    generationMonthlyKwh: spread(annualGenerationKwh, GEN_MONTH_WEIGHTS),
    consumptionMonthlyKwh: spread(annualConsumptionKwh, DAYS_PER_MONTH),
    tariffRate: opts.tariffRate,
    allowExport: opts.allowExport ?? false,
    feedInRate: opts.feedInRate ?? 0,
    battery: batteryKwh > 0
      ? { capacityKwh: batteryKwh, usableFraction: 0.9, roundTripEfficiency: 0.9 }
      : null,
  }
}

export interface FinancialProjection {
  /** Simple payback: system cost ÷ year-1 saving (flat tariff). */
  paybackYears: number | null
  /** Payback with tariff escalation + panel degradation (faster). */
  paybackYearsEscalated: number | null
  /** 20-year cumulative saving, flat tariff. */
  cumulativeFlatR: number
  /** 20-year cumulative saving with escalation + degradation. */
  cumulativeEscalatedR: number
  /** Net = escalated cumulative − system cost. */
  netR: number
  /** NPV of the escalated saving stream at the discount rate, minus system cost. */
  npvR: number
  /** 20-year ROI %: net ÷ cost × 100. */
  roiPct: number | null
}

export function projectSavings(
  annualSavingR: number,
  systemCostR: number,
  years = 20,
): FinancialProjection {
  const esc = 1 + TARIFF_ESCALATION_PCT / 100
  const deg = 1 - PANEL_DEGRADATION_PCT / 100
  const disc = 1 + NPV_DISCOUNT_PCT / 100

  let cumulativeFlat = 0
  let cumulativeEsc = 0
  let npv = -systemCostR
  let paybackEscMonths: number | null = null

  for (let y = 1; y <= years; y++) {
    const yearSavingEsc = annualSavingR * Math.pow(esc, y - 1) * Math.pow(deg, y - 1)
    const prevCumEsc = cumulativeEsc
    cumulativeFlat += annualSavingR
    cumulativeEsc += yearSavingEsc
    npv += yearSavingEsc / Math.pow(disc, y)
    if (paybackEscMonths === null && cumulativeEsc >= systemCostR && yearSavingEsc > 0) {
      const frac = Math.max(0, Math.min(1, (systemCostR - prevCumEsc) / yearSavingEsc))
      paybackEscMonths = (y - 1 + frac) * 12
    }
  }

  return {
    paybackYears: annualSavingR > 0 ? systemCostR / annualSavingR : null,
    paybackYearsEscalated: paybackEscMonths != null ? paybackEscMonths / 12 : null,
    cumulativeFlatR: Math.round(cumulativeFlat),
    cumulativeEscalatedR: Math.round(cumulativeEsc),
    netR: Math.round(cumulativeEsc - systemCostR),
    npvR: Math.round(npv),
    roiPct: systemCostR > 0 ? Math.round(((cumulativeEsc - systemCostR) / systemCostR) * 100) : null,
  }
}

export interface SavingsSummary {
  balance: EnergyBalanceResult
  financial: FinancialProjection
  systemCostR: number
  annualSavingR: number
}

/** Full read-off: honest hourly balance + forward projection in one object. */
export function buildSavingsSummary(
  annualGenerationKwh: number,
  annualConsumptionKwh: number,
  batteryKwh: number,
  systemCostR: number,
  opts: SavingsInputOpts,
): SavingsSummary {
  const balance = simulateEnergyBalance(
    buildBalanceInput(annualGenerationKwh, annualConsumptionKwh, batteryKwh, opts),
  )
  const annualSavingR = balance.annual.savingR
  return {
    balance,
    financial: projectSavings(annualSavingR, systemCostR),
    systemCostR,
    annualSavingR,
  }
}
