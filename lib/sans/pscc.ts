/**
 * SANS 10142-1 §8.4 — prospective short-circuit current at the point of
 * supply/control.
 *
 * 8.4.3: PSCC = V ÷ (√3 × Ztotal)          (V = phase-to-phase volts)
 * 8.4.4: Ztransformer = (V² ÷ (P × 10³)) × (Z% ÷ 100)
 * 8.4.5: Zconductor = L × √(R² + X²) ÷ 1000   (R, X in Ω/km — table D.1)
 * 8.4.2 note 1: three-phase ≈ single-phase × 1,73 (so 1φ ≈ 3φ ÷ 1,73).
 * Amdt 3 (8.4.7): where sources operate in parallel (grid + PV + battery),
 * their contributions must be summed; battery PSCC from BMS data.
 */
import type { Verdict } from './calculators'
import { CONDUCTOR_IMPEDANCE } from './tables/conductor-impedance'

export interface PsccInput {
  /** Phase-to-phase voltage, V (400 for standard LV). */
  voltage: number
  /** Transformer rating, kVA. */
  transformerKva: number
  /** Transformer short-circuit impedance voltage, %. */
  transformerZPercent: number
  /** Optional supply cable between transformer and the board under test. */
  cable?: {
    sizeMm2: number
    lengthM: number
    material: 'cu' | 'al'
  } | null
  /** Amdt 3: summed contribution of paralleled sources (PV inverters, battery BMS, generators), kA. */
  parallelSourcesKa?: number
  /** Switchgear short-circuit rating to check against, kA. */
  switchgearKa?: number
}

export interface PsccResult {
  zTransformer: number
  zConductor: number
  zTotal: number
  pscc3phA: number
  pscc1phA: number
  totalWithSourcesA: number
  verdicts: Verdict[]
}

export function pscc(input: PsccInput): PsccResult | { error: string } {
  if (!(input.voltage > 0) || !(input.transformerKva > 0) || !(input.transformerZPercent > 0)) {
    return { error: 'Enter the supply voltage, transformer kVA and impedance %' }
  }

  const zTransformer = ((input.voltage * input.voltage) / (input.transformerKva * 1e3)) * (input.transformerZPercent / 100)

  let zConductor = 0
  if (input.cable && input.cable.lengthM > 0) {
    const row = CONDUCTOR_IMPEDANCE.find((r) => r.size === input.cable!.sizeMm2)
    if (!row) return { error: `No ${input.cable.sizeMm2} mm² entry in table D.1` }
    const r = input.cable.material === 'cu' ? row.rAcCu : row.rAcAl
    const x = input.cable.material === 'cu' ? row.xAcCu : row.xAcAl
    if (r == null || x == null) {
      return { error: `${input.cable.sizeMm2} mm² is not tabulated for ${input.cable.material === 'cu' ? 'copper' : 'aluminium'} in table D.1` }
    }
    zConductor = (input.cable.lengthM * Math.sqrt(r * r + x * x)) / 1000
  }

  const zTotal = zTransformer + zConductor
  const pscc3phA = input.voltage / (Math.sqrt(3) * zTotal)
  const pscc1phA = pscc3phA / 1.73
  const totalWithSourcesA = pscc3phA + (input.parallelSourcesKa ?? 0) * 1000

  const verdicts: Verdict[] = []
  verdicts.push({
    status: 'pass',
    headline: `PSCC at the board: ${(pscc3phA / 1000).toFixed(1)} kA three-phase`,
    detail: `Ztransformer ${zTransformer.toFixed(4)} Ω${zConductor > 0 ? ` + Zconductor ${zConductor.toFixed(4)} Ω (table D.1)` : ''} = ${zTotal.toFixed(4)} Ω. Single-phase estimate ≈ ${(pscc1phA / 1000).toFixed(1)} kA (÷1,73). A fault-current meter reading at the point of control is the definitive value.`,
    clauseRefs: ['8.4.3', '8.4.4', '8.4.5'],
  })

  if ((input.parallelSourcesKa ?? 0) > 0) {
    verdicts.push({
      status: 'pass',
      headline: `With paralleled sources: ${(totalWithSourcesA / 1000).toFixed(1)} kA`,
      detail: `Amendment 3 (8.4.7) requires summing every source that can operate in parallel — grid + ${input.parallelSourcesKa} kA from PV/battery/generator contributions (battery PSCC from the BMS nameplate, datasheet or manufacturer).`,
      clauseRefs: ['8.4'],
    })
  }

  if (input.switchgearKa != null && input.switchgearKa > 0) {
    const requiredKa = totalWithSourcesA / 1000
    if (input.switchgearKa * 1000 >= totalWithSourcesA) {
      verdicts.push({
        status: 'pass',
        headline: `Switchgear OK: ${input.switchgearKa} kA rating ≥ ${requiredKa.toFixed(1)} kA PSCC`,
        detail: 'The short-circuit rating of the board and its devices covers the prospective fault current.',
        clauseRefs: ['6.6.1', '8.4.1'],
      })
    } else {
      verdicts.push({
        status: 'fail',
        headline: `Switchgear under-rated: ${input.switchgearKa} kA < ${requiredKa.toFixed(1)} kA PSCC`,
        detail: 'The board/devices must be rated at or above the prospective short-circuit current at their location — use higher-kA equipment or a current-limiting upstream device.',
        clauseRefs: ['6.6.1', '8.4.1'],
      })
    }
  }

  return { zTransformer, zConductor, zTotal, pscc3phA, pscc1phA, totalWithSourcesA, verdicts }
}
