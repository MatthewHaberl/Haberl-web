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
  /**
   * Work package this line belongs to (see ScopePackage), or null on a
   * single-package quote — which is every quote written before packages
   * existed, and every quote that only ever covers one job.
   *
   * Section identity is (packageId, section): "Distribution board" under
   * "Add a battery" and "Distribution board" under "Rewire the AC combiner"
   * are two different sections holding different parts. They are deliberately
   * NEVER merged — the whole reason a part is on the quote is the package it
   * was chosen for, and a merged line loses that.
   */
  packageId: string | null
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
  /**
   * Days this person is on site, for hourly lines. Null follows the crew's
   * `crewDays`, which is the normal case — the exception is the person who
   * only comes for the first day (`days: 1` on a three-day job).
   *
   * `qty` stays the number that PRICES the line; this is what derives it
   * (days x crewHoursPerDay). Anything that reads a quote — the BOM, the
   * margin, an old quote saved before this field existed — reads qty and is
   * unaffected.
   */
  days: number | null
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
  /**
   * Length of the job in working days, and the hours in one of those days
   * (crew mode). One shift shape for the whole crew: booking a 3-day install
   * is "3 days x 9 hours", not "27" typed against every person.
   */
  crewDays: number
  crewHoursPerDay: number
  /**
   * Flat per-job management fee — driving, supervising, the admin behind the
   * job. Billed when Matthew is running the job rather than working it; switch
   * it off on the jobs where his own hours are already in the labour above.
   *
   * It is folded into the ONE customer-facing labour line, not itemised: a
   * separate "management fee" row is the line a domestic customer argues with.
   * Internally it is pure margin — his own time is not a wage the business pays
   * out, so labourCostR() leaves it out of cost.
   *
   * Quotes saved before this existed parse to 0 / false and bill exactly what
   * they billed.
   */
  managementR: number
  managementIncluded: boolean
  description: string
}

/**
 * One package of work inside a quote — a job the customer could buy on its own.
 *
 * This is what lets three separate quotes become one document without losing
 * what made them three quotes. Each package keeps its own sections, its own
 * line items and, critically, its OWN labour: what that work costs when it is
 * the only reason anyone drives out, unlocks a board and comes back to
 * commission. That figure is real, and it is why the standalone prices add up
 * to more than the bundle.
 *
 * The quote's own `labour`/`coc`/`sections` are the BUNDLE — everything done in
 * one visit — which is exactly what a scope quote has always meant. That is not
 * a coincidence: it keeps every consumer downstream of scopeToBom (deposit,
 * bom_snapshot, job materials, POs, finance) reading the same shape it always
 * has, with the bundle as the quote.
 */
export interface ScopePackage {
  id: string
  /** Customer-facing name — "Panel upgrade & repair". */
  label: string
  /** This package's own scope-of-works paragraph. */
  summary: string
  /** Section display order WITHIN this package. */
  sections: string[]
  /**
   * Labour if this package is bought on its own — its own call-out, its own
   * crew days, its own management fee. Never billed together with the bundle
   * labour; it prices the "just this one" column and nothing else.
   */
  labour: ScopeLabour
  /** CoC billed when this package is taken alone. */
  coc: { included: boolean; feeR: number }
  /** Where this package came from, when it was pulled in off another quote. */
  sourceQuoteId: string | null
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
  /**
   * Work packages, in display order. EMPTY on a single-package quote, which is
   * the overwhelming majority and behaves exactly as it did before packages
   * existed — `sections`, `labour` and `coc` above are the whole quote.
   *
   * Once this has entries, `sections` holds only the sections of lines that
   * belong to no package (there should be none — importing moves everything
   * into a package), and `labour`/`coc` price the bundle.
   */
  packages: ScopePackage[]
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
  crewDays?: number
  crewHoursPerDay?: number
  managementR?: number
  managementIncluded?: boolean
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
      crewDays: num(opts.crewDays, 1),
      crewHoursPerDay: num(opts.crewHoursPerDay, CREW_HOURS_PER_DAY),
      managementR: num(opts.managementR, 0),
      managementIncluded: opts.managementIncluded === true,
      description: '',
    },
    coc: { included: false, feeR: num(opts.cocFeeR, 1500) },
    packages: [],
  }
}

export function newScopeLine(
  section: string,
  kind: ScopeLineKind = 'material',
  packageId: string | null = null,
): ScopeLine {
  return {
    id: newScopeLineId(),
    section,
    packageId,
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
    packageId: typeof r.packageId === 'string' && r.packageId ? r.packageId : null,
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

  const packages = Array.isArray(r.packages)
    ? r.packages.map(parsePackage).filter((p): p is ScopePackage => p !== null)
    : []
  const packageIds = new Set(packages.map((p) => p.id))
  const lines = Array.isArray(r.lines) ? r.lines.map(parseLine).filter((l): l is ScopeLine => l !== null) : []

  return {
    version: 1,
    summary: str(r.summary),
    exclusions: Array.isArray(r.exclusions) ? r.exclusions.filter((e): e is string => typeof e === 'string') : [],
    // Deduped: a repeated name would render (and bill) the same lines twice.
    sections: Array.isArray(r.sections)
      ? [...new Set(r.sections.filter((s): s is string => typeof s === 'string' && s.length > 0))]
      : [],
    // A line pointing at a package that isn't there would be invisible in the
    // builder and still billed by scopeToBom — the worst shape this model can
    // take. Orphans come home to the unpackaged group, where they are visible
    // and editable. Same posture as the blank-section fallback above.
    lines: lines.map((l) =>
      l.packageId && !packageIds.has(l.packageId) ? { ...l, packageId: null } : l,
    ),
    labour: parseLabour(r.labour, base.labour),
    coc: parseCoc(r.coc, base.coc),
    packages,
  }
}

function parseCoc(raw: unknown, base: { included: boolean; feeR: number }): { included: boolean; feeR: number } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { included: r.included === true, feeR: num(r.feeR, base.feeR) }
}

/**
 * One labour block, sanitised. Shared by the quote's own (bundle) labour and by
 * every package's standalone labour — they are the same shape and must degrade
 * the same way, or a package saved before a field existed would price
 * differently from the bundle that contains it.
 */
function parseLabour(raw: unknown, base: ScopeLabour): ScopeLabour {
  const labourRaw = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    mode:
      labourRaw.mode === 'fixed' || labourRaw.mode === 'daily' || labourRaw.mode === 'crew'
        ? labourRaw.mode
        : 'hourly',
    calloutR: num(labourRaw.calloutR, base.calloutR),
    hours: num(labourRaw.hours, 0),
    rateR: num(labourRaw.rateR, base.rateR),
    days: num(labourRaw.days, 0),
    dayRateR: num(labourRaw.dayRateR, base.dayRateR),
    fixedR: num(labourRaw.fixedR, 0),
    crew: Array.isArray(labourRaw.crew)
      ? labourRaw.crew.map(parseCrewLine).filter((c): c is ScopeCrewLine => c !== null)
      : [],
    // Quotes saved before the shift block existed read as a single 9-hour
    // day; their crew lines already carry the hours that price them, so the
    // total does not move.
    crewDays: Math.max(num(labourRaw.crewDays, 1), 0),
    crewHoursPerDay: Math.max(num(labourRaw.crewHoursPerDay, CREW_HOURS_PER_DAY), 0),
    // Absent on every quote saved before the fee existed. Defaulting it OFF
    // is the whole point: reopening an old quote must not quietly add money
    // to a number the customer has already been shown.
    managementR: Math.max(num(labourRaw.managementR, 0), 0),
    managementIncluded: labourRaw.managementIncluded === true,
    description: str(labourRaw.description),
  }
}

function parsePackage(raw: unknown): ScopePackage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  // No id means no line can point at it — it would render as an empty package
  // nobody can add to. Drop it; its lines (if any) re-home above.
  if (!id) return null
  const base = emptyScope()
  return {
    id,
    label: str(r.label),
    summary: str(r.summary),
    sections: Array.isArray(r.sections)
      ? [...new Set(r.sections.filter((s): s is string => typeof s === 'string' && s.length > 0))]
      : [],
    labour: parseLabour(r.labour, base.labour),
    coc: parseCoc(r.coc, base.coc),
    sourceQuoteId: typeof r.sourceQuoteId === 'string' && r.sourceQuoteId ? r.sourceQuoteId : null,
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
    days: typeof r.days === 'number' && Number.isFinite(r.days) && r.days >= 0 ? r.days : null,
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
    days: null,
    costR: 0,
    markup: CREW_DEFAULT_MARKUP,
    sellR: null,
    ...over,
  }
}

/**
 * Hours in a normal working day — the fallback when nothing else says otherwise.
 *
 * Payroll fixes this number: splitOvertime() starts paying overtime after 9
 * hours (lib/staff/pay.ts), so a day booked onto a quote has to carry nine
 * hours of wages or the quote under-recovers what the payslip pays out.
 *
 * Company Settings can seed a shorter house shift onto new quotes (migration
 * 119, `company_settings.crew_hours_per_day`), and each quote then carries its
 * own `labour.crewHoursPerDay` — read that, not this constant, when pricing a
 * saved quote. This value only fills the gap where no setting has been read
 * yet: emptyScope() with no opts, and legacy quotes saved before the shift
 * block existed, whose crew lines already carry the hours that price them.
 */
export const CREW_HOURS_PER_DAY = 9

/** Days this crew line is on site — its own figure, else the job's. */
export function crewLineDays(line: ScopeCrewLine, labour: ScopeLabour): number {
  return line.days ?? labour.crewDays
}

/**
 * Re-derive `qty` on the hourly crew lines from the shift block.
 *
 * Called whenever days or hours-per-day change so the priced number can never
 * disagree with what the panel reads. Day- and job-unit lines are left alone:
 * their qty means days or jobs, not hours.
 */
export function applyCrewShift(
  labour: ScopeLabour,
  patch: { crewDays?: number; crewHoursPerDay?: number },
): ScopeLabour {
  const next: ScopeLabour = { ...labour, ...patch }
  return {
    ...next,
    crew: next.crew.map((c) =>
      c.unit === 'hr'
        ? { ...c, qty: round2(crewLineDays(c, next) * next.crewHoursPerDay) }
        : c,
    ),
  }
}

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
  hoursPerDay: number = CREW_HOURS_PER_DAY,
): ScopeCrewLine {
  if (unit === line.unit) return line
  // The quote's own shift, not the house default: a job booked at 8-hour days
  // must convert at 8, or switching the unit re-prices the line by an hour.
  const hours = hoursPerDay > 0 ? hoursPerDay : CREW_HOURS_PER_DAY
  const factor =
    line.unit === 'hr' && unit === 'day' ? hours
    : line.unit === 'day' && unit === 'hr' ? 1 / hours
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

/**
 * Hours the crew is quoted for — the yardstick a job's timesheets are measured
 * against. Day-priced lines count as their days × the shift's hours; a
 * job-priced line has no hours to count.
 */
export function crewHours(labour: ScopeLabour): number {
  return round2(
    labour.crew.reduce((sum, c) => {
      if (c.unit === 'hr') return sum + c.qty
      if (c.unit === 'day') return sum + c.qty * labour.crewHoursPerDay
      return sum
    }, 0),
  )
}

/** Total crew cost — internal margin reporting only. */
export function crewCostR(labour: ScopeLabour): number {
  return round2(labour.crew.reduce((sum, c) => sum + crewLineCostR(c), 0))
}

/**
 * The management fee actually being billed — zero unless it is switched on.
 *
 * Every read goes through here rather than touching `managementR`, so an amount
 * left sitting in a switched-off field can never reach a total.
 */
export function managementFeeR(labour: ScopeLabour): number {
  if (!labour.managementIncluded) return 0
  return round2(Math.max(0, labour.managementR))
}

/**
 * What the work itself is billed at, before the management fee.
 *
 *   hourly → call-out + hours × rate (the call-out IS the one-hour minimum, so
 *            the first hour is not billed twice)
 *   daily  → days × day rate (team rate; no call-out — a full day absorbs it)
 *   fixed  → the typed amount
 *   crew   → the sum of the priced crew (cost × markup, per person)
 */
function labourWorkR(labour: ScopeLabour): number {
  if (labour.mode === 'crew') return crewSellR(labour)
  if (labour.mode === 'fixed') return round2(labour.fixedR)
  if (labour.mode === 'daily') return round2(labour.days * labour.dayRateR)
  const billableHours = Math.max(0, labour.hours - (labour.calloutR > 0 ? 1 : 0))
  return round2(labour.calloutR + billableHours * labour.rateR)
}

/**
 * Labour amount for the quote — the work, plus the management fee if it is on.
 *
 * One number, whichever mode priced it, and the customer sees one line for it.
 */
export function labourAmountR(labour: ScopeLabour): number {
  return round2(labourWorkR(labour) + managementFeeR(labour))
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
  // The fee is Matthew's own time, not a wage the business pays out, so it is
  // margin in every mode — including the three that otherwise quote cost = sell.
  return labourWorkR(labour)
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
  return totalsFor(scope.lines, scope.labour, scope.coc)
}

/**
 * Totals for one package priced ON ITS OWN — its lines, its own labour, its
 * own CoC. This is the "just this one" column, and the reason the packages add
 * up to more than the bundle: each one carries a full visit.
 */
export function packageTotals(scope: QuoteScope, pkg: ScopePackage): ScopeTotals {
  return totalsFor(packageLines(scope, pkg.id), pkg.labour, pkg.coc)
}

/** Lines belonging to one package, in scope order. */
export function packageLines(scope: QuoteScope, packageId: string | null): ScopeLine[] {
  return scope.lines.filter((l) => l.packageId === packageId)
}

/** Section names used by a package — declared order first, then stragglers. */
export function packageSectionNames(scope: QuoteScope, pkg: ScopePackage): string[] {
  const names = [...pkg.sections]
  for (const line of packageLines(scope, pkg.id)) {
    if (line.section && !names.includes(line.section)) names.push(line.section)
  }
  return names
}

/**
 * What the customer would pay buying every package separately — each with its
 * own visit, its own call-out, its own CoC.
 *
 * Lines belonging to no package are counted at face value: they are billed by
 * the bundle, so leaving them out would understate the separate route and
 * overstate the saving. (validateScope warns when a quote has packages and
 * loose lines — this is the arithmetic that would otherwise lie.)
 */
export function separateTotalR(scope: QuoteScope): number {
  let total = scope.packages.reduce((t, p) => t + packageTotals(scope, p).sellR, 0)
  const loose = packageLines(scope, null)
  if (loose.length > 0) total += totalsFor(loose, null, null).sellR
  return round2(total)
}

/**
 * What taking everything at once saves — separate route minus the bundle.
 *
 * Never negative on the customer's side: if the bundle prices HIGHER than the
 * separate packages (labour edited up, or packages not priced yet) there is no
 * saving to advertise, and the document must not print one.
 */
export function bundleSavingR(scope: QuoteScope): number {
  return round2(Math.max(0, separateTotalR(scope) - scopeTotals(scope).sellR))
}

/**
 * Certificates billed on the separate route — one per package that wants one.
 *
 * The bundle issues ONE certificate for the whole job, so every package beyond
 * the first is a real saving, and one that has nothing to do with labour.
 */
export function separateCocR(scope: QuoteScope): number {
  return round2(
    scope.packages.reduce((t, p) => t + (p.coc.included && p.coc.feeR > 0 ? p.coc.feeR : 0), 0),
  )
}

/** Sum of every package's own labour — the labour bill if nothing is combined. */
export function separateLabourR(scope: QuoteScope): number {
  return round2(scope.packages.reduce((t, p) => t + labourAmountR(p.labour), 0))
}

function totalsFor(
  lines: ScopeLine[],
  labour: ScopeLabour | null,
  coc: { included: boolean; feeR: number } | null,
): ScopeTotals {
  let materialsR = 0
  let labourR = 0
  let feesR = 0
  let optionalR = 0
  let needsPricing = 0

  for (const line of lines) {
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

  if (labour) labourR += labourAmountR(labour)
  if (coc?.included && coc.feeR > 0) feesR += round2(coc.feeR)

  return {
    sellR: round2(materialsR + labourR + feesR),
    materialsR: round2(materialsR),
    labourR: round2(labourR),
    feesR: round2(feesR),
    optionalR: round2(optionalR),
    needsPricing,
    lineCount: lines.length,
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

// ─────────────────────────────────────────────────────────────────────────────
// Packages — combining several quotes into one document
//
// Matthew quotes a customer three times: repair the panels, add a battery,
// rewire the AC combiner. Each is a real quote with its own crew and its own
// day on site. He then wants to hand over ONE document: every job on it, each
// priced so the customer can see what it costs alone, and a bundled price for
// taking the lot — cheaper, because it is one mobilisation instead of three.
//
// That is what these functions build. The rules that matter:
//
//   - lines NEVER merge across packages. Two packages can each genuinely need a
//     12-way DB and that is two boards, not one; more importantly, the reason a
//     part is on the quote is the package it was chosen for, and merging
//     destroys that. Duplicates are surfaced for a person to judge instead.
//   - importing copies. The source quote is not touched, and the copy carries
//     fresh ids so editing one never edits the other.
//   - the bundle labour is SEEDED, never silently recomputed. It starts as
//     "everyone, for the sum of the days" and Matthew edits it down to the real
//     combined visit. Re-running an import must not undo that edit.
// ─────────────────────────────────────────────────────────────────────────────

export function newPackageId(): string {
  return `pkg-${newScopeLineId()}`
}

export function newPackage(over: Partial<ScopePackage> = {}): ScopePackage {
  const base = emptyScope()
  return {
    id: newPackageId(),
    label: '',
    summary: '',
    sections: [],
    labour: base.labour,
    coc: base.coc,
    sourceQuoteId: null,
    ...over,
  }
}

/** Deep copy of a labour block with fresh crew ids — never share a crew row. */
function cloneLabour(labour: ScopeLabour): ScopeLabour {
  return {
    ...labour,
    crew: labour.crew.map((c) => ({ ...c, id: newScopeLineId() })),
  }
}

/**
 * Guarantee the quote is package-shaped, folding whatever is already on it into
 * a first package.
 *
 * Called before an import so you end up with two packages rather than one
 * package sitting beside a pile of loose lines. An empty quote just gains no
 * package — there is nothing to preserve, and the import supplies the first one.
 */
export function ensurePackaged(scope: QuoteScope, label: string): QuoteScope {
  if (scope.packages.length > 0) return scope
  const loose = packageLines(scope, null)
  if (loose.length === 0 && !scope.summary.trim()) return scope

  const first = newPackage({
    label: label.trim() || 'Original scope',
    summary: scope.summary,
    sections: [...scope.sections],
    // The quote's labour becomes this package's standalone labour: on a
    // one-package quote they are the same job, and the bundle keeps its own
    // copy below, so nothing about the current price moves.
    labour: cloneLabour(scope.labour),
    coc: { ...scope.coc },
  })
  return {
    ...scope,
    packages: [first],
    lines: scope.lines.map((l) => (l.packageId === null ? { ...l, packageId: first.id } : l)),
    // Sections now live on the package. The quote-level list is what loose
    // lines order by, and there are none left.
    sections: [],
    // MOVED, not copied. The paragraph describes this one job, and the package
    // is now where that is said; leaving it here as well prints it twice on the
    // document — once as the quote's opening line, once under the package. The
    // quote-level summary is now free for an intro covering all the work.
    summary: '',
  }
}

export interface ImportPackageResult {
  scope: QuoteScope
  /** The package the source landed in. */
  packageId: string
  /** True when the bundle labour absorbed the source crew (both crew-priced). */
  labourMerged: boolean
}

/**
 * Pull another quote's scope in as a new package on this one.
 *
 * The source is copied, not referenced: fresh line ids, fresh crew ids, its own
 * labour block. Editing the combined quote afterwards never touches the quote
 * it came from.
 */
export function importScopeAsPackage(
  target: QuoteScope,
  source: QuoteScope,
  opts: { label: string; sourceQuoteId?: string | null; existingLabel?: string },
): ImportPackageResult {
  const base = ensurePackaged(target, opts.existingLabel ?? 'Original scope')

  // Straggler sections included, or a line lands in a section its package never
  // lists and sorts to the bottom of the editor.
  const sections = [...source.sections]
  for (const l of source.lines) {
    if (l.section && !sections.includes(l.section)) sections.push(l.section)
  }

  const pkg = newPackage({
    label: opts.label.trim() || 'Additional work',
    summary: source.summary,
    sections,
    labour: cloneLabour(source.labour),
    coc: { ...source.coc },
    sourceQuoteId: opts.sourceQuoteId ?? null,
  })

  const imported: ScopeLine[] = source.lines.map((l) => ({
    ...l,
    id: newScopeLineId(),
    packageId: pkg.id,
  }))

  // Exclusions are quote-level and cheap to over-collect — dedupe on the text a
  // person would read, not on exact bytes.
  const seenExcl = new Set(base.exclusions.map((e) => e.trim().toLowerCase()))
  const exclusions = [...base.exclusions]
  for (const e of source.exclusions) {
    const key = e.trim().toLowerCase()
    if (!key || seenExcl.has(key)) continue
    seenExcl.add(key)
    exclusions.push(e)
  }

  const merged = mergeCrewInto(base.labour, source.labour)

  return {
    scope: {
      ...base,
      exclusions,
      packages: [...base.packages, pkg],
      lines: [...base.lines, ...imported],
      labour: merged.labour,
      // The bundle bills ONE CoC however many packages want one — part of what
      // makes taking everything cheaper than buying it piece by piece.
      coc:
        base.coc.included || source.coc.included
          ? { included: true, feeR: Math.max(base.coc.feeR, source.coc.feeR) }
          : base.coc,
    },
    packageId: pkg.id,
    labourMerged: merged.labourMerged,
  }
}

/**
 * Seed the bundle crew with an incoming package's crew.
 *
 * Someone on both packages keeps ONE row and their days add up — two days on
 * the panels plus one on the battery is a three-day person, not two rows the
 * shift block cannot express. Someone new joins the crew. The result is the
 * honest un-combined starting point; the saving is what Matthew then takes off
 * it.
 *
 * Only meaningful when both sides price labour by crew. A lump-sum block
 * (hourly/daily/fixed) has no crew to merge, so the bundle is left exactly as
 * it is and the caller is told nothing moved — the builder then offers the sum
 * as a one-click figure rather than quietly rewriting a price.
 */
function mergeCrewInto(
  bundle: ScopeLabour,
  incoming: ScopeLabour,
): { labour: ScopeLabour; labourMerged: boolean } {
  if (bundle.mode !== 'crew' || incoming.mode !== 'crew' || incoming.crew.length === 0) {
    return { labour: bundle, labourMerged: false }
  }

  const key = (c: ScopeCrewLine) => c.staffId ?? `name:${c.name.trim().toLowerCase()}`
  // Pin everyone's CURRENT days onto their own row before anything moves.
  // Most crew rows follow the job length (days: null), so raising crewDays
  // below to cover the longest person would otherwise re-price every one of
  // them — a one-day electrician silently billed for three.
  const crew = bundle.crew.map((c) => ({
    ...c,
    days: c.unit === 'hr' ? crewLineDays(c, bundle) : c.days,
  }))
  const byKey = new Map(crew.map((c) => [key(c), c]))

  for (const inc of incoming.crew) {
    const existing = byKey.get(key(inc))
    if (existing) {
      // Hourly rows are derived from days; day- and job-priced rows carry their
      // own qty and have no days to add.
      if (existing.unit === 'hr' && inc.unit === 'hr') {
        existing.days = (existing.days ?? bundle.crewDays) + crewLineDays(inc, incoming)
      } else {
        existing.qty = round2(existing.qty + inc.qty)
      }
      continue
    }
    const added: ScopeCrewLine = {
      ...inc,
      id: newScopeLineId(),
      days: inc.unit === 'hr' ? crewLineDays(inc, incoming) : inc.days,
    }
    crew.push(added)
    byKey.set(key(added), added)
  }

  // The job is now as long as its longest person. Everyone shorter carries
  // their own `days`, so nobody is quietly re-priced by that change.
  const longest = crew.reduce(
    (max, c) => (c.unit === 'hr' ? Math.max(max, c.days ?? bundle.crewDays) : max),
    bundle.crewDays,
  )
  return {
    labour: applyCrewShift({ ...bundle, mode: 'crew', crew }, { crewDays: longest }),
    labourMerged: true,
  }
}

/**
 * Drop a package and every line on it.
 *
 * The bundle labour is deliberately left alone: by the time anyone removes a
 * package it has been edited by hand, and silently un-merging a crew would
 * re-price the quote behind them. The builder shows bundle labour against the
 * package sum, so a stale figure is visible rather than hidden.
 */
export function removePackage(scope: QuoteScope, packageId: string): QuoteScope {
  return {
    ...scope,
    packages: scope.packages.filter((p) => p.id !== packageId),
    lines: scope.lines.filter((l) => l.packageId !== packageId),
  }
}

/** Move a package up or down the display order. */
export function movePackage(scope: QuoteScope, packageId: string, dir: -1 | 1): QuoteScope {
  const order = [...scope.packages]
  const i = order.findIndex((p) => p.id === packageId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return scope
  const swap = order[i]
  order[i] = order[j]
  order[j] = swap
  return { ...scope, packages: order }
}

/** Patch one package in place. */
export function updatePackage(
  scope: QuoteScope,
  packageId: string,
  patch: Partial<ScopePackage>,
): QuoteScope {
  return {
    ...scope,
    packages: scope.packages.map((p) => (p.id === packageId ? { ...p, ...patch } : p)),
  }
}

/**
 * The same item bought under more than one package.
 *
 * Deliberately NOT merged — two packages can each genuinely need one, and the
 * quote is supposed to show why each part is there. Surfaced so a person
 * decides, because the other reading (one board, counted twice) is an expensive
 * mistake to post to a customer.
 */
export interface DuplicateAcrossPackages {
  key: string
  description: string
  /** One entry per package holding it. */
  perPackage: { packageId: string; label: string; qty: number }[]
}

export function duplicatesAcrossPackages(scope: QuoteScope): DuplicateAcrossPackages[] {
  if (scope.packages.length < 2) return []
  const labelOf = new Map(scope.packages.map((p) => [p.id, p.label || 'Untitled package']))
  const groups = new Map<string, { description: string; byPkg: Map<string, number> }>()

  for (const line of scope.lines) {
    if (!line.packageId || line.qty <= 0 || line.kind !== 'material') continue
    // Catalog id first — the same product reached by two differently typed
    // descriptions is still the same product. Free-text lines fall back to SKU,
    // then to the description as typed.
    const key = line.catalogId
      ? `cat:${line.catalogId}`
      : line.sku.trim()
        ? `sku:${line.sku.trim().toLowerCase()}`
        : `txt:${line.description.trim().toLowerCase()}`
    if (key === 'txt:') continue
    const g = groups.get(key) ?? { description: line.description || line.sku, byPkg: new Map() }
    g.byPkg.set(line.packageId, round2((g.byPkg.get(line.packageId) ?? 0) + line.qty))
    groups.set(key, g)
  }

  const out: DuplicateAcrossPackages[] = []
  for (const [key, g] of groups) {
    if (g.byPkg.size < 2) continue
    out.push({
      key,
      description: g.description,
      perPackage: [...g.byPkg.entries()].map(([packageId, qty]) => ({
        packageId,
        label: labelOf.get(packageId) ?? 'Package',
        qty,
      })),
    })
  }
  return out
}

/**
 * A display label per package, guaranteed unique and non-empty.
 *
 * Section identity in a DesignBom is the section NAME, so the label that
 * qualifies it has to be unique or two packages fuse back into one section and
 * one subtotal. Untitled packages get a number; genuinely duplicated labels get
 * a suffix. Nothing here renames the package itself — this is a rendering
 * concern, and the builder is where a person fixes a name properly.
 */
export function packageDisplayLabels(scope: QuoteScope): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  scope.packages.forEach((pkg, i) => {
    const base = pkg.label.trim() || `Package ${i + 1}`
    let label = base
    let n = 2
    while (used.has(label.toLowerCase())) label = `${base} (${n++})`
    used.add(label.toLowerCase())
    out.set(pkg.id, label)
  })
  return out
}

/**
 * How a section is named once it belongs to a package.
 *
 * The em dash is the separator everywhere — BOM section names, the customer
 * document, job materials — so a section can always be read back as
 * "package — section" by a person looking at a purchase order.
 */
export function qualifiedSectionName(packageLabel: string, section: string): string {
  const name = section.trim() || 'Scope of work'
  const label = packageLabel.trim()
  return label ? `${label} — ${name}` : name
}
