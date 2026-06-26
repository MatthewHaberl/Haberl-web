/**
 * Build the monthly generation + consumption profile the optimisation engine
 * needs, from whatever data we have:
 *   - MEASURED: integrate recent monitoring_readings (pv_power_w, load_power_w)
 *     into kWh, then scale to an annual shape. Used when there's enough history.
 *   - ESTIMATED: fall back to a capacity-based estimate (Gauteng PSH) when the
 *     collector hasn't gathered enough yet.
 * Either way the result is two 12-element arrays the WhatIf panel can also let
 * staff override with the customer's actual bill figures.
 */
import { spreadAnnual } from '../../solar/energy-balance'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface EnergyProfile {
  generationMonthlyKwh: number[]
  consumptionMonthlyKwh: number[]
  basis: 'measured' | 'estimated'
  measuredDays: number
}

// Gauteng monthly weighting — higher in summer, lower mid-winter.
const GEN_SEASONAL = [1.15, 1.10, 1.05, 0.95, 0.82, 0.78, 0.83, 0.95, 1.07, 1.12, 1.12, 1.06]
// Consumption is flatter but a little higher in winter (heating).
const CONS_SEASONAL = [0.92, 0.92, 0.96, 1.0, 1.08, 1.12, 1.12, 1.06, 1.0, 0.96, 0.94, 0.92]

const GAUTENG_PSH = 5.0      // peak sun hours/day
const PERF_RATIO = 0.8       // system derate

/** Capacity-based estimate when we lack measured data. */
function estimate(capacityKw: number | null, batteryKwh: number | null): EnergyProfile {
  const kw = capacityKw && capacityKw > 0 ? capacityKw : 5
  const annualGen = kw * 365 * GAUTENG_PSH * PERF_RATIO
  // Assume consumption is roughly matched to generation (typical sizing), a touch
  // higher so there's some import — keeps recommendations meaningful.
  const annualCons = annualGen * 1.05
  return {
    generationMonthlyKwh: spreadAnnual(annualGen, GEN_SEASONAL),
    consumptionMonthlyKwh: spreadAnnual(annualCons, CONS_SEASONAL),
    basis: 'estimated',
    measuredDays: 0,
  }
}

interface ReadingRow { recorded_at: string; pv_power_w: number | null; load_power_w: number | null }

/** Trapezoidal energy (kWh) from a power-vs-time series, ignoring large gaps. */
function integrateKwh(rows: ReadingRow[], key: 'pv_power_w' | 'load_power_w'): number {
  let kwh = 0
  for (let i = 1; i < rows.length; i++) {
    const p0 = rows[i - 1][key]
    const p1 = rows[i][key]
    if (p0 == null && p1 == null) continue
    const dtH = (new Date(rows[i].recorded_at).getTime() - new Date(rows[i - 1].recorded_at).getTime()) / 3_600_000
    if (!(dtH > 0) || dtH > 1) continue   // skip backwards/zero steps and >1h gaps
    const avgW = ((p0 ?? p1 ?? 0) + (p1 ?? p0 ?? 0)) / 2
    kwh += (avgW / 1000) * dtH
  }
  return kwh
}

export async function buildEnergyProfile(
  supabase: AnySupabaseClient,
  system: { id: string; capacity_kw: number | null; battery_kwh: number | null },
): Promise<EnergyProfile> {
  // Last 21 days of readings, oldest-first, capped so the query stays light.
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString()
  const { data } = await supabase
    .from('monitoring_readings')
    .select('recorded_at, pv_power_w, load_power_w')
    .eq('system_id', system.id)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true })
    .limit(8000)

  const rows = (data ?? []) as ReadingRow[]
  if (rows.length < 50) return estimate(system.capacity_kw, system.battery_kwh)

  const spanH = (new Date(rows[rows.length - 1].recorded_at).getTime() - new Date(rows[0].recorded_at).getTime()) / 3_600_000
  const days = spanH / 24
  if (days < 2) return estimate(system.capacity_kw, system.battery_kwh)

  const genKwh = integrateKwh(rows, 'pv_power_w')
  const loadKwh = integrateKwh(rows, 'load_power_w')

  // Need a usable load signal to model consumption; otherwise estimate.
  if (loadKwh <= 0) return estimate(system.capacity_kw, system.battery_kwh)

  const annualGen = (genKwh / days) * 365
  const annualCons = (loadKwh / days) * 365

  return {
    generationMonthlyKwh: spreadAnnual(annualGen, GEN_SEASONAL),
    consumptionMonthlyKwh: spreadAnnual(annualCons, CONS_SEASONAL),
    basis: 'measured',
    measuredDays: Math.round(days),
  }
}
