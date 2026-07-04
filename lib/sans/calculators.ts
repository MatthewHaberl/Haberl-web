/**
 * SANS 10142-1 calculator engine — pure functions, clause-cited verdicts.
 *
 * Voltage drop:      6.2.7 (5 % limit; 11,5 V / 20 V on 230/400 V; d.c. 5 %)
 * Current capacity:  6.2.5 / tables 6.2(a)–6.4(a), factors 6.10 & 6.14
 * Overload:          6.7.2.1 (breaker ≤ conductor capacity), table 6.27
 * Protective earth:  6.12 / table 6.25
 */
import { VD_CABLE_TYPES, type VdValue } from './tables/voltage-drop'
import { CC_CABLE_TYPES } from './tables/current-capacity'
import { ambientFactor, groupingFactor, GROUPING_SCENARIOS } from './tables/correction-factors'
import { smallConductorCap } from './tables/earthing'

export type VerdictStatus = 'pass' | 'warning' | 'fail'

export interface Verdict {
  status: VerdictStatus
  headline: string
  detail: string
  clauseRefs: string[]
}

/** Effective mV/A/m for a table entry at a given power factor. */
export function effectiveMvPerAm(value: VdValue, powerFactor: number): number | null {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (powerFactor >= 1) return value.r
  const sinPhi = Math.sqrt(Math.max(0, 1 - powerFactor * powerFactor))
  return value.r * powerFactor + value.x * sinPhi
}

export interface VoltageDropInput {
  cableTypeId: string
  arrangementId: string
  sizeMm2: number
  current: number
  lengthM: number
  /** 0.: use tabulated z (worst case). */
  powerFactor: number
  /** Nominal voltage: 230 (1φ), 400 (3φ) or the d.c. system voltage. */
  nominalVoltage: number
  /** Optional stricter limit (e.g. 3 % budget for a PV DC run). */
  limitPercent?: number
}

export interface VoltageDropResult {
  mvPerAm: number
  dropVolts: number
  dropPercent: number
  limitPercent: number
  limitVolts: number
  maxLengthAtLimit: number
  verdicts: Verdict[]
  tableRef: string
}

export function voltageDrop(input: VoltageDropInput): VoltageDropResult | { error: string } {
  const cable = VD_CABLE_TYPES.find((c) => c.id === input.cableTypeId)
  if (!cable) return { error: 'Unknown cable type' }
  const arrangement = cable.arrangements.find((a) => a.id === input.arrangementId)
  if (!arrangement) return { error: 'Unknown circuit arrangement' }
  const row = cable.rows.find((r) => r.size === input.sizeMm2)
  if (!row) return { error: `No ${input.sizeMm2} mm² entry in table ${cable.table}` }
  const raw = row.values[input.arrangementId]
  if (raw == null) return { error: `${input.sizeMm2} mm² is not tabulated for this arrangement (— in table ${cable.table})` }

  const pf = arrangement.phases === 0 ? 1 : input.powerFactor
  const mv = pf > 0 && pf < 1 ? effectiveMvPerAm(raw, pf) : typeof raw === 'number' ? raw : raw.z
  if (mv == null) return { error: 'No impedance value available' }

  const dropVolts = (mv * input.current * input.lengthM) / 1000
  const dropPercent = (dropVolts / input.nominalVoltage) * 100
  const limitPercent = input.limitPercent ?? 5
  const limitVolts = (limitPercent / 100) * input.nominalVoltage
  const maxLengthAtLimit = (limitVolts * 1000) / (mv * input.current)

  const verdicts: Verdict[] = []
  const pct = dropPercent.toFixed(2)
  if (dropPercent <= limitPercent) {
    verdicts.push({
      status: dropPercent > limitPercent * 0.9 ? 'warning' : 'pass',
      headline: dropPercent > limitPercent * 0.9 ? `Within limit, but tight: ${pct} %` : `Compliant: ${pct} % ≤ ${limitPercent} %`,
      detail: `Voltage drop is ${dropVolts.toFixed(2)} V of ${input.nominalVoltage} V. Limit ${limitPercent} % = ${limitVolts.toFixed(1)} V. Max run at this load: ${maxLengthAtLimit.toFixed(0)} m.`,
      clauseRefs: ['5.3.2', '6.2.7.1.1'],
    })
  } else {
    verdicts.push({
      status: 'fail',
      headline: `Over the limit: ${pct} % > ${limitPercent} %`,
      detail: `Voltage drop is ${dropVolts.toFixed(2)} V of ${input.nominalVoltage} V (limit ${limitVolts.toFixed(1)} V). At ${input.current} A this size only reaches ${maxLengthAtLimit.toFixed(0)} m — use a larger conductor or shorten the run.`,
      clauseRefs: ['5.3.2', '6.2.7.1.1'],
    })
  }
  if (arrangement.phases === 1 && input.nominalVoltage === 230 && dropVolts > 11.5) {
    verdicts.push({
      status: 'fail',
      headline: 'Exceeds the 11,5 V single-phase cap',
      detail: 'On a 230/400 V system a single-phase circuit may not drop more than 11,5 V.',
      clauseRefs: ['6.2.7.1.2'],
    })
  }
  if (arrangement.phases === 3 && input.nominalVoltage === 400 && dropVolts > 20) {
    verdicts.push({
      status: 'fail',
      headline: 'Exceeds the 20 V three-phase cap',
      detail: 'On a 230/400 V system a three-phase circuit may not drop more than 20 V.',
      clauseRefs: ['6.2.7.1.2'],
    })
  }
  if (arrangement.phases === 0) {
    verdicts.push({
      status: 'pass',
      headline: 'd.c. circuit rule',
      detail: 'For d.c. installations the drop between any point of supply and consumption may not exceed 5 % of nominal — or the equipment manufacturer\'s requirement if stricter (common for PV strings and battery runs).',
      clauseRefs: ['6.2.7.1.5'],
    })
  }

  return { mvPerAm: mv, dropVolts, dropPercent, limitPercent, limitVolts, maxLengthAtLimit, verdicts, tableRef: cable.table }
}

export interface CapacityInput {
  cableTypeId: string
  arrangementId: string
  sizeMm2: number
  ambientC: number
  groupingScenarioId: string | null
  circuits: number
  designCurrent: number
  breakerRating: number
}

export interface CapacityResult {
  baseCapacity: number
  ambientCf: number
  groupingCf: number
  deratedCapacity: number
  verdicts: Verdict[]
  tableRef: string
}

export function cableCapacity(input: CapacityInput): CapacityResult | { error: string } {
  const cable = CC_CABLE_TYPES.find((c) => c.id === input.cableTypeId)
  if (!cable) return { error: 'Unknown cable type' }
  const row = cable.rows.find((r) => r.size === input.sizeMm2)
  if (!row) return { error: `No ${input.sizeMm2} mm² entry in table ${cable.table}` }
  const base = row.values[input.arrangementId]
  if (base == null) return { error: `${input.sizeMm2} mm² is not tabulated for this arrangement (— in table ${cable.table})` }

  const aCf = ambientFactor(input.ambientC, 'pvc70')
  if (aCf == null) return { error: 'PVC cable cannot be used above 65 °C ambient (table 6.10)' }

  let gCf = 1
  if (input.groupingScenarioId && input.circuits > 1) {
    const scenario = GROUPING_SCENARIOS.find((s) => s.id === input.groupingScenarioId)
    if (!scenario) return { error: 'Unknown grouping scenario' }
    const f = groupingFactor(scenario, input.circuits)
    if (f == null) return { error: `Table 6.14 has no factor for ${input.circuits} circuits in this arrangement — reduce the group or change the installation method` }
    gCf = f
  }

  const derated = base * aCf * gCf
  const verdicts: Verdict[] = []

  if (input.designCurrent > derated) {
    verdicts.push({
      status: 'fail',
      headline: `Overloaded: ${input.designCurrent} A > ${derated.toFixed(1)} A capacity`,
      detail: `Base rating ${base} A × ambient ${aCf} × grouping ${gCf} = ${derated.toFixed(1)} A. The design current exceeds the corrected capacity — larger conductor or better installation conditions required.`,
      clauseRefs: ['6.2.5', '6.2.8', '6.2.9'],
    })
  } else {
    verdicts.push({
      status: 'pass',
      headline: `Capacity OK: ${derated.toFixed(1)} A available for ${input.designCurrent} A design current`,
      detail: `Base rating ${base} A (table ${cable.table}) × ambient factor ${aCf} (table 6.10) × grouping factor ${gCf} (table 6.14).`,
      clauseRefs: ['6.2.5'],
    })
  }

  if (input.breakerRating > derated) {
    verdicts.push({
      status: 'fail',
      headline: `Breaker too big: ${input.breakerRating} A > ${derated.toFixed(1)} A conductor capacity`,
      detail: 'The rated current of the overload protective device may not exceed the current-carrying capacity of the conductor it protects.',
      clauseRefs: ['6.7.2.1'],
    })
  } else {
    verdicts.push({
      status: 'pass',
      headline: `Overload protection OK: ${input.breakerRating} A ≤ ${derated.toFixed(1)} A`,
      detail: 'Breaker rating does not exceed the corrected conductor capacity.',
      clauseRefs: ['6.7.2.1'],
    })
  }

  const cap = smallConductorCap(input.sizeMm2)
  if (cap != null && input.breakerRating > cap) {
    verdicts.push({
      status: 'fail',
      headline: `Table 6.27 cap: max ${cap} A protection on ${input.sizeMm2} mm²`,
      detail: 'Small PVC conductors carry an absolute protection cap: 1 mm² → 10 A, 1,5 mm² → 16 A, 2,5 mm² → 25 A.',
      clauseRefs: ['6.7.2.1'],
    })
  }

  return { baseCapacity: base, ambientCf: aCf, groupingCf: gCf, deratedCapacity: derated, verdicts, tableRef: cable.table }
}
