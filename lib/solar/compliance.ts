// SANS 10142-1 / physics compliance engine for the deterministic quote calculator.
//
// Two jobs:
//  1. computeStringLayout — derive the PV string design from panel electrical specs
//     and the inverter's sizing spec (notes JSON), applying real temperature physics.
//  2. runComplianceChecks — verify the FINAL BOM against SANS 10142-1 + the Haberl
//     design rules (haberl-solar/docs/design-rules.md). The calculator adds the
//     required items itself; this engine is the independent verifier, so anything
//     that drops out of the BOM (or gets added manually, e.g. armoured cable) is
//     caught with a clause reference.
//
// References use SANS 10142-1:2024 Ed 3.2 clause numbers and RULE-* ids from
// docs/design-rules.md.

import type { SupplierBomItem } from './render-quote'
import type { EquipmentCatalogItem, InverterSizingSpec } from './quote-calculator'

// ── Physics constants ─────────────────────────────────────────────────────────
// Voc rises as temperature falls. Gauteng design minimum ≈ -10 °C; typical
// crystalline βVoc ≈ -0.28 %/°C → (25 - (-10)) × 0.28 % ≈ +10 %.
export const VOC_COLD_FACTOR = 1.10
// Edge-of-cloud (cloud-edge irradiance overshoot): reflected light off the edge
// of a passing cloud briefly drives irradiance — and string Voc — above STC.
// Haberl design rule: the cold-weather string Voc, lifted a further 20 % for
// this transient, must still sit under the inverter's max DC input. So a string
// is only "safe" when  panels × Voc × VOC_COLD_FACTOR × EDGE_OF_CLOUD_FACTOR ≤ Vmax.
export const EDGE_OF_CLOUD_FACTOR = 1.20
// Vmp ≈ 0.82 × Voc for crystalline modules; at ~65 °C cell temperature Vmp
// derates a further ~14 %. Used for the MPPT minimum-voltage check.
export const VMP_FROM_VOC = 0.82
export const VMP_HOT_DERATE = 0.86
// Imp ≈ 0.93 × Isc for crystalline modules (used for voltage drop).
export const IMP_FROM_ISC = 0.93
// Copper resistivity 0.0183 Ω·mm²/m
const COPPER_RESISTIVITY = 0.0183
// SANS 10142-1 §5.3.2 — keep feeder voltage drop inside 3 % on the PV DC run.
export const MAX_DC_VOLTAGE_DROP_PCT = 3
// Without an inverter voltage spec we cap series panels at a conservative count.
const DEFAULT_MAX_SERIES_PANELS = 10

export type ComplianceStatus = 'pass' | 'info' | 'warning' | 'blocker'

export interface ComplianceCheck {
  id: string
  title: string
  reference: string
  status: ComplianceStatus
  detail: string
}

export interface StringLayout {
  stringCount: number
  /** Longest string — drives the cold-Voc (max-voltage) check. */
  panelsPerString: number
  /** Shortest string — drives the MPPT-minimum (low-voltage) check. Equals
   *  panelsPerString when the panels divide evenly across the strings. */
  panelsPerStringMin: number
  /** false when panelCount can't split into equal-length strings. */
  evenStrings: boolean
  parallelStringsPerMppt: number
  maxSeriesAllowed: number | null
  /** Cold-weather Voc of the longest string (display value). */
  stringVocColdV: number | null
  /** Cold Voc lifted by the edge-of-cloud margin — the value checked against
   *  the inverter's max DC input. */
  stringVocDesignV: number | null
  /** Hot-weather Vmp of the shortest string — checked against the MPPT minimum. */
  stringVmpHotV: number | null
  /** true when derived from defaults because the inverter notes lack voltage specs */
  assumed: boolean
}

// ── String layout ─────────────────────────────────────────────────────────────

export function computeStringLayout(opts: {
  panelCount: number
  panel: EquipmentCatalogItem
  spec: InverterSizingSpec | null
}): StringLayout {
  const { panelCount, panel, spec } = opts
  const voc = panel.voc_volts ?? null

  // Max panels in series limited by inverter max DC voltage at the coldest Voc,
  // INCLUDING the edge-of-cloud overshoot margin — that combined headroom is the
  // real ceiling, not just the −10 °C cold rise.
  let maxSeriesAllowed: number | null = null
  if (spec?.maxDcVoltage && voc) {
    maxSeriesAllowed = Math.max(1, Math.floor(spec.maxDcVoltage / (voc * VOC_COLD_FACTOR * EDGE_OF_CLOUD_FACTOR)))
  }
  if (spec?.seriesPanelsPerString) {
    maxSeriesAllowed = Math.floor(spec.seriesPanelsPerString)
  } else if (spec?.seriesMax) {
    maxSeriesAllowed = maxSeriesAllowed
      ? Math.min(maxSeriesAllowed, Math.floor(spec.seriesMax))
      : Math.floor(spec.seriesMax)
  }

  const assumed = maxSeriesAllowed == null
  const seriesCap = maxSeriesAllowed ?? DEFAULT_MAX_SERIES_PANELS

  const stringCount = Math.max(1, spec?.maxStrings
    ? Math.min(Math.ceil(panelCount / seriesCap), Math.floor(spec.maxStrings))
      || Math.ceil(panelCount / seriesCap)
    : Math.ceil(panelCount / seriesCap))

  // Distribute the panels as evenly as the count allows. When they don't divide
  // evenly, `remainder` strings carry one extra panel: the longest string sets
  // the cold-Voc ceiling, the shortest sets the MPPT-minimum floor.
  const base = Math.floor(panelCount / stringCount)
  const remainder = panelCount % stringCount
  const panelsPerString = Math.max(1, remainder > 0 ? base + 1 : base)
  const panelsPerStringMin = Math.max(1, base)
  const evenStrings = remainder === 0

  const mpptCount = spec?.mpptCount ?? null
  const parallelStringsPerMppt = spec?.parallelStringsPerMppt
    ? Math.floor(spec.parallelStringsPerMppt)
    : mpptCount
      ? Math.max(1, Math.ceil(stringCount / mpptCount))
      : 1

  const stringVocColdV = voc ? Math.round(panelsPerString * voc * VOC_COLD_FACTOR * 10) / 10 : null

  return {
    stringCount,
    panelsPerString,
    panelsPerStringMin,
    evenStrings,
    parallelStringsPerMppt: Math.max(1, parallelStringsPerMppt),
    maxSeriesAllowed,
    stringVocColdV,
    stringVocDesignV: stringVocColdV != null ? Math.round(stringVocColdV * EDGE_OF_CLOUD_FACTOR * 10) / 10 : null,
    stringVmpHotV: voc ? Math.round(panelsPerStringMin * voc * VMP_FROM_VOC * VMP_HOT_DERATE * 10) / 10 : null,
    assumed,
  }
}

// DC string voltage drop in percent for a given one-way route length and cable size
export function estimateDcVoltageDropPct(opts: {
  routeMetres: number
  iscAmps: number
  panelsPerString: number
  vocVolts: number
  cableSizeMm2?: number
}) {
  const { routeMetres, iscAmps, panelsPerString, vocVolts } = opts
  const cableSize = opts.cableSizeMm2 ?? 4
  const imp = iscAmps * IMP_FROM_ISC
  const stringVmp = panelsPerString * vocVolts * VMP_FROM_VOC
  if (stringVmp <= 0) return null
  const resistancePerMetre = COPPER_RESISTIVITY / cableSize
  const dropVolts = 2 * routeMetres * imp * resistancePerMetre
  return Math.round((dropVolts / stringVmp) * 1000) / 10
}

// ── BOM verification ──────────────────────────────────────────────────────────

// Battery voltage class from catalog notes JSON, with description fallback
// (51.2/52V nameplate → LV; ≥90V → HV).
export function parseBatteryClass(battery: Pick<EquipmentCatalogItem, 'notes' | 'description'>): 'LV' | 'HV' | 'PROPRIETARY' | null {
  if (battery.notes) {
    try {
      const parsed = JSON.parse(battery.notes) as Record<string, unknown>
      const cls = typeof parsed.battery_class === 'string' ? parsed.battery_class.toUpperCase() : null
      if (cls === 'LV' || cls === 'HV' || cls === 'PROPRIETARY') return cls
      const voltage = Number(parsed.voltage)
      if (Number.isFinite(voltage) && voltage > 0) return voltage < 90 ? 'LV' : 'HV'
    } catch { /* fall through to description */ }
  }
  const description = battery.description.toLowerCase()
  if (/\b5[12](\.\d+)?\s*v\b/.test(description) || /\b48\s*v\b/.test(description)) return 'LV'
  const voltsMatch = description.match(/(\d{2,3}(?:\.\d+)?)\s*v\b/)
  if (voltsMatch) return Number(voltsMatch[1]) < 90 ? 'LV' : 'HV'
  return null
}

export interface ComplianceContext {
  bom: SupplierBomItem[]
  layout: StringLayout
  spec: InverterSizingSpec | null
  panel: EquipmentCatalogItem
  inverter: EquipmentCatalogItem
  battery: EquipmentCatalogItem
  inverterCount: number
  batteryCount: number
  panelCount: number
  evChargerKw: string
  routeMetres: number
  gridSupply: string
}

function bomLines(bom: SupplierBomItem[], pattern: RegExp) {
  return bom.filter((item) => pattern.test(item.description) || pattern.test(item.sku))
}

function bomQty(bom: SupplierBomItem[], pattern: RegExp) {
  return bomLines(bom, pattern).reduce((sum, item) => sum + item.quantity, 0)
}

export function runComplianceChecks(ctx: ComplianceContext): ComplianceCheck[] {
  const { bom, layout, spec, panel, battery, inverterCount, evChargerKw, routeMetres } = ctx
  const checks: ComplianceCheck[] = []

  const add = (id: string, title: string, reference: string, status: ComplianceStatus, detail: string) =>
    checks.push({ id, title, reference, status, detail })

  // ── DC side (SANS 10142-1 §7.12.4) ──────────────────────────────────────────
  const dcBreakerQty = bomQty(bom, /pv dc breaker|dc breaker/i)
  if (dcBreakerQty === 0) {
    add('dc-isolation', 'PV DC isolation', 'SANS 10142-1 §7.12.4', 'blocker',
      'No DC breaker/isolator between PV array and inverter. SANS requires DC isolation on every string — even single strings.')
  } else if (dcBreakerQty < layout.stringCount) {
    add('dc-isolation', 'PV DC isolation', 'SANS 10142-1 §7.12.4', 'warning',
      `${dcBreakerQty} DC breaker(s) for ${layout.stringCount} string(s). Each string needs its own protective device.`)
  } else {
    add('dc-isolation', 'PV DC isolation', 'SANS 10142-1 §7.12.4', 'pass',
      `${dcBreakerQty} DC breaker(s) covering ${layout.stringCount} string(s).`)
  }

  if (bomQty(bom, /pv surge|dc.*spd/i) === 0) {
    add('dc-spd', 'DC surge protection', 'SANS 10142-1 §6.7.6 / §7.12.4', 'blocker',
      'DC SPD missing — surge protection on the PV DC side is mandatory.')
  } else {
    add('dc-spd', 'DC surge protection', 'SANS 10142-1 §6.7.6 / §7.12.4', 'pass',
      'DC SPD on combiner output.')
  }

  // String fuses only when parallel strings share an MPPT (gPV both poles)
  if (layout.parallelStringsPerMppt > 1) {
    if (bomQty(bom, /string fuse|gpv fuse|pv fuse/i) === 0) {
      add('string-fuses', 'PV string fuses', 'IEC 62548 / design rule (feedback 2026-06-01)', 'blocker',
        `${layout.parallelStringsPerMppt} strings share an MPPT — each paralleled string requires series gPV fuses (both poles).`)
    } else {
      add('string-fuses', 'PV string fuses', 'IEC 62548', 'pass',
        'Paralleled strings are individually fused.')
    }
  } else {
    add('string-fuses', 'PV string fuses', 'IEC 62548', 'pass',
      'One string per MPPT — no string fuse required, breaker + SPD still fitted.')
  }

  // ── String voltage physics ──────────────────────────────────────────────────
  if (layout.stringVocDesignV != null && layout.stringVocColdV != null && spec?.maxDcVoltage) {
    if (layout.stringVocDesignV > spec.maxDcVoltage) {
      add('string-voc', 'String voltage vs inverter max DC input', 'Physics / RULE-STR-02', 'blocker',
        `Cold-weather string Voc ≈ ${layout.stringVocColdV}V (${layout.panelsPerString} × ${panel.voc_volts}V × ${VOC_COLD_FACTOR}) rises to ≈ ${layout.stringVocDesignV}V with the ×${EDGE_OF_CLOUD_FACTOR} edge-of-cloud margin — over the inverter's ${spec.maxDcVoltage}V max input. Shorten the string.`)
    } else {
      add('string-voc', 'String voltage vs inverter max DC input', 'Physics / RULE-STR-02', 'pass',
        `Cold-weather string Voc ≈ ${layout.stringVocColdV}V (≈ ${layout.stringVocDesignV}V with the edge-of-cloud margin) is within the inverter's ${spec.maxDcVoltage}V limit.`)
    }
  } else {
    add('string-voc', 'String voltage vs inverter max DC input', 'RULE-STR-02', 'info',
      layout.stringVocColdV == null
        ? `Panel Voc missing from the catalog — add voc_volts to ${panel.description} to enable string voltage validation.`
        : `Inverter max DC voltage not in catalog notes — add "max_dc_voltage: 500" style spec to ${ctx.inverter.description} to enable string voltage validation. Assumed max ${DEFAULT_MAX_SERIES_PANELS} panels per string.`)
  }

  if (layout.stringVmpHotV != null && spec?.mpptMinVoltage) {
    const shortest = layout.evenStrings ? '' : ` (shortest string, ${layout.panelsPerStringMin} panels)`
    if (layout.stringVmpHotV < spec.mpptMinVoltage) {
      add('mppt-min', 'String voltage vs MPPT minimum', 'Physics / RULE-STR-02', 'warning',
        `Hot-weather string Vmp ≈ ${layout.stringVmpHotV}V${shortest} falls below the MPPT minimum of ${spec.mpptMinVoltage}V — the inverter may stop tracking on hot days. Lengthen the string.`)
    } else {
      add('mppt-min', 'String voltage vs MPPT minimum', 'Physics / RULE-STR-02', 'pass',
        `Hot-weather string Vmp ≈ ${layout.stringVmpHotV}V${shortest} stays above the ${spec.mpptMinVoltage}V MPPT minimum.`)
    }
  }

  // ── Voltage drop (§5.3.2) ───────────────────────────────────────────────────
  if (panel.isc_amps && panel.voc_volts) {
    const dropPct = estimateDcVoltageDropPct({
      routeMetres,
      iscAmps: panel.isc_amps,
      panelsPerString: layout.panelsPerString,
      vocVolts: panel.voc_volts,
    })
    if (dropPct != null) {
      if (dropPct > MAX_DC_VOLTAGE_DROP_PCT) {
        const dropAt6 = estimateDcVoltageDropPct({
          routeMetres, iscAmps: panel.isc_amps, panelsPerString: layout.panelsPerString,
          vocVolts: panel.voc_volts, cableSizeMm2: 6,
        })
        add('dc-voltage-drop', 'DC cable voltage drop', 'SANS 10142-1 §5.3.2', 'warning',
          `≈ ${dropPct}% drop on 4mm² over ${routeMetres}m (limit ${MAX_DC_VOLTAGE_DROP_PCT}%). Upgrade the run to 6mm² (≈ ${dropAt6}%).`)
      } else {
        add('dc-voltage-drop', 'DC cable voltage drop', 'SANS 10142-1 §5.3.2', 'pass',
          `≈ ${dropPct}% drop on 4mm² over ${routeMetres}m — within the ${MAX_DC_VOLTAGE_DROP_PCT}% limit.`)
      }
    }
  }

  // ── AC side ─────────────────────────────────────────────────────────────────
  add('ac-isolation', 'AC isolation / changeover', 'SANS 10142-1 §7.12.4 / RULE-AC-01',
    bomQty(bom, /changeover|ac isolator/i) > 0 ? 'pass' : 'blocker',
    bomQty(bom, /changeover|ac isolator/i) > 0
      ? 'Grid/inverter changeover switch included.'
      : 'No AC changeover/isolator between inverter output and grid connection point.')

  add('ac-spd', 'AC surge protection (Type 2)', 'SANS 10142-1 §6.7.6 / RULE-AC-04',
    bomQty(bom, /ac spd|spd type 2/i) > 0 ? 'pass' : 'blocker',
    bomQty(bom, /ac spd|spd type 2/i) > 0
      ? 'Type 2 AC SPD included.'
      : 'AC SPD missing — mandatory on every install.')

  add('essential-db', 'Essential loads DB', 'SANS 10142-1 §6.6 / RULE-AC-02',
    bomQty(bom, /way db|essential.*db/i) > 0 ? 'pass' : 'warning',
    bomQty(bom, /way db|essential.*db/i) > 0
      ? 'Essential loads DB included (12-way default).'
      : 'No essential loads DB on the BOM.')

  add('terminal-bars', 'DB terminal + earth bars', 'RULE-AC-03',
    bomQty(bom, /terminal bar/i) > 0 && bomQty(bom, /earth bar/i) > 0 ? 'pass' : 'warning',
    'Every essential-loads DB needs black + blue terminal bars and a green earth bar.')

  // ── Earthing (§6.12 / SANS 10292) ───────────────────────────────────────────
  const spikes = bomQty(bom, /earth rod(?!.*(tip|coupling|clamp))/i)
  const muti = bomQty(bom, /earthmuti/i)
  if (spikes === 0) {
    add('earthing', 'Earth electrode system', 'SANS 10142-1 §6.12 / SANS 10292', 'blocker',
      'No earth rods on the BOM.')
  } else if (muti < spikes) {
    add('earthing', 'Earth electrode system', 'RULE-ETH-02', 'warning',
      `${spikes} earth rod(s) but only ${muti} Earthmuti — Gauteng soils need one per spike.`)
  } else {
    add('earthing', 'Earth electrode system', 'SANS 10142-1 §6.12 / SANS 10292', 'pass',
      `${spikes} earth rod(s) with Earthmuti and bare copper bond run to the main DB.`)
  }
  add('earthing-site', 'Spike count site verification', 'RULE-ETH-01', 'info',
    'Final spike count is confirmed on site by soil resistivity test — quote carries the standard disclaimer.')

  // ── Battery ↔ inverter voltage class (RULE-INV-06) ─────────────────────────
  // LV (48/52V) batteries only on LV inverters; HV stacks only on HV inverters.
  // Mixing destroys equipment. PROPRIETARY (Sigenergy) is brand-locked upstream.
  if (battery.kwh) {
    const batteryClass = parseBatteryClass(battery)
    const inverterClass = spec?.batteryClass ?? null
    if (inverterClass === 'PROPRIETARY' || batteryClass === 'PROPRIETARY') {
      add('battery-class', 'Battery ↔ inverter voltage class', 'RULE-INV-06 / datasheet', 'pass',
        'Proprietary stack system — brand compatibility enforced by the equipment selector.')
    } else if (inverterClass && batteryClass) {
      if (inverterClass === batteryClass) {
        add('battery-class', 'Battery ↔ inverter voltage class', 'RULE-INV-06 / datasheet', 'pass',
          `${batteryClass} battery on ${inverterClass} inverter${spec?.batteryVoltageRange ? ` (inverter window ${spec.batteryVoltageRange}V)` : ''}.`)
      } else {
        add('battery-class', 'Battery ↔ inverter voltage class', 'RULE-INV-06 / datasheet', 'blocker',
          `${batteryClass} battery paired with ${inverterClass}-battery inverter — never mix voltage classes. ${battery.description} cannot connect to ${ctx.inverter.description}.`)
      }
    } else {
      add('battery-class', 'Battery ↔ inverter voltage class', 'RULE-INV-06', 'info',
        'Voltage class missing on inverter or battery catalog notes — add battery_class to enable this check.')
    }
  }

  // ── Panel Isc vs MPPT input rating (datasheet physics) ──────────────────────
  if (panel.isc_amps && spec?.maxIscPerMpptA) {
    const perStringIsc = panel.isc_amps * layout.parallelStringsPerMppt
    if (perStringIsc > spec.maxIscPerMpptA) {
      add('mppt-isc', 'String current vs MPPT rating', 'Datasheet / IEC 62548', 'warning',
        `≈ ${perStringIsc.toFixed(1)}A short-circuit current into one MPPT exceeds the inverter's ${spec.maxIscPerMpptA}A rating — reduce parallel strings or pick a lower-current panel.`)
    } else {
      add('mppt-isc', 'String current vs MPPT rating', 'Datasheet', 'pass',
        `${perStringIsc.toFixed(1)}A per MPPT within the ${spec.maxIscPerMpptA}A input rating.`)
    }
  }

  // ── Battery ancillaries (RULE-INV-02/04, §7.12.4) ──────────────────────────
  if (battery.kwh) {
    add('battery-comms', 'Battery BMS comms cable', 'RULE-INV-02',
      bomQty(bom, /comms|communication/i) > 0 ? 'pass' : 'blocker',
      bomQty(bom, /comms|communication/i) > 0
        ? 'BMS-to-inverter comms cable included.'
        : 'Battery comms cable missing — without it the BMS cannot talk to the inverter and the battery will not charge correctly.')

    add('battery-fuse', 'Battery DC fuse / disconnect', 'SANS 10142-1 §7.12.4 / RULE-INV-04',
      bomQty(bom, /fuse|disconnect/i) > 0 ? 'pass' : 'blocker',
      bomQty(bom, /fuse|disconnect/i) > 0
        ? 'DC fuse/disconnect between battery and inverter included.'
        : 'No DC protection between battery and inverter — short-circuit protection is mandatory.')
  }

  const gatewayQty = bomQty(bom, /gateway|monitoring(?!.*signal)/i)
  add('monitoring', 'Monitoring device per inverter', 'RULE-INV-01',
    gatewayQty >= inverterCount ? 'pass' : 'warning',
    gatewayQty >= inverterCount
      ? `${gatewayQty} monitoring/gateway device(s) for ${inverterCount} inverter(s).`
      : `${gatewayQty} monitoring device(s) for ${inverterCount} inverter(s) — one per inverter is required unless the inverter ships with a built-in dongle (e.g. Sunsynk) or the gateway is an explicit multi-inverter model.`)

  // ── Companion rule: armoured cable → SWA glands (§6.3.7 / §6.13) ────────────
  const armouredLines = bomLines(bom, /swa|armou?red/i).filter((item) => !/gland/i.test(item.description))
  if (armouredLines.length > 0) {
    const swaGlandQty = bomQty(bom, /swa gland|compression gland/i)
    const requiredGlands = armouredLines.length * 2
    if (swaGlandQty < requiredGlands) {
      add('armoured-glands', 'SWA compression glands on armoured runs', 'SANS 10142-1 §6.3.7 / §6.13', 'blocker',
        `${armouredLines.length} armoured cable run(s) need ${requiredGlands} SWA compression glands (both ends, armour bonded to earth) — only ${swaGlandQty} on the BOM. A nylon gland is not acceptable on armoured cable.`)
    } else {
      add('armoured-glands', 'SWA compression glands on armoured runs', 'SANS 10142-1 §6.3.7 / §6.13', 'pass',
        `${swaGlandQty} SWA compression gland(s) for ${armouredLines.length} armoured run(s) — armour earthed at the gland.`)
    }
  }

  add('db-glands', 'Cable glands at DB entries', 'RULE-CON-04',
    bomQty(bom, /gland/i) >= 2 ? 'pass' : 'warning',
    bomQty(bom, /gland/i) >= 2
      ? 'Glands included for DB entry/exit — IP rating preserved.'
      : 'Fewer than 2 glands on the BOM — every DB entry/exit must be glanded or the IP rating is void.')

  // ── EV charger (§6.16.8 / §6.7.5 / RULE-EV-01 — BLOCKER class) ──────────────
  if (evChargerKw) {
    const evChecks: Array<[string, RegExp, string]> = [
      ['ev-type-b', /type b/i, 'Type B earth-leakage device (DC-sensitive RCD) — legal requirement for EV charging circuits'],
      ['ev-db', /ev.*(input )?db|input db/i, 'Dedicated EV input DB'],
      ['ev-spd', /ev.*spd|ev.*surge/i, 'Surge protection on the EV circuit'],
      ['ev-labels', /label/i, 'EV circuit warning labels'],
    ]
    for (const [id, pattern, label] of evChecks) {
      add(id, label, 'SANS 10142-1 §6.16.8 / §6.7.5 / RULE-EV-01',
        bomQty(bom, pattern) > 0 ? 'pass' : 'blocker',
        bomQty(bom, pattern) > 0 ? 'Included.' : `${label} is missing — the EV section may not be quoted without it.`)
    }
  }

  // ── Compliance paperwork + site reminders ───────────────────────────────────
  add('coc', 'Certificate of Compliance', 'SANS 10142-1 §8.7 / RULE-CON-08',
    bomQty(bom, /certificate of compliance|^coc$/i) > 0 ? 'pass' : 'blocker',
    bomQty(bom, /certificate of compliance|^coc$/i) > 0
      ? 'COC line included (fixed R1,500).'
      : 'COC missing — legally required on every installation.')

  add('ne-bonding', 'Neutral-earth bonding in backup mode', 'SANS 10142-1 §7.12.3', 'info',
    'Verify the N-E bonding arrangement covers backup mode at commissioning — earth leakage must function in grid AND backup mode. Common CoC failure point.')

  add('sseg', 'SSEG registration (grid-tied)', 'SANS 10142-1 §7.12.7 / NRS 097-2-1', 'info',
    'Grid-tied embedded generation requires SSEG approval from the municipality/Eskom before connection.')

  return checks
}
