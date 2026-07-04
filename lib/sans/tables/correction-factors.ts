/**
 * SANS 10142-1:2024 Ed 3.2 correction factors.
 *
 * Table 6.10 — ambient temperature (30 °C base).
 * Table 6.14 — grouping of more than one circuit of single-core cable, or
 *              more than one multicore cable (applied to tables 6.1–6.6 ratings).
 */

/** Table 6.10 — ambient temperature correction, by insulation type. */
export const AMBIENT_TEMP_FACTORS: {
  tempC: number
  pvc70: number | null
  rubber85: number | null
  rubber150: number | null
}[] = [
  { tempC: 10,  pvc70: 1.22, rubber85: 1.18, rubber150: 1.0 },
  { tempC: 15,  pvc70: 1.17, rubber85: 1.14, rubber150: 1.0 },
  { tempC: 20,  pvc70: 1.12, rubber85: 1.10, rubber150: 1.0 },
  { tempC: 25,  pvc70: 1.06, rubber85: 1.05, rubber150: 1.0 },
  { tempC: 30,  pvc70: 1.0,  rubber85: 1.0,  rubber150: 1.0 },
  { tempC: 35,  pvc70: 0.94, rubber85: 0.95, rubber150: 1.0 },
  { tempC: 40,  pvc70: 0.87, rubber85: 0.90, rubber150: 1.0 },
  { tempC: 45,  pvc70: 0.79, rubber85: 0.85, rubber150: 1.0 },
  { tempC: 50,  pvc70: 0.71, rubber85: 0.80, rubber150: 1.0 },
  { tempC: 55,  pvc70: 0.61, rubber85: 0.74, rubber150: 1.0 },
  { tempC: 60,  pvc70: 0.50, rubber85: 0.67, rubber150: 1.0 },
  { tempC: 65,  pvc70: 0.35, rubber85: 0.60, rubber150: 1.0 },
  { tempC: 70,  pvc70: null, rubber85: 0.52, rubber150: 1.0 },
  { tempC: 75,  pvc70: null, rubber85: 0.43, rubber150: 1.0 },
  { tempC: 80,  pvc70: null, rubber85: 0.30, rubber150: 1.0 },
  { tempC: 85,  pvc70: null, rubber85: null, rubber150: 1.0 },
  { tempC: 90,  pvc70: null, rubber85: null, rubber150: 0.96 },
  { tempC: 95,  pvc70: null, rubber85: null, rubber150: 0.92 },
  { tempC: 100, pvc70: null, rubber85: null, rubber150: 0.88 },
  { tempC: 105, pvc70: null, rubber85: null, rubber150: 0.83 },
  { tempC: 110, pvc70: null, rubber85: null, rubber150: 0.78 },
  { tempC: 115, pvc70: null, rubber85: null, rubber150: 0.73 },
  { tempC: 120, pvc70: null, rubber85: null, rubber150: 0.68 },
  { tempC: 125, pvc70: null, rubber85: null, rubber150: 0.62 },
  { tempC: 130, pvc70: null, rubber85: null, rubber150: 0.55 },
  { tempC: 135, pvc70: null, rubber85: null, rubber150: 0.48 },
  { tempC: 140, pvc70: null, rubber85: null, rubber150: 0.39 },
  { tempC: 145, pvc70: null, rubber85: null, rubber150: 0.28 },
]

/** Table 6.14 — grouping correction, by installation scenario and circuit count. */
export interface GroupingScenario {
  id: string
  label: string
  /** factor per number of circuits/cables: keys 2..20 (sparse). */
  factors: Record<number, number>
}

export const GROUPING_SCENARIOS: GroupingScenario[] = [
  {
    id: 'enclosed_bunched',
    label: 'Enclosed (method 1/2) or bunched & clipped direct on a non-metallic surface (method 3)',
    factors: { 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.50, 10: 0.48, 12: 0.45, 14: 0.43, 16: 0.41, 18: 0.39, 20: 0.38 },
  },
  {
    id: 'single_layer_wall_touching',
    label: 'Single layer clipped to a non-metallic surface (method 3) — touching',
    factors: { 2: 0.85, 3: 0.79, 4: 0.75, 5: 0.73, 6: 0.72, 7: 0.72, 8: 0.71, 9: 0.70 },
  },
  {
    id: 'single_layer_wall_spaced',
    label: 'Single layer clipped to a non-metallic surface (method 3) — spaced ≥ 1 cable diameter',
    factors: { 2: 0.94, 3: 0.90, 4: 0.90, 5: 0.90, 6: 0.90, 7: 0.90, 8: 0.90, 9: 0.90, 10: 0.90, 12: 0.90, 14: 0.90, 16: 0.90, 18: 0.90, 20: 0.90 },
  },
  {
    id: 'tray_multicore_touching',
    label: 'Single layer, multicore, on perforated tray (method 4) — single tray, touching',
    factors: { 2: 0.86, 3: 0.81, 4: 0.77, 5: 0.75, 6: 0.74, 7: 0.73, 8: 0.73, 9: 0.72, 10: 0.71, 12: 0.70 },
  },
  {
    id: 'tray_multicore_spaced',
    label: 'Single layer, multicore, on perforated tray (method 4) — single tray, spaced',
    factors: { 2: 0.91, 3: 0.89, 4: 0.88, 5: 0.87, 6: 0.87 },
  },
  {
    id: 'tray2_multicore_touching',
    label: 'Two trays — multicore, touching',
    factors: { 2: 0.87, 3: 0.80, 4: 0.77, 5: 0.75, 6: 0.73, 7: 0.71, 8: 0.69, 9: 0.68 },
  },
  {
    id: 'tray2_multicore_spaced',
    label: 'Two trays — multicore, spaced',
    factors: { 2: 0.99, 3: 0.96, 4: 0.92, 5: 0.89, 6: 0.87 },
  },
  {
    id: 'tray3_multicore_touching',
    label: 'Three trays — multicore, touching',
    factors: { 2: 0.86, 3: 0.79, 4: 0.76, 5: 0.73, 6: 0.71, 7: 0.69, 8: 0.67, 9: 0.66 },
  },
  {
    id: 'tray3_multicore_spaced',
    label: 'Three trays — multicore, spaced',
    factors: { 2: 0.98, 3: 0.95, 4: 0.91, 5: 0.88, 6: 0.85 },
  },
  {
    id: 'tray_singlecore_hz',
    label: 'Single layer, single-core, on perforated tray, touching (method 4) — single tray, horizontal',
    factors: { 2: 0.90, 3: 0.85 },
  },
  {
    id: 'tray_singlecore_vt',
    label: 'Single layer, single-core, on perforated tray, touching (method 4) — single tray, vertical',
    factors: { 2: 0.85 },
  },
  {
    id: 'tray2_singlecore_hz',
    label: 'Two trays — single-core, touching, horizontal',
    factors: { 2: 0.87, 3: 0.81 },
  },
  {
    id: 'tray3_singlecore_hz',
    label: 'Three trays — single-core, touching, horizontal',
    factors: { 2: 0.85, 3: 0.78 },
  },
  {
    id: 'ladder_multicore',
    label: 'Single layer, multicore, touching, on ladder supports (method 6) — single rack',
    factors: { 2: 0.86, 3: 0.82, 4: 0.80, 5: 0.79, 6: 0.78, 7: 0.78, 8: 0.78, 9: 0.77 },
  },
  {
    id: 'ladder2_multicore',
    label: 'Two racks — multicore, touching, ladder supports',
    factors: { 2: 0.86, 3: 0.80, 4: 0.78, 5: 0.77, 6: 0.76, 7: 0.75, 8: 0.74, 9: 0.73 },
  },
  {
    id: 'ladder3_multicore',
    label: 'Three racks — multicore, touching, ladder supports',
    factors: { 2: 0.85, 3: 0.79, 4: 0.76, 5: 0.74, 6: 0.73, 7: 0.72, 8: 0.71, 9: 0.70 },
  },
]

/**
 * Factor for n circuits in a scenario. Between tabulated counts the next
 * HIGHER count's factor applies (conservative); n beyond the table ⇒ null
 * (— in the source: arrangement not covered).
 */
export function groupingFactor(scenario: GroupingScenario, n: number): number | null {
  if (n <= 1) return 1
  const keys = Object.keys(scenario.factors).map(Number).sort((a, b) => a - b)
  for (const k of keys) {
    if (k >= n) return scenario.factors[k]
  }
  return null
}

/** Ambient factor with conservative behaviour between tabulated steps (use the hotter step). */
export function ambientFactor(tempC: number, insulation: 'pvc70' | 'rubber85' | 'rubber150'): number | null {
  if (tempC <= AMBIENT_TEMP_FACTORS[0].tempC) return AMBIENT_TEMP_FACTORS[0][insulation]
  for (const row of AMBIENT_TEMP_FACTORS) {
    if (row.tempC >= tempC) return row[insulation]
  }
  return null
}
