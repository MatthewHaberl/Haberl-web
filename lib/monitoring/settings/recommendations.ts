/**
 * Optimisation engine — turns a plant's current settings + its energy profile
 * into concrete "change this → save ~RX/yr" recommendations.
 *
 * Every Rand figure is MODELLED, not promised: each rule runs the existing
 * hourly energy-balance simulator (lib/solar/energy-balance) twice — once with
 * the current setting, once with the proposed one — and reports the difference.
 * That keeps the optimisation layer honest and consistent with the quote-time
 * Savings view, which uses the same engine.
 *
 * Pure module: no Supabase, no React. The caller supplies the energy profile
 * (measured where we have it, estimated otherwise) and the current settings.
 */
import { simulateEnergyBalance, type EnergyBalanceResult } from '../../solar/energy-balance'
import { type InverterSettings, WORK_MODE_LABELS } from './types'

export type RecCategory = 'battery' | 'export' | 'workmode' | 'schedule' | 'upgrade' | 'other'
export type RecSeverity = 'info' | 'opportunity' | 'high'

export interface Recommendation {
  /** Stable rule id — used as the upsert key per system. */
  code: string
  category: RecCategory
  severity: RecSeverity
  title: string
  rationale: string
  currentValue: string | null
  suggestedValue: string | null
  /** Modelled change in annual savings (R). null when not quantifiable. */
  projectedAnnualSavingR: number | null
  /** Modelled change in self-consumption (percentage points). */
  projectedSelfConsumptionDeltaPct: number | null
}

export interface RecommendationContext {
  settings: InverterSettings
  /** Battery nameplate kWh (null = no battery). */
  batteryKwh: number | null
  /** Import tariff (R/kWh). */
  tariffRate: number
  /** Feed-in tariff available to this customer (R/kWh). */
  feedInRate: number
  /** Whether a feed-in / net-metering agreement is in place or obtainable. */
  feedInAvailable: boolean
  /** Net generation per month (kWh), Jan→Dec — measured or estimated. */
  generationMonthlyKwh: number[]
  /** Consumption per month (kWh), Jan→Dec. */
  consumptionMonthlyKwh: number[]
  /** True when the profile came from real monitoring data (raises confidence). */
  hasMeasuredData: boolean
}

export interface OptimisationResult {
  baseline: {
    annualSavingR: number
    selfConsumptionPct: number
    gridIndependencePct: number
    importedKwh: number
    exportedKwh: number
    curtailedKwh: number
  }
  recommendations: Recommendation[]
}

// Typical LiFePO4 usable depth-of-discharge when the floor is a sensible 10%.
const DEFAULT_USABLE = 0.9
// Don't surface a money recommendation under this annual rand delta — noise.
const MIN_SAVING_R = 150

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** Usable battery fraction implied by a (min, max) SoC window. */
function usableFromSoc(minSoc: number, maxSoc: number): number {
  return clamp((maxSoc - minSoc) / 100, 0.05, 0.95)
}

function run(
  ctx: RecommendationContext,
  opts: { allowExport: boolean; feedInRate: number; usableFraction: number; batteryKwh: number | null },
): EnergyBalanceResult {
  return simulateEnergyBalance({
    generationMonthlyKwh: ctx.generationMonthlyKwh,
    consumptionMonthlyKwh: ctx.consumptionMonthlyKwh,
    tariffRate: ctx.tariffRate,
    feedInRate: opts.feedInRate,
    allowExport: opts.allowExport,
    battery: opts.batteryKwh
      ? { capacityKwh: opts.batteryKwh, usableFraction: opts.usableFraction }
      : null,
  })
}

export function buildRecommendations(ctx: RecommendationContext): OptimisationResult {
  const s = ctx.settings
  const recs: Recommendation[] = []

  // Derive the CURRENT operating point from the settings (sensible assumptions
  // where a value is unknown, so we can still model).
  const curMaxSoc = s.batteryMaxSocPct ?? 100
  const curMinSoc = s.batteryMinSocPct ?? 10
  const curExport = s.exportEnabled === true
  const curUsable = ctx.batteryKwh ? usableFromSoc(curMinSoc, curMaxSoc) : DEFAULT_USABLE

  const baseline = run(ctx, {
    allowExport: curExport,
    feedInRate: curExport && ctx.feedInAvailable ? ctx.feedInRate : 0,
    usableFraction: curUsable,
    batteryKwh: ctx.batteryKwh,
  })

  const baseSaving = baseline.annual.savingR
  const baseSelfCons = baseline.annual.selfConsumptionPct

  const push = (r: Recommendation) => recs.push(r)
  const delta = (modified: EnergyBalanceResult) => ({
    rand: Math.round(modified.annual.savingR - baseSaving),
    sc: modified.annual.selfConsumptionPct - baseSelfCons,
  })

  // ── Rule: enable export (only if there's surplus going to waste + a tariff) ──
  if (!curExport && ctx.feedInAvailable && ctx.feedInRate > 0 && baseline.annual.curtailedKwh > 5) {
    const modified = run(ctx, {
      allowExport: true, feedInRate: ctx.feedInRate, usableFraction: curUsable, batteryKwh: ctx.batteryKwh,
    })
    const d = delta(modified)
    if (d.rand >= MIN_SAVING_R) {
      push({
        code: 'enable_export',
        category: 'export',
        severity: d.rand > 1000 ? 'high' : 'opportunity',
        title: 'Turn on grid export to earn from surplus solar',
        rationale: `About ${Math.round(baseline.annual.curtailedKwh)} kWh/yr of solar is currently wasted at midday. With a feed-in tariff of R${ctx.feedInRate.toFixed(2)}/kWh, exporting it earns roughly R${d.rand}/yr. Only do this where the municipality allows feed-in.`,
        currentValue: 'Export off',
        suggestedValue: 'Export on',
        projectedAnnualSavingR: d.rand,
        projectedSelfConsumptionDeltaPct: 0,
      })
    }
  }

  // ── Rule: exporting for free (export on but no tariff) ──
  if (curExport && (!ctx.feedInAvailable || ctx.feedInRate <= 0) && baseline.annual.exportedKwh > 5) {
    const valueIfKept = Math.round(baseline.annual.exportedKwh * ctx.tariffRate)
    push({
      code: 'export_for_free',
      category: 'export',
      severity: valueIfKept > 1000 ? 'high' : 'opportunity',
      title: 'You are giving away solar for free',
      rationale: `About ${Math.round(baseline.annual.exportedKwh)} kWh/yr is exported with no feed-in payment — worth ~R${valueIfKept}/yr if it were self-consumed instead. Consider more storage, shifting loads (geyser/pool) into daylight, or securing a feed-in agreement.`,
      currentValue: 'Export on, no tariff',
      suggestedValue: 'Self-consume (battery / load-shift)',
      projectedAnnualSavingR: valueIfKept,
      projectedSelfConsumptionDeltaPct: null,
    })
  }

  // ── Rule: reserve floor too high (battery sitting idle each night) ──
  if (ctx.batteryKwh && curMinSoc > 15) {
    const targetMin = 10
    const modified = run(ctx, {
      allowExport: curExport,
      feedInRate: curExport && ctx.feedInAvailable ? ctx.feedInRate : 0,
      usableFraction: usableFromSoc(targetMin, curMaxSoc),
      batteryKwh: ctx.batteryKwh,
    })
    const d = delta(modified)
    if (d.rand >= MIN_SAVING_R) {
      push({
        code: 'lower_reserve_floor',
        category: 'battery',
        severity: d.rand > 1000 ? 'high' : 'opportunity',
        title: `Lower the battery reserve floor to ${targetMin}%`,
        rationale: `The reserve is set to ${curMinSoc}%, so roughly ${Math.round((curMinSoc - targetMin) / 100 * ctx.batteryKwh * 10) / 10} kWh of usable storage is held back every night and bought from the grid instead. Dropping to ${targetMin}% frees that capacity — about R${d.rand}/yr — while still keeping a small buffer. Raise it again before known load-shedding.`,
        currentValue: `${curMinSoc}%`,
        suggestedValue: `${targetMin}%`,
        projectedAnnualSavingR: d.rand,
        projectedSelfConsumptionDeltaPct: Math.round(d.sc),
      })
    }
  }

  // ── Rule: charge ceiling below 100% while surplus is wasted ──
  if (ctx.batteryKwh && curMaxSoc < 100 && baseline.annual.curtailedKwh > 5) {
    const modified = run(ctx, {
      allowExport: curExport,
      feedInRate: curExport && ctx.feedInAvailable ? ctx.feedInRate : 0,
      usableFraction: usableFromSoc(curMinSoc, 100),
      batteryKwh: ctx.batteryKwh,
    })
    const d = delta(modified)
    if (d.rand >= MIN_SAVING_R) {
      push({
        code: 'raise_charge_ceiling',
        category: 'battery',
        severity: 'opportunity',
        title: 'Raise the charge ceiling toward 100%',
        rationale: `The battery stops charging at ${curMaxSoc}% while surplus solar is being wasted. Allowing it to fill captures more of that energy — about R${d.rand}/yr. A slightly lower ceiling can extend battery life, so weigh this against the warranty guidance.`,
        currentValue: `${curMaxSoc}%`,
        suggestedValue: '100%',
        projectedAnnualSavingR: d.rand,
        projectedSelfConsumptionDeltaPct: Math.round(d.sc),
      })
    }
  }

  // ── Rule: work mode not self-use (battery under-used) ──
  if (ctx.batteryKwh && (s.workMode === 'backup' || s.workMode === 'feed_in_priority')) {
    // Approximate "battery barely cycled" as a 5% usable window vs self-use.
    const idle = run(ctx, { allowExport: curExport, feedInRate: 0, usableFraction: 0.05, batteryKwh: ctx.batteryKwh })
    const selfUse = run(ctx, { allowExport: curExport, feedInRate: curExport && ctx.feedInAvailable ? ctx.feedInRate : 0, usableFraction: curUsable, batteryKwh: ctx.batteryKwh })
    const rand = Math.round(selfUse.annual.savingR - idle.annual.savingR)
    push({
      code: 'switch_to_self_use',
      category: 'workmode',
      severity: rand > 1500 ? 'high' : 'opportunity',
      title: 'Switch to Self-use mode to actually use the battery',
      rationale: `The inverter is in ${WORK_MODE_LABELS[s.workMode]} mode, which keeps the battery largely idle for daily load. Self-use cycles it against the evening peak — worth roughly R${rand}/yr at this profile. Keep a healthy reserve floor for outages.`,
      currentValue: WORK_MODE_LABELS[s.workMode],
      suggestedValue: WORK_MODE_LABELS.self_use,
      projectedAnnualSavingR: rand >= MIN_SAVING_R ? rand : null,
      projectedSelfConsumptionDeltaPct: null,
    })
  }

  // ── Rule: no battery but heavy grid import → upgrade opportunity ──
  if (!ctx.batteryKwh && baseline.annual.importedKwh > 1000) {
    // Model a battery sized to ~1.5× average daily evening load.
    const avgDailyLoad = ctx.consumptionMonthlyKwh.reduce((a, b) => a + b, 0) / 365
    const suggestedKwh = Math.max(5, Math.round(avgDailyLoad * 0.6))
    const withBattery = run(ctx, {
      allowExport: curExport,
      feedInRate: curExport && ctx.feedInAvailable ? ctx.feedInRate : 0,
      usableFraction: DEFAULT_USABLE,
      batteryKwh: suggestedKwh,
    })
    const rand = Math.round(withBattery.annual.savingR - baseSaving)
    if (rand >= MIN_SAVING_R) {
      push({
        code: 'add_battery',
        category: 'upgrade',
        severity: 'opportunity',
        title: `Add ~${suggestedKwh} kWh of storage`,
        rationale: `This system imports about ${Math.round(baseline.annual.importedKwh)} kWh/yr — much of it in the evening after the sun is down. Roughly ${suggestedKwh} kWh of battery would shift that off the grid, saving in the region of R${rand}/yr and adding outage cover. A sizing quote can firm this up.`,
        currentValue: 'No battery',
        suggestedValue: `~${suggestedKwh} kWh battery`,
        projectedAnnualSavingR: rand,
        projectedSelfConsumptionDeltaPct: Math.round(withBattery.annual.selfConsumptionPct - baseSelfCons),
      })
    }
  }

  // ── Rule: grid charging off — loadshedding readiness note (qualitative) ──
  if (ctx.batteryKwh && s.gridChargeEnabled === false) {
    push({
      code: 'grid_charge_loadshedding',
      category: 'schedule',
      severity: 'info',
      title: 'Consider a grid-charge window before known load-shedding',
      rationale: 'Grid charging is off. For self-consumption that is usually correct (you avoid paying to fill the battery). But a small scheduled top-up ahead of announced load-shedding can prevent an outage on a cloudy day. Leave off otherwise.',
      currentValue: 'Grid charge off',
      suggestedValue: 'Off, with a pre-loadshedding schedule',
      projectedAnnualSavingR: null,
      projectedSelfConsumptionDeltaPct: null,
    })
  }

  // Sort: highest projected saving first, then severity, info last.
  const sevRank: Record<RecSeverity, number> = { high: 0, opportunity: 1, info: 2 }
  recs.sort((a, b) => {
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity]
    return (b.projectedAnnualSavingR ?? 0) - (a.projectedAnnualSavingR ?? 0)
  })

  return {
    baseline: {
      annualSavingR: Math.round(baseSaving),
      selfConsumptionPct: baseSelfCons,
      gridIndependencePct: baseline.annual.gridIndependencePct,
      importedKwh: Math.round(baseline.annual.importedKwh),
      exportedKwh: Math.round(baseline.annual.exportedKwh),
      curtailedKwh: Math.round(baseline.annual.curtailedKwh),
    },
    recommendations: recs,
  }
}
