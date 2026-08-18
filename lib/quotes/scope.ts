// ─────────────────────────────────────────────────────────────────────────────
// Quote scope — the persisted model behind the 'scope' engine (W97).
//
// A QuoteScope is what the scope builder edits and autosaves to
// quote_requests.scope (jsonb). scopeToBom() (scope-bom.ts) turns it into the
// same DesignBom shape the solar canvas emits, which is what keeps the whole
// downstream stack (generate → send → accept → job → PO → finance) shared.
//
// Pure module — no Supabase, no React; safe on server and client. Same
// discipline as lib/solar/design-quote.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type ScopeLineKind = 'material' | 'labour' | 'fee'
export type ScopeLineUnit = 'ea' | 'm' | 'hr' | 'job'

export interface ScopeLine {
  id: string
  /** Section this line renders under — free text, ordered by scope.sections. */
  section: string
  kind: ScopeLineKind
  /** equipment_catalog id, or null for a free-text line. */
  catalogId: string | null
  sku: string
  description: string
  qty: number
  unit: ScopeLineUnit
  /** Last-known unit cost (rands). Authoritative cost is re-read from the catalog at generate time. */
  unitCostR: number
  /** Sell price per unit. Derived cost × markup unless sellOverridden. */
  unitSellR: number
  sellOverridden: boolean
  /** Optional extra — listed on the quote but excluded from the total. */
  optional: boolean
  note: string | null
}

/**
 * One person (or generic role) priced onto the quote's labour.
 *
 * INTERNAL ONLY. The crew list is how Matthew works out what the job's labour
 * costs him and what it should sell for; the customer never sees a name, an
 * hour or a rate — scopeToBom collapses the whole list into a single "Labour"
 * line carrying only the total. That collapse is the feature, not a detail:
 * showing a customer that a R900 labour line is one person at R150/hr invites
 * a negotiation about wages instead of about the job.
 */
export interface ScopeCrewLine {
  id: string
  /** staff.id, or null for a generic role priced by hand. */
  staffId: string | null
  /** Snapshot of the person/role name at the time they were added. */
  name: string
  /** Hours, days or units — read against `unit`. */
  qty: number
  unit: 'hr' | 'day' | 'job'
  /** What this person costs the business per unit. */
  costR: number
  /** Sell = cost × markup, unless sellR overrides it. */
  markup: number
  /** Manual sell price per unit; null follows cost × markup. */
  sellR: number | null
}

export interface ScopeLabour {
  /**
   * 'crew' prices labour from the `crew` list (per person); the other three
   * price it as one lump. All four render to the customer identically.
   */
  mode: 'hourly' | 'daily' | 'fixed' | 'crew'
  /** Call-out fee (hourly mode only). Doubles as the one-hour minimum. */
  calloutR: number
  hours: number
  /** R/hr — seeded from company_settings.labour_hourly_rate_rands. */
  rateR: number
  /** Days on site (daily mode only). Half-days allowed. */
  days: number
  /** R/day for the standard team — seeded from company_settings.labour_day_rate_rands. */
  dayRateR: number
  /** Fixed-price amount (fixed mode only). */
  fixedR: number
  /** Priced crew (crew mode only) — internal; never rendered to a customer. */
  crew: ScopeCrewLine[]
  description: string
}

export interface QuoteScope {
  version: 1
  /** Customer-facing scope-of-works narrative. */
  summary: string
  /** "What's not included" — kills most disputes. */
  exclusions: string[]
  /** Section display order, seeded from work_types.default_sections. */
  sections: string[]
  lines: ScopeLine[]
  labour: ScopeLabour
  coc: { included: boolean; feeR: number }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Finite, non-negative number or the fallback — same guard as mapSettingsToPricing. */
function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export function newScopeLineId(): string {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  if (c?.randomUUID) return c.randomUUID()
  return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface EmptyScopeOpts {
  sections?: string[]
  labourRateR?: number
  dayRateR?: number
  calloutR?: number
  cocFeeR?: number
}

export function emptyScope(opts: EmptyScopeOpts = {}): QuoteScope {
  return {
    version: 1,
    summary: '',
    exclusions: [],
    sections: [...(opts.sections ?? [])],
    lines: [],
    labour: {
      mode: 'hourly',
      calloutR: num(opts.calloutR, 750),
      hours: 0,
      rateR: num(opts.labourRateR, 750),
      days: 0,
      dayRateR: num(opts.dayRateR, 5500),
      fixedR: 0,
      crew: [],
      description: '',
    },
    coc: { included: false, feeR: num(opts.cocFeeR, 1500) },
  }
}

export function newScopeLine(section: string, kind: ScopeLineKind = 'material'): ScopeLine {
  return {
    id: newScopeLineId(),
    section,
    kind,
    catalogId: null,
    sku: '',
    description: '',
    qty: 1,
    unit: kind === 'labour' ? 'hr' : 'ea',
    unitCostR: 0,
    unitSellR: 0,
    sellOverridden: false,
    optional: false,
    note: null,
  }
}

const KINDS: ScopeLineKind[] = ['material', 'labour', 'fee']
const UNITS: ScopeLineUnit[] = ['ea', 'm', 'hr', 'job']

function parseLine(raw: unknown): ScopeLine | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const kind = KINDS.includes(r.kind as ScopeLineKind) ? (r.kind as ScopeLineKind) : 'material'
  return {
    id: str(r.id) || newScopeLineId(),
    // A blank section would be invisible in the editor yet still billed —
    // give it the same fallback home scopeToBom uses.
    section: str(r.section) || 'Scope of work',
    kind,
    catalogId: typeof r.catalogId === 'string' && r.catalogId ? r.catalogId : null,
    sku: str(r.sku),
    description: str(r.description),
    qty: num(r.qty, 0),
    unit: UNITS.includes(r.unit as ScopeLineUnit) ? (r.unit as ScopeLineUnit) : 'ea',
    unitCostR: num(r.unitCostR, 0),
    unitSellR: num(r.unitSellR, 0),
    sellOverridden: r.sellOverridden === true,
    optional: r.optional === true,
    note: typeof r.note === 'string' && r.note ? r.note : null,
  }
}

/**
 * Tolerant parse of quote_requests.scope — accepts the jsonb object or a JSON
 * string, merges onto emptyScope() defaults, sanitises every line. Returns null
 * for anything that isn't a scope-shaped object (same contract as parseDesign).
 */
export function parseScope(raw: unknown): QuoteScope | null {
  let obj = raw
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return null }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const r = obj as Record<string, unknown>
  const base = emptyScope()

  const labourRaw = (r.labour && typeof r.labour === 'object' ? r.labour : {}) as Record<string, unknown>
  const cocRaw = (r.coc && typeof r.coc === 'object' ? r.coc : {}) as Record<string, unknown>

  return {
    version: 1,
    summary: str(r.summary),
    exclusions: Array.isArray(r.exclusions) ? r.exclusions.filter((e): e is string => typeof e === 'string') : [],
    // Deduped: a repeated name would render (and bill) the same lines twice.
    sections: Array.isArray(r.sections)
      ? [...new Set(r.sections.filter((s): s is string => typeof s === 'string' && s.length > 0))]
      : [],
    lines: Array.isArray(r.lines) ? r.lines.map(parseLine).filter((l): l is ScopeLine => l !== null) : [],
    labour: {
      mode:
        labourRaw.mode === 'fixed' || labourRaw.mode === 'daily' || labourRaw.mode === 'crew'
          ? labourRaw.mode
          : 'hourly',
      calloutR: num(labourRaw.calloutR, base.labour.calloutR),
      hours: num(labourRaw.hours, 0),
      rateR: num(labourRaw.rateR, base.labour.rateR),
      days: num(labourRaw.days, 0),
      dayRateR: num(labourRaw.dayRateR, base.labour.dayRateR),
      fixedR: num(labourRaw.fixedR, 0),
      crew: Array.isArray(labourRaw.crew)
        ? labourRaw.crew.map(parseCrewLine).filter((c): c is ScopeCrewLine => c !== null)
        : [],
      description: str(labourRaw.description),
    },
    coc: {
      included: cocRaw.included === true,
      feeR: num(cocRaw.feeR, base.coc.feeR),
    },
  }
}

const CREW_UNITS: ScopeCrewLine['unit'][] = ['hr', 'day', 'job']

function parseCrewLine(raw: unknown): ScopeCrewLine | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const sell = r.sellR
  return {
    id: str(r.id) || newScopeLineId(),
    staffId: typeof r.staffId === 'string' && r.staffId ? r.staffId : null,
    name: str(r.name),
    qty: num(r.qty, 0),
    unit: CREW_UNITS.includes(r.unit as ScopeCrewLine['unit']) ? (r.unit as ScopeCrewLine['unit']) : 'hr',
    costR: num(r.costR, 0),
    // A zero markup would sell labour at cost. Treated as "unset" → 1 (at cost,
    // deliberately) only when it parses as a real number; junk falls back to 1.
    markup: num(r.markup, 1),
    sellR: typeof sell === 'number' && Number.isFinite(sell) && sell >= 0 ? sell : null,
  }
}

/**
 * Markup a new crew line starts at — 20% on the wage.
 *
 * Deliberately NOT the company materials markup. Crew lines used to seed from
 * it, which billed a R250/hr sparky at R287,50/hr while the hourly mode billed
 * the settings rate outright — so crew mode quietly under-priced labour against
 * every other labour mode. Labour carries its own number; per-line edits still
 * override it.
 */
export const CREW_DEFAULT_MARKUP = 1.2

export function newCrewLine(over: Partial<ScopeCrewLine> = {}): ScopeCrewLine {
  return {
    id: newScopeLineId(),
    staffId: null,
    name: '',
    qty: 0,
    unit: 'hr',
    costR: 0,
    markup: CREW_DEFAULT_MARKUP,
    sellR: null,
    ...over,
  }
}

/**
 * Hours in a normal working day.
 *
 * Payroll already fixes this number: splitOvertime() starts paying overtime
 * after 9 hours (lib/staff/pay.ts), so a day booked onto a quote has to carry
 * nine hours of wages or the quote under-recovers what the payslip pays out.
 * One constant, so the quote and the wage bill cannot drift apart.
 */
export const CREW_HOURS_PER_DAY = 9

/**
 * Re-express a crew line's rates when its unit changes.
 *
 * The rate seeded from the staff directory is R/HOUR. Switching the unit to
 * days without touching that number silently reads an hourly rate as a day
 * rate — a nine-fold under-bill, and one the margin readout still reports as
 * perfectly healthy because cost and sell are understated together. Hours and
 * days are both time, so convert between them; a 'job' lump has no time basis,
 * so its rate is left alone for the user to type.
 */
export function convertCrewUnit(
  line: ScopeCrewLine,
  unit: ScopeCrewLine['unit'],
): ScopeCrewLine {
  if (unit === line.unit) return line
  const factor =
    line.unit === 'hr' && unit === 'day' ? CREW_HOURS_PER_DAY
    : line.unit === 'day' && unit === 'hr' ? 1 / CREW_HOURS_PER_DAY
    : 1
  if (factor === 1) return { ...line, unit }
  return {
    ...line,
    unit,
    costR: round2(line.costR * factor),
    sellR: line.sellR === null ? null : round2(line.sellR * factor),
  }
}

/** What one crew line is billed at per unit — the manual override wins. */
export function crewUnitSellR(line: ScopeCrewLine): number {
  if (line.sellR !== null && line.sellR > 0) return round2(line.sellR)
  return round2(line.costR * line.markup)
}

/** What one crew line adds to the quote. */
export function crewLineSellR(line: ScopeCrewLine): number {
  return round2(crewUnitSellR(line) * line.qty)
}

/** What one crew line costs the business (wages, no markup). */
export function crewLineCostR(line: ScopeCrewLine): number {
  return round2(line.costR * line.qty)
}

/** Total crew sell — the only crew figure that ever reaches a customer. */
export function crewSellR(labour: ScopeLabour): number {
  return round2(labour.crew.reduce((sum, c) => sum + crewLineSellR(c), 0))
}

/** Total crew cost — internal margin reporting only. */
export function crewCostR(labour: ScopeLabour): number {
  return round2(labour.crew.reduce((sum, c) => sum + crewLineCostR(c), 0))
}

/**
 * Labour amount for the quote:
 *   hourly → call-out + hours × rate (the call-out IS the one-hour minimum, so
 *            the first hour is not billed twice)
 *   daily  → days × day rate (team rate; no call-out — a full day absorbs it)
 *   fixed  → the typed amount
 *   crew   → the sum of the priced crew (cost × markup, per person)
 */
export function labourAmountR(labour: ScopeLabour): number {
  if (labour.mode === 'crew') return crewSellR(labour)
  if (labour.mode === 'fixed') return round2(labour.fixedR)
  if (labour.mode === 'daily') return round2(labour.days * labour.dayRateR)
  const billableHours = Math.max(0, labour.hours - (labour.calloutR > 0 ? 1 : 0))
  return round2(labour.calloutR + billableHours * labour.rateR)
}

/**
 * What the quote's labour COSTS the business.
 *
 * Only crew mode knows a real cost — the other three modes are quoted as a
 * lump with no wage breakdown behind them, so cost == sell there (the
 * long-standing convention for generated labour lines).
 */
export function labourCostR(labour: ScopeLabour): number {
  if (labour.mode === 'crew') return crewCostR(labour)
  return labourAmountR(labour)
}

/** Is this line priced, judged from the values stored on the scope itself? */
export function lineIsPriced(line: ScopeLine): boolean {
  return line.unitSellR > 0
}

export interface ScopeTotals {
  /** Quote total (rands) — excludes optional extras and unpriced lines. */
  sellR: number
  materialsR: number
  labourR: number
  feesR: number
  /** Combined value of optional extras (not in sellR). */
  optionalR: number
  /** Lines still waiting on a price (optional lines included). */
  needsPricing: number
  lineCount: number
}

/**
 * Preview totals from the values stored on the scope. The authoritative price
 * comes from scopeToBom() at generate time (which re-reads catalog costs) —
 * this exists so the builder UI can show live totals without a catalog fetch.
 */
export function scopeTotals(scope: QuoteScope): ScopeTotals {
  let materialsR = 0
  let labourR = 0
  let feesR = 0
  let optionalR = 0
  let needsPricing = 0

  for (const line of scope.lines) {
    if (line.qty <= 0) continue
    const amount = round2(line.unitSellR * line.qty)
    if (line.optional) {
      // Unpriced optional extras don't count as needing pricing — they are
      // not in the total, so nothing is blocked on them (matches scopeToBom).
      if (lineIsPriced(line)) optionalR += amount
      continue
    }
    if (!lineIsPriced(line)) {
      needsPricing += 1
      continue
    }
    if (line.kind === 'material') materialsR += amount
    else if (line.kind === 'labour') labourR += amount
    else feesR += amount
  }

  labourR += labourAmountR(scope.labour)
  if (scope.coc.included && scope.coc.feeR > 0) feesR += round2(scope.coc.feeR)

  return {
    sellR: round2(materialsR + labourR + feesR),
    materialsR: round2(materialsR),
    labourR: round2(labourR),
    feesR: round2(feesR),
    optionalR: round2(optionalR),
    needsPricing,
    lineCount: scope.lines.length,
  }
}

/**
 * Deposit sections for a scope quote: every section holding at least one
 * non-optional material line. Labour and compliance are payable on completion —
 * this preserves the locked rule (deposit by line items, never a percentage).
 */
export function scopeDepositSections(scope: QuoteScope): string[] {
  const withMaterials = new Set(
    scope.lines
      .filter((l) => l.kind === 'material' && !l.optional && l.qty > 0)
      .map((l) => l.section),
  )
  const ordered = scope.sections.filter((s) => withMaterials.has(s))
  for (const s of withMaterials) if (!ordered.includes(s)) ordered.push(s)
  return ordered
}
