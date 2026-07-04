/**
 * SANS 10142-1:2024 Ed 3.2 — protective conductor sizing and small-conductor
 * protection limits.
 *
 * Table 6.25 — minimum cross-sectional area of protective conductors, from the
 *              phase conductor area S.
 * Table 6.27 — maximum protection rating for nominal cross-sectional area of
 *              small conductors (PVC insulated).
 */

/** Standard conductor sizes used to round a computed protective-conductor area up. */
export const STANDARD_SIZES = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400] as const

/** Table 6.25: minimum protective conductor area Sp for phase conductor area S (both mm²). */
export function minProtectiveConductor(phaseArea: number): { exact: number; standard: number | null; rule: string } {
  let exact: number
  let rule: string
  if (phaseArea <= 16) {
    exact = phaseArea
    rule = 'S ≤ 16 mm² → Sp = S'
  } else if (phaseArea <= 35) {
    exact = 16
    rule = '16 < S ≤ 35 mm² → Sp = 16 mm²'
  } else if (phaseArea <= 400) {
    exact = phaseArea / 2
    rule = '35 < S ≤ 400 mm² → Sp = S/2'
  } else if (phaseArea <= 800) {
    exact = 200
    rule = '400 < S ≤ 800 mm² → Sp = 200 mm²'
  } else {
    exact = phaseArea / 4
    rule = 'S > 800 mm² → Sp = S/4'
  }
  const standard = STANDARD_SIZES.find((s) => s >= exact) ?? null
  return { exact, standard, rule }
}

/** Table 6.27: maximum protection rating for small PVC-insulated conductors. */
export const SMALL_CONDUCTOR_MAX_PROTECTION: { maxA: number; sizeMm2: number }[] = [
  { maxA: 10, sizeMm2: 1 },
  { maxA: 16, sizeMm2: 1.5 },
  { maxA: 25, sizeMm2: 2.5 },
]

/** The 6.27 cap for a conductor size, if it is a tabulated small conductor. */
export function smallConductorCap(sizeMm2: number): number | null {
  const row = SMALL_CONDUCTOR_MAX_PROTECTION.find((r) => r.sizeMm2 === sizeMm2)
  return row ? row.maxA : null
}

/**
 * Table 8.1 (8.6.3, Amdt 2) — maximum resistance of the earth continuity path,
 * by the rated current of the protective device. Values equal 9,2 ÷ In.
 * Final circuits above 63 A fall under table 6.28 instead.
 */
export const ECC_MAX_RESISTANCE: { ratedA: number; maxOhm: number }[] = [
  { ratedA: 6, maxOhm: 1.533 },
  { ratedA: 10, maxOhm: 0.920 },
  { ratedA: 16, maxOhm: 0.575 },
  { ratedA: 20, maxOhm: 0.460 },
  { ratedA: 25, maxOhm: 0.368 },
  { ratedA: 32, maxOhm: 0.288 },
  { ratedA: 40, maxOhm: 0.230 },
  { ratedA: 45, maxOhm: 0.204 },
  { ratedA: 50, maxOhm: 0.184 },
  { ratedA: 63, maxOhm: 0.146 },
]
