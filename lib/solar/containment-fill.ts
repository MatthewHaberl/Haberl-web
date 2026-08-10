// ─────────────────────────────────────────────────────────────────────────────
// Trunking / conduit fill for the design BOM (SP4).
//
// The design already records, per cable, a measured route made of segments
// ("Down wall (conduit)", "Open trunking", …). What it never knew is which
// segments share the SAME physical pipe — so nobody found out a run was
// over-full until install day, standing on the roof with a drum of cable.
//
// Give a segment a `containment` name and every segment sharing that name is
// assessed as one wireway:
//
//   • Conduit  → SANS 10142-1 6.5.6.2.2 C/K method (tables 6.23 / 6.24). Exact,
//                tabulated, no cable-diameter guessing. Also yields "smallest
//                conduit that takes this bundle", which is the number an
//                installer actually wants.
//   • Trunking → 6.5.6.3 area method: Σ(overall cable area) ≤ 45 % of the
//     / ducting  wireway area (35 % ducting, 40 % conduit). Needs an overall
//                diameter per conductor, which the catalog does not carry, so
//                this arm uses typical PVC / PV-cable dimensions and is always
//                reported as an ESTIMATE.
//
// A segment with a conduit route type but NO shared-run name is still useful:
// it gets its own implicit run so we can recommend a conduit size for that one
// cable. Those are info-only — a shared run that is over-full is the blocker.
//
// Pure module (no React, no Supabase) — same footing as design-bom.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { conduitFill, C_VALUES, type ConduitDiameter } from '../sans/tables/conduit-fill'
import type { CableEdgeData } from './sld-builder'
import { designToFlow, type SystemDesign } from './system-design'
import type { ComplianceCheck } from './compliance'

export type ContainmentKind = 'conduit' | 'trunking' | 'ducting'

/** 6.5.6.3 — max Σ(cable area) as a % of the wireway's internal area. */
export const SPACE_FACTOR: Record<ContainmentKind, number> = {
  conduit: 40,
  ducting: 35,
  trunking: 45,
}

/**
 * Typical OVERALL diameter (mm) of a single-core cable, by conductor size.
 * Used only by the 6.5.6.3 area method — the C/K conduit method never needs it.
 * PVC single-core (SANS 1507 general-purpose building wire) vs PV cable, which
 * is double-insulated and noticeably fatter for the same copper.
 */
const OVERALL_DIA_MM: Record<number, number> = {
  1: 2.8, 1.5: 3.1, 2.5: 3.7, 4: 4.3, 6: 4.9, 10: 6.2, 16: 7.3, 25: 9.1, 35: 10.3, 50: 12.0, 70: 13.8,
}
const OVERALL_DIA_PV_MM: Record<number, number> = {
  1.5: 4.6, 2.5: 5.0, 4: 5.6, 6: 6.4, 10: 7.6, 16: 8.8, 25: 10.8, 35: 12.4, 50: 14.4,
}

/** Common SA trunking / ducting sizes (internal W × H, mm). */
export const TRUNKING_SIZES: Array<{ widthMm: number; heightMm: number }> = [
  { widthMm: 25, heightMm: 16 }, { widthMm: 40, heightMm: 16 }, { widthMm: 40, heightMm: 25 },
  { widthMm: 50, heightMm: 50 }, { widthMm: 75, heightMm: 50 }, { widthMm: 100, heightMm: 50 },
  { widthMm: 100, heightMm: 100 }, { widthMm: 150, heightMm: 50 }, { widthMm: 150, heightMm: 100 },
]

/** One cable's contribution to a wireway. */
export interface ContainmentConductor {
  /** Cable label as drawn on the diagram, for the "what's in this pipe" list. */
  cableLabel: string
  sizeMm2: number
  /** Conductors this cable puts in the pipe = cores × parallel runs. */
  count: number
  /** PV (H1Z2Z2 / double-insulated) cables are fatter for the same copper. */
  pv: boolean
}

export interface ContainmentRun {
  key: string
  label: string
  kind: ContainmentKind
  /** True when the installer named a shared run; false for implicit one-cable runs. */
  shared: boolean
  /** Declared conduit bore (mm). Null = not chosen yet, we only recommend. */
  conduitMm: ConduitDiameter | null
  /** Declared trunking/ducting internal size. Null = not chosen yet. */
  widthMm: number | null
  heightMm: number | null
  /** Longest segment length seen on this run — for the BOM's containment metres. */
  lengthM: number
  conductors: ContainmentConductor[]
}

export type FillStatus = 'ok' | 'tight' | 'over' | 'unsized'

export interface ContainmentAssessment {
  run: ContainmentRun
  /** Total conductors in the pipe. */
  conductorCount: number
  // C/K method (conduit only, 6.5.6.2.2)
  totalC: number | null
  /** Smallest tabulated conduit whose K covers ΣC; null = needs splitting. */
  recommendedConduitMm: ConduitDiameter | null
  /** Reason the C/K method could not run (size outside tables 6.23). */
  ckError: string | null
  // Area method (6.5.6.3) — estimate, used for trunking/ducting
  cableAreaMm2: number
  wirewayAreaMm2: number | null
  /** Σ(cable area) ÷ wireway area, as a %. Null when no size is declared. */
  fillPct: number | null
  limitPct: number
  /** Smallest listed trunking that stays under the space factor. */
  recommendedTrunking: { widthMm: number; heightMm: number } | null
  status: FillStatus
  /** One-line plain summary for the compliance row. */
  detail: string
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Overall single-core area (mm²) for the 6.5.6.3 sum. */
function overallAreaMm2(sizeMm2: number, pv: boolean): number | null {
  const table = pv ? OVERALL_DIA_PV_MM : OVERALL_DIA_MM
  const d = table[sizeMm2] ?? OVERALL_DIA_MM[sizeMm2]
  if (d == null) return null
  return (Math.PI * d * d) / 4
}

/** Which wireway a route type describes — null when it isn't an enclosed run. */
export function kindFromRouteType(routeType: string): ContainmentKind | null {
  const t = (routeType || '').toLowerCase()
  if (t.includes('trunking')) return 'trunking'
  if (t.includes('ducting') || t.includes('duct')) return 'ducting'
  if (t.includes('conduit')) return 'conduit'
  return null
}

/** Segment shape the cable inspector writes into `layout.edgeOverrides`. */
interface RouteSegment {
  id?: string
  routeType?: string
  lengthM?: number
  /** Shared-run name — segments sharing it are one physical wireway. */
  containment?: string
  /** Declared conduit bore (mm). */
  conduitMm?: number
  /** Declared trunking/ducting internal size (mm). */
  widthMm?: number
  heightMm?: number
}

/** Cores a cable puts in the pipe — mirrors design-bom's conductorCount. */
function conductorCount(data: CableEdgeData): number {
  if (data.circuitType === 'earth') return 1
  if (data.circuitType === 'dc' || data.circuitType === 'battery') return 2
  return (data.conductors as Record<string, boolean> | undefined)?.l1 === true ? 5 : 3
}

function parseSize(cs: string | undefined): number | null {
  if (!cs) return null
  const m = cs.match(/[\d.]+/)
  if (!m) return null
  const n = parseFloat(m[0])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Walk the design's cables and group their segments into physical wireways.
 * Same edge source as designToBom, so what's priced and what's assessed agree.
 */
export function containmentRunsFromDesign(
  design: SystemDesign,
  opts: { gridSupply?: string } = {},
): ContainmentRun[] {
  const flow = designToFlow(design, { gridSupply: opts.gridSupply })
  const runs = new Map<string, ContainmentRun>()

  for (const edge of flow.edges) {
    const data = edge.data as CableEdgeData | undefined
    if (!data || data.isDirect) continue
    // Comms cable shares the pipe physically, but SANS segregation is a separate
    // question and its conductor sizes aren't in table 6.23 — leave it out.
    if (data.circuitType === 'communication') continue

    const cs = (data.crossSection as string | undefined) ?? data.spec?.match(/\d+mm²/)?.[0]
    const sizeMm2 = parseSize(cs)
    if (!sizeMm2) continue

    const material = (data.cableType as string | undefined) ?? data.spec?.split(' ')[0] ?? ''
    const pv = /h1z2z2|pv/i.test(material) || data.circuitType === 'dc'
    const cores = conductorCount(data)
    const parallelRuns = Math.max(1, Math.round(Number((data as { runs?: number }).runs) || 1))
    const cableLabel = typeof edge.label === 'string' && edge.label ? edge.label : `${material} ${cs}`.trim()

    const segments = (data.segments as RouteSegment[] | undefined) ?? []
    for (const [i, seg] of segments.entries()) {
      const kind = kindFromRouteType(seg.routeType ?? '')
      if (!kind) continue
      const named = (seg.containment ?? '').trim()
      const shared = named.length > 0
      // Unnamed conduit still earns a size recommendation — key it to the segment
      // so it never merges with another cable's pipe by accident.
      const key = shared ? `named:${kind}:${named.toLowerCase()}` : `seg:${edge.id}:${seg.id ?? i}`
      const label = shared ? named : `${cableLabel} — ${seg.routeType}`

      let run = runs.get(key)
      if (!run) {
        run = {
          key, label, kind, shared,
          conduitMm: null, widthMm: null, heightMm: null,
          lengthM: 0, conductors: [],
        }
        runs.set(key, run)
      }
      // Declared sizes: first one wins, so one segment can size the whole run.
      if (run.conduitMm == null && seg.conduitMm) {
        const d = Math.round(seg.conduitMm)
        if (d === 20 || d === 25 || d === 32 || d === 40 || d === 50) run.conduitMm = d
      }
      if (run.widthMm == null && seg.widthMm) run.widthMm = seg.widthMm
      if (run.heightMm == null && seg.heightMm) run.heightMm = seg.heightMm
      // A shared run's length is the longest segment in it, not the sum — the
      // pipe is one physical thing that several cables run through.
      run.lengthM = Math.max(run.lengthM, Number(seg.lengthM) || 0)
      run.conductors.push({ cableLabel, sizeMm2, count: cores * parallelRuns, pv })
    }
  }

  return [...runs.values()]
}

/** Assess one wireway against the SANS limits. */
export function assessContainment(run: ContainmentRun): ContainmentAssessment {
  const conductorCountTotal = run.conductors.reduce((s, c) => s + c.count, 0)

  // ── C/K method (6.5.6.2.2) — exact, conduit only ───────────────────────────
  let totalC: number | null = null
  let recommendedConduitMm: ConduitDiameter | null = null
  let ckError: string | null = null
  if (run.kind === 'conduit') {
    const untabulated = run.conductors.find((c) => C_VALUES[c.sizeMm2] == null)
    if (untabulated) {
      ckError = `${untabulated.sizeMm2} mm² is outside table 6.23 (1–70 mm²) — size this conduit by hand`
    } else {
      const result = conduitFill(run.conductors.map((c) => ({ size: c.sizeMm2, count: c.count })))
      if ('error' in result) ckError = result.error
      else { totalC = result.totalC; recommendedConduitMm = result.recommended }
    }
  }

  // ── Area method (6.5.6.3) — estimate, drives trunking/ducting ──────────────
  let cableAreaMm2 = 0
  let areaKnown = true
  for (const c of run.conductors) {
    const a = overallAreaMm2(c.sizeMm2, c.pv)
    if (a == null) { areaKnown = false; continue }
    cableAreaMm2 += a * c.count
  }
  cableAreaMm2 = round1(cableAreaMm2)
  const limitPct = SPACE_FACTOR[run.kind]

  let wirewayAreaMm2: number | null = null
  if (run.kind === 'conduit' && run.conduitMm) {
    wirewayAreaMm2 = round1((Math.PI * run.conduitMm * run.conduitMm) / 4)
  } else if (run.widthMm && run.heightMm) {
    wirewayAreaMm2 = run.widthMm * run.heightMm
  }
  const fillPct = wirewayAreaMm2 && areaKnown ? round1((cableAreaMm2 / wirewayAreaMm2) * 100) : null

  const recommendedTrunking = areaKnown && run.kind !== 'conduit'
    ? TRUNKING_SIZES.find((s) => (cableAreaMm2 / (s.widthMm * s.heightMm)) * 100 <= limitPct) ?? null
    : null

  // ── Verdict ────────────────────────────────────────────────────────────────
  let status: FillStatus
  let detail: string
  const what = `${conductorCountTotal} conductor${conductorCountTotal === 1 ? '' : 's'}`

  if (run.kind === 'conduit') {
    if (ckError) {
      status = 'unsized'
      detail = ckError
    } else if (recommendedConduitMm == null) {
      status = 'over'
      detail = `${what} (ΣC ${totalC}) exceed even 50 mm conduit (K 640) — split this run across more than one conduit`
    } else if (run.conduitMm == null) {
      status = 'unsized'
      detail = `${what} (ΣC ${totalC}) need at least ${recommendedConduitMm} mm conduit — no size chosen yet`
    } else if (run.conduitMm < recommendedConduitMm) {
      status = 'over'
      detail = `${run.conduitMm} mm conduit is too small: ΣC ${totalC} exceeds K ${
        run.conduitMm === 20 ? 90 : run.conduitMm === 25 ? 144 : run.conduitMm === 32 ? 240 : run.conduitMm === 40 ? 398 : 640
      } — go to ${recommendedConduitMm} mm or split the run`
    } else {
      const headroom = fillPct != null ? ` (~${fillPct}% of the bore by area)` : ''
      status = run.conduitMm === recommendedConduitMm ? 'tight' : 'ok'
      detail = `${what} in ${run.conduitMm} mm conduit — ΣC ${totalC} within K${headroom}`
    }
  } else {
    const label = run.kind === 'trunking' ? 'trunking' : 'ducting'
    if (!areaKnown) {
      status = 'unsized'
      detail = `${what}: a cable size here has no typical overall diameter — size this ${label} by hand`
    } else if (wirewayAreaMm2 == null) {
      status = 'unsized'
      detail = recommendedTrunking
        ? `${what} ≈ ${cableAreaMm2} mm² of cable — needs at least ${recommendedTrunking.widthMm}×${recommendedTrunking.heightMm} mm ${label} at ${limitPct}%; no size chosen yet`
        : `${what} ≈ ${cableAreaMm2} mm² of cable — larger than any listed ${label} at ${limitPct}%; split the run`
    } else if (fillPct != null && fillPct > limitPct) {
      status = 'over'
      detail = `${run.widthMm}×${run.heightMm} mm ${label} is ~${fillPct}% full — over the ${limitPct}% space factor${
        recommendedTrunking ? `; ${recommendedTrunking.widthMm}×${recommendedTrunking.heightMm} mm clears it` : '; split the run'
      }`
    } else {
      status = fillPct != null && fillPct > limitPct * 0.9 ? 'tight' : 'ok'
      detail = `${what} ≈ ${cableAreaMm2} mm² in ${run.widthMm}×${run.heightMm} mm ${label} — ~${fillPct}% full (limit ${limitPct}%)`
    }
  }

  return {
    run, conductorCount: conductorCountTotal,
    totalC, recommendedConduitMm, ckError,
    cableAreaMm2, wirewayAreaMm2, fillPct, limitPct, recommendedTrunking,
    status, detail,
  }
}

export function assessDesignContainment(
  design: SystemDesign,
  opts: { gridSupply?: string } = {},
): ContainmentAssessment[] {
  return containmentRunsFromDesign(design, opts).map(assessContainment)
}

/**
 * Compliance rows for the BOM panel + the generated quote.
 *
 * A named shared run that is over-full is a BLOCKER — that is the install-day
 * failure this whole feature exists to catch. An unnamed single-cable conduit
 * only ever produces an info row telling you the minimum bore, because nobody
 * asserted a size for it to be wrong about.
 */
export function containmentChecks(assessments: ContainmentAssessment[]): ComplianceCheck[] {
  const out: ComplianceCheck[] = []
  for (const a of assessments) {
    const ref = a.run.kind === 'conduit' ? '6.5.6.2.2' : '6.5.6.3'
    const status: ComplianceCheck['status'] =
      a.status === 'over' ? (a.run.shared ? 'blocker' : 'warning')
      : a.status === 'unsized' ? 'info'
      : a.status === 'tight' ? 'warning'
      : 'pass'
    out.push({
      id: `containment:${a.run.key}`,
      title: `${a.run.kind === 'conduit' ? 'Conduit' : a.run.kind === 'trunking' ? 'Trunking' : 'Ducting'} fill — ${a.run.label}`,
      reference: `SANS 10142-1 ${ref}`,
      status,
      detail: a.run.kind === 'conduit' ? a.detail : `${a.detail}. Estimated from typical overall cable diameters — confirm against the cable's datasheet.`,
    })
  }
  // Loudest first, so the collapsed chip counts what matters.
  const rank: Record<ComplianceCheck['status'], number> = { blocker: 0, warning: 1, info: 2, pass: 3 }
  return out.sort((x, y) => rank[x.status] - rank[y.status])
}
