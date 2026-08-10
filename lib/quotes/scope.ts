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

export interface ScopeLabour {
  mode: 'hourly' | 'fixed'
  /** Call-out fee (hourly mode only). */
  calloutR: number
  hours: number
  /** R/hr — seeded from company_settings.labour_hourly_rate_rands. */
  rateR: number
  /** Fixed-price amount (fixed mode only). */
  fixedR: number
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
      calloutR: num(opts.calloutR, 450),
      hours: 0,
      rateR: num(opts.labourRateR, 650),
      fixedR: 0,
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
    section: str(r.section),
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
    sections: Array.isArray(r.sections) ? r.sections.filter((s): s is string => typeof s === 'string' && s.length > 0) : [],
    lines: Array.isArray(r.lines) ? r.lines.map(parseLine).filter((l): l is ScopeLine => l !== null) : [],
    labour: {
      mode: labourRaw.mode === 'fixed' ? 'fixed' : 'hourly',
      calloutR: num(labourRaw.calloutR, base.labour.calloutR),
      hours: num(labourRaw.hours, 0),
      rateR: num(labourRaw.rateR, base.labour.rateR),
      fixedR: num(labourRaw.fixedR, 0),
      description: str(labourRaw.description),
    },
    coc: {
      included: cocRaw.included === true,
      feeR: num(cocRaw.feeR, base.coc.feeR),
    },
  }
}

/** Labour amount for the quote: hourly → call-out + hours × rate; fixed → the typed amount. */
export function labourAmountR(labour: ScopeLabour): number {
  if (labour.mode === 'fixed') return round2(labour.fixedR)
  return round2(labour.calloutR + labour.hours * labour.rateR)
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
    if (!lineIsPriced(line)) {
      needsPricing += 1
      continue
    }
    const amount = round2(line.unitSellR * line.qty)
    if (line.optional) {
      optionalR += amount
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
