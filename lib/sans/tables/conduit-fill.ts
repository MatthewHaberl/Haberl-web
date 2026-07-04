/**
 * SANS 10142-1:2024 Ed 3.2 — conduit capacity for single-core cables.
 *
 * Table 6.22 — max number of same-size cables per conduit diameter.
 * Table 6.23 — C values per conductor size; Table 6.24 — K values per conduit
 * diameter (mixed-size method of 6.5.6.2.2: ΣC ≤ K). Worked examples: Annex F.
 */

export const CONDUIT_DIAMETERS = [20, 25, 32, 40, 50] as const
export type ConduitDiameter = (typeof CONDUIT_DIAMETERS)[number]

/** Table 6.22: size (mm²) → max cables per conduit diameter (null = not permitted). */
export const SAME_SIZE_CAPACITY: { size: number; byDiameter: Record<number, number | null> }[] = [
  { size: 1,   byDiameter: { 20: 11, 25: 16, 32: null, 40: null, 50: null } },
  { size: 1.5, byDiameter: { 20: 9,  25: 13, 32: null, 40: null, 50: null } },
  { size: 2.5, byDiameter: { 20: 6,  25: 9,  32: 17,  40: null, 50: null } },
  { size: 4,   byDiameter: { 20: 5,  25: 7,  32: 14,  40: null, 50: null } },
  { size: 6,   byDiameter: { 20: 4,  25: 6,  32: 10,  40: 18,  50: null } },
  { size: 10,  byDiameter: { 20: 3,  25: 4,  32: 8,   40: 13,  50: null } },
  { size: 16,  byDiameter: { 20: null, 25: 3, 32: 5,  40: 9,   50: null } },
  { size: 25,  byDiameter: { 20: null, 25: 2, 32: 3,  40: 6,   50: 9 } },
  { size: 35,  byDiameter: { 20: null, 25: null, 32: 2, 40: 4, 50: 7 } },
  { size: 50,  byDiameter: { 20: null, 25: null, 32: null, 40: 3, 50: 5 } },
  { size: 70,  byDiameter: { 20: null, 25: null, 32: null, 40: 2, 50: 4 } },
]

/** Table 6.23: conductor size (mm²) → C value. */
export const C_VALUES: Record<number, number> = {
  1: 8, 1.5: 10, 2.5: 14, 4: 17, 6: 22, 10: 30, 16: 42, 25: 65, 35: 84, 50: 118, 70: 152,
}

/** Table 6.24: conduit diameter (mm) → K value (max ΣC). */
export const K_VALUES: Record<ConduitDiameter, number> = {
  20: 90, 25: 144, 32: 240, 40: 398, 50: 640,
}

export interface ConduitLine {
  size: number
  count: number
}

export interface ConduitFillResult {
  totalC: number
  /** Smallest conduit whose K ≥ ΣC, or null if even 50 mm is too small. */
  recommended: ConduitDiameter | null
  /** ΣC ÷ K per diameter, for display. */
  utilization: { diameter: ConduitDiameter; k: number; pct: number; fits: boolean }[]
}

/** Mixed-size method (6.5.6.2.2): sum C over every conductor, pick conduit with K ≥ ΣC. */
export function conduitFill(lines: ConduitLine[]): ConduitFillResult | { error: string } {
  let totalC = 0
  for (const l of lines) {
    if (l.count <= 0) continue
    const c = C_VALUES[l.size]
    if (c == null) return { error: `${l.size} mm² is not in table 6.23 (1–70 mm² single cores only)` }
    totalC += c * l.count
  }
  const utilization = CONDUIT_DIAMETERS.map((d) => ({
    diameter: d,
    k: K_VALUES[d],
    pct: (totalC / K_VALUES[d]) * 100,
    fits: totalC <= K_VALUES[d],
  }))
  const recommended = utilization.find((u) => u.fits)?.diameter ?? null
  return { totalC, recommended, utilization }
}

/** Table 6.22 lookup for a single-size bundle, if tabulated. */
export function sameSizeMax(size: number, diameter: ConduitDiameter): number | null {
  const row = SAME_SIZE_CAPACITY.find((r) => r.size === size)
  return row ? row.byDiameter[diameter] : null
}
