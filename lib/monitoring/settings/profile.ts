/**
 * Build the monthly generation + consumption profile the optimisation engine
 * needs, from whatever data we have — entirely DB-side, NEVER the brand API:
 *   - MEASURED: aggregate ALL stored monitoring_readings into a per-calendar-month
 *     average via the monitoring_monthly_profile() SQL function (one cheap query,
 *     12 rows back — not thousands). Backfilling more history makes this richer
 *     and gives a REAL seasonal shape, not a generic estimate.
 *   - ESTIMATED: fall back to a capacity-based estimate (Gauteng PSH) when too
 *     little has been collected yet.
 * Either way the result is two 12-element arrays the What-if panel can also let
 * staff override with the customer's actual bill figures.
 */
import { spreadAnnual } from '../../solar/energy-balance'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface EnergyProfile {
  generationMonthlyKwh: number[]
  consumptionMonthlyKwh: number[]
  basis: 'measured' | 'estimated'
  /** How many calendar months have enough readings to be measured directly. */
  measuredMonths: number
}

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
// Gauteng monthly weighting — higher in summer, lower mid-winter. Used to fill
// months that backfill hasn't reached yet, scaled to the measured ones.
const GEN_SEASONAL = [1.15, 1.10, 1.05, 0.95, 0.82, 0.78, 0.83, 0.95, 1.07, 1.12, 1.12, 1.06]
const CONS_SEASONAL = [0.92, 0.92, 0.96, 1.0, 1.08, 1.12, 1.12, 1.06, 1.0, 0.96, 0.94, 0.92]

const GAUTENG_PSH = 5.0
const PERF_RATIO = 0.8
// A month needs at least this many readings before we trust its average.
const MIN_SAMPLES_PER_MONTH = 30

/** Capacity-based estimate when we lack measured data. */
function estimate(capacityKw: number | null): EnergyProfile {
  const kw = capacityKw && capacityKw > 0 ? capacityKw : 5
  const annualGen = kw * 365 * GAUTENG_PSH * PERF_RATIO
  const annualCons = annualGen * 1.05
  return {
    generationMonthlyKwh: spreadAnnual(annualGen, GEN_SEASONAL),
    consumptionMonthlyKwh: spreadAnnual(annualCons, CONS_SEASONAL),
    basis: 'estimated',
    measuredMonths: 0,
  }
}

/** Fill null months by scaling the seasonal shape to the measured months. */
function fillMissing(measured: (number | null)[], seasonal: number[]): number[] {
  const present = measured.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0)
  if (!present.length) return seasonal.map(() => 0)
  const baseline = present.reduce((s, i) => s + measured[i]! / seasonal[i], 0) / present.length
  return measured.map((v, i) => (v != null ? Math.round(v) : Math.round(baseline * seasonal[i])))
}

interface MonthRow { month: number; avg_pv_w: number | null; avg_load_w: number | null; sample_count: number }

export async function buildEnergyProfile(
  supabase: AnySupabaseClient,
  system: { id: string; capacity_kw: number | null; battery_kwh: number | null },
): Promise<EnergyProfile> {
  let rows: MonthRow[] = []
  try {
    const { data, error } = await supabase.rpc('monitoring_monthly_profile', { p_system_id: system.id })
    if (error) throw error
    rows = (data ?? []) as MonthRow[]
  } catch {
    return estimate(system.capacity_kw)
  }

  const genMeasured: (number | null)[] = Array(12).fill(null)
  const loadMeasured: (number | null)[] = Array(12).fill(null)
  let monthsWithData = 0

  for (const r of rows) {
    const m = Number(r.month) - 1
    if (m < 0 || m > 11) continue
    if (Number(r.sample_count) < MIN_SAMPLES_PER_MONTH) continue
    monthsWithData++
    const pv = r.avg_pv_w != null ? Number(r.avg_pv_w) : null
    const ld = r.avg_load_w != null ? Number(r.avg_load_w) : null
    if (pv != null && pv >= 0) genMeasured[m] = (pv / 1000) * 24 * DAYS_PER_MONTH[m]
    if (ld != null && ld > 0)  loadMeasured[m] = (ld / 1000) * 24 * DAYS_PER_MONTH[m]
  }

  // No usable generation months → fall back to the capacity estimate.
  if (!genMeasured.some((v) => v != null)) return estimate(system.capacity_kw)

  const generationMonthlyKwh = fillMissing(genMeasured, GEN_SEASONAL)

  let consumptionMonthlyKwh: number[]
  if (loadMeasured.some((v) => v != null)) {
    consumptionMonthlyKwh = fillMissing(loadMeasured, CONS_SEASONAL)
  } else {
    // No load signal stored — estimate consumption off measured generation.
    const annualGen = generationMonthlyKwh.reduce((a, b) => a + b, 0)
    consumptionMonthlyKwh = spreadAnnual(annualGen * 1.05, CONS_SEASONAL)
  }

  return { generationMonthlyKwh, consumptionMonthlyKwh, basis: 'measured', measuredMonths: monthsWithData }
}
