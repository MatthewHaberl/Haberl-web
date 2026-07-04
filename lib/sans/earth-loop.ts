/**
 * SANS 10142-1 §8.6.5 — earth (and neutral) fault-loop impedance at the main switch.
 *
 * Requirement (8.6.5.1): the earth-loop impedance must allow a fault current at
 * least equal to the INSTANTANEOUS tripping current of the main protective
 * device, so the supply disconnects automatically: Zs ≤ U0 ÷ Ia, Ia = k × In.
 * k comes from the tripping curve (manufacturer data); NOTE 1 allows a typical
 * field assumption of 10× when data is absent. 8.6.5.2: the neutral-loop
 * reading should be at or below the earth-loop value — never higher.
 */
import type { Verdict } from './calculators'

export interface TripCurve {
  id: string
  label: string
  /** Guaranteed-instantaneous multiple of In (upper end of the curve band). */
  multiple: number
  note: string
}

export const TRIP_CURVES: TripCurve[] = [
  { id: 'assume10', label: 'Unknown — assume 10× (8.6.5.1 note 1)', multiple: 10, note: 'Typical field assumption when product data is absent.' },
  { id: 'b', label: 'Curve B (trips 3–5× In)', multiple: 5, note: 'Guaranteed instantaneous at 5× In.' },
  { id: 'c', label: 'Curve C (trips 5–10× In)', multiple: 10, note: 'Guaranteed instantaneous at 10× In.' },
  { id: 'd', label: 'Curve D (trips 10–20× In)', multiple: 20, note: 'Guaranteed instantaneous at 20× In.' },
]

export interface EarthLoopInput {
  /** Nominal voltage to earth, usually 230 V. */
  u0: number
  /** Main protective device rating, A. */
  ratedA: number
  curveId: string
  /** Measured earth-loop impedance, Ω. */
  measuredZs: number
  /** Optional measured neutral-loop impedance, Ω. */
  measuredZn?: number | null
}

export interface EarthLoopResult {
  tripCurrent: number
  maxZs: number
  faultCurrentAtZs: number
  marginPct: number
  verdicts: Verdict[]
}

export function earthLoop(input: EarthLoopInput): EarthLoopResult | { error: string } {
  const curve = TRIP_CURVES.find((c) => c.id === input.curveId)
  if (!curve) return { error: 'Unknown tripping curve' }
  if (!(input.u0 > 0) || !(input.ratedA > 0) || !(input.measuredZs > 0)) {
    return { error: 'Enter voltage, breaker rating and the measured loop impedance' }
  }

  const tripCurrent = curve.multiple * input.ratedA
  const maxZs = input.u0 / tripCurrent
  const faultCurrentAtZs = input.u0 / input.measuredZs
  const marginPct = (input.measuredZs / maxZs) * 100

  const verdicts: Verdict[] = []
  if (input.measuredZs <= maxZs) {
    verdicts.push({
      status: marginPct > 90 ? 'warning' : 'pass',
      headline:
        marginPct > 90
          ? `Passes, but with almost no margin (${marginPct.toFixed(0)} % of the limit)`
          : `Earth loop OK: ${input.measuredZs.toFixed(3)} Ω ≤ ${maxZs.toFixed(3)} Ω`,
      detail: `A bolted earth fault drives ${faultCurrentAtZs.toFixed(0)} A — ${faultCurrentAtZs >= tripCurrent ? 'at or above' : 'below'} the ${tripCurrent.toFixed(0)} A instantaneous trip (${curve.multiple}× the ${input.ratedA} A main device). ${curve.note}`,
      clauseRefs: ['8.6.5.1'],
    })
  } else {
    verdicts.push({
      status: 'fail',
      headline: `Earth loop too high: ${input.measuredZs.toFixed(3)} Ω > ${maxZs.toFixed(3)} Ω`,
      detail: `A fault would only drive ${faultCurrentAtZs.toFixed(0)} A — below the ${tripCurrent.toFixed(0)} A needed for instantaneous disconnection. Improve the earth path, or where impractical, 8.6.5.4 permits an earth-fault detection-and-disconnection device that limits touch voltage to 25 V within the table 8.3 times.`,
      clauseRefs: ['8.6.5.1', '8.6.5.4'],
    })
  }

  if (input.measuredZn != null && input.measuredZn > 0) {
    if (input.measuredZn <= input.measuredZs) {
      verdicts.push({
        status: 'pass',
        headline: `Neutral loop OK: ${input.measuredZn.toFixed(3)} Ω ≤ earth loop`,
        detail: 'The neutral-loop reading is at or below the earth-loop value, as 8.6.5.2 expects.',
        clauseRefs: ['8.6.5.2', '8.6.5.3'],
      })
    } else {
      verdicts.push({
        status: 'fail',
        headline: `Neutral loop higher than the earth loop (${input.measuredZn.toFixed(3)} Ω > ${input.measuredZs.toFixed(3)} Ω)`,
        detail: 'The neutral impedance may never exceed the earth-loop value — check the main neutral connection and parallel paths (test with the main switch off and the main neutral disconnected where possible).',
        clauseRefs: ['8.6.5.2'],
      })
    }
  }

  return { tripCurrent, maxZs, faultCurrentAtZs, marginPct, verdicts }
}
