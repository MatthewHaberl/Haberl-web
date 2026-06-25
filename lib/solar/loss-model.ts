// One loss model, one source of truth (W59).
//
// The system derate, decomposed into the standard PV loss buckets so a proposal
// can SHOW the assumptions (like the SAM "System Performance" panel) instead of
// a single opaque factor. The components multiply together — a real derate is
// multiplicative, not additive.
//
// This lives in its own leaf module (no imports from the solar graph) so BOTH
// the hourly generation model (generation-calculator) and the savings engine
// (energy-balance) consume the SAME efficiency without a circular import.

export interface LossComponent {
  key: string
  label: string
  /** Loss as a fraction, e.g. 0.03 = 3 %. */
  pct: number
}

export interface LossModel {
  components: LossComponent[]
  /** Combined loss, 1 − Π(1 − pct). */
  totalLossPct: number
  /** What survives: Π(1 − pct). Multiply gross DC by this for net AC. */
  systemEfficiency: number
}

// Defaults land near a ~15 % total loss (≈0.854 efficiency), in line with a
// clean modern install — consistent with NREL PVWatts' ~14 % default derate.
export const DEFAULT_LOSS_COMPONENTS: LossComponent[] = [
  { key: 'inverter', label: 'Inverter conversion', pct: 0.03 },
  { key: 'temperature', label: 'Cell temperature', pct: 0.05 },
  { key: 'wiring', label: 'DC + AC wiring', pct: 0.02 },
  { key: 'soiling', label: 'Soiling / dust', pct: 0.02 },
  { key: 'mismatch', label: 'Module mismatch', pct: 0.02 },
  { key: 'shading', label: 'Shading', pct: 0.01 },
  { key: 'availability', label: 'System availability', pct: 0.005 },
]

export function buildLossModel(components: LossComponent[] = DEFAULT_LOSS_COMPONENTS): LossModel {
  const systemEfficiency = components.reduce((eff, c) => eff * (1 - c.pct), 1)
  return {
    components,
    systemEfficiency,
    totalLossPct: 1 - systemEfficiency,
  }
}
