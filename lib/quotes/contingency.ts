// ─────────────────────────────────────────────────────────────────────────────
// Quote contingency — money added to a quote for the work nobody can see yet.
//
// Every job has some. A wall opens up and the conduit inside is perished; the
// DB is fuller than the photo showed; the roof sheet cracks when it is lifted.
// None of that belongs on a line item, because there is no line item for it —
// it is a deliberate allowance against the unknown, and the trade prices it as
// a percentage of the work, a round figure, or by rounding the quote up.
//
// So it is exactly the mirror of a credit (lib/quotes/credits.ts): a credit is
// money OFF the bottom of the quote for a reason that isn't about the job's
// cost; a contingency is money ON for a reason that isn't about a line item's
// price. Both live outside the two engines and are applied to the finished BOM,
// which is what lets ONE implementation serve both the solar canvas and the
// scope builder — neither designToBom nor scopeToBom needs to know it exists.
//
// Three ways to arrive at the number, and they compose:
//   percentage   of materials, of labour, or of the whole quote — the 5%-of-
//                materials the trade actually quotes
//   fixed        a flat rand allowance
//   round up     take whatever the total lands on to the next R500 (or R1 000,
//                or R100). Applied AFTER the percentage, so "5% then round" is
//                one setting, and round-up on its own is basis 'none'.
//
// Where it lands on the document is a separate choice (`show`):
//   true   its own "Contingency" section, priced and labelled. What a
//          commercial customer expects to see, and what makes it defensible
//          when it isn't spent.
//   false  folded into the labour line, the way the management fee already is
//          (see ScopeLabour.managementR) — one number, nothing to argue with.
//
// It NEVER lands in the deposit. The line is kind:'fee', which computeScopeDeposit
// bills on completion, and the section name is not in DEPOSIT_SECTIONS, so the
// solar path leaves it alone too. That is deliberate: asking a customer for a
// deposit against money that may never be spent is the fastest way to have to
// hand it back.
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import type { BomLine, BomSection, DesignBom } from '@/lib/solar/design-bom'

/** What the percentage is taken of. 'fixed' and 'none' ignore the percentage. */
export type ContingencyBasis = 'materials' | 'labour' | 'total' | 'fixed' | 'none'

export interface ContingencyBasisSpec {
  key: ContingencyBasis
  label: string
  hint: string
}

export const CONTINGENCY_BASES: ContingencyBasisSpec[] = [
  {
    key: 'materials', label: '% of materials',
    hint: 'The usual one. Covers the parts you find you need once the job is open — a length of conduit, a gland, a breaker that turns out to be the wrong size.',
  },
  {
    key: 'labour', label: '% of labour',
    hint: 'For jobs where the risk is time, not parts — chasing a fault, working around someone else’s wiring.',
  },
  {
    key: 'total', label: '% of the whole quote',
    hint: 'Materials and labour together. The blunt one — use it when you genuinely don’t know which half will move.',
  },
  {
    key: 'fixed', label: 'Fixed amount',
    hint: 'A flat allowance you have worked out yourself. It does not move when the quote is re-priced.',
  },
  {
    key: 'none', label: 'Round up only',
    hint: 'No allowance of its own — just take the total up to the next round figure.',
  },
]

export function contingencyBasisSpec(basis: ContingencyBasis): ContingencyBasisSpec {
  return CONTINGENCY_BASES.find((b) => b.key === basis) ?? CONTINGENCY_BASES[0]
}

export interface QuoteContingency {
  /** Off on every quote that has never set one — and on every quote written before this existed. */
  enabled: boolean
  basis: ContingencyBasis
  /** Percentage points (5 means 5%). Read on the three percentage bases only. */
  percent: number
  /** Flat rand allowance. Read on basis 'fixed' only. */
  amountR: number
  /**
   * Round the quote total UP to the next multiple of this, after the allowance
   * above. 0 is off, which is the default — a quote total is not rounded unless
   * somebody says so.
   */
  roundToR: number
  /** What it is called on the customer's document, when it is shown at all. */
  label: string
  /**
   * Print it as its own section, or fold it into the labour line.
   *
   * Folding is not hiding money — the total is the total either way, and it is
   * the same treatment the management fee already gets. It is about whether the
   * customer is handed a row whose only possible response is "take that off".
   */
  show: boolean
  /** Internal note — why this job carries a contingency. Never rendered. */
  note: string | null
}

/** The section a shown contingency prints under. */
export const CONTINGENCY_SECTION = 'Contingency'

export const DEFAULT_CONTINGENCY_LABEL = 'Contingency allowance'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Finite, non-negative number or the fallback — same guard as parseScope's. */
function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback
}

export function emptyContingency(): QuoteContingency {
  return {
    enabled: false,
    basis: 'materials',
    percent: 0,
    amountR: 0,
    roundToR: 0,
    label: DEFAULT_CONTINGENCY_LABEL,
    show: true,
    note: null,
  }
}

const BASES = new Set<string>(CONTINGENCY_BASES.map((b) => b.key))

/**
 * Tolerant parse of quote_requests.contingency — the jsonb object or a JSON
 * string. Same contract as parseCredits/parseScope: never throws, and anything
 * it doesn't recognise comes back as "no contingency", which is what every
 * quote written before this existed meant.
 *
 * Every number is clamped non-negative and the percentage is capped at 100. A
 * contingency is an allowance on top of a price, so a negative one would be a
 * discount typed into the wrong box — credits are where money comes off, with a
 * reason attached to it (lib/quotes/credits.ts).
 */
export function parseContingency(raw: unknown): QuoteContingency {
  let obj = raw
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return emptyContingency() }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return emptyContingency()
  const r = obj as Record<string, unknown>
  const base = emptyContingency()
  const label = typeof r.label === 'string' ? r.label.trim() : ''
  return {
    enabled: r.enabled === true,
    basis: (typeof r.basis === 'string' && BASES.has(r.basis) ? r.basis : base.basis) as ContingencyBasis,
    // 100% is the ceiling on purpose: a fat-fingered "500" in a percent field
    // would otherwise sextuple a quote, and the number it produced would look
    // every bit as deliberate as the right one on the document.
    percent: Math.min(num(r.percent, 0), 100),
    amountR: round2(num(r.amountR, 0)),
    roundToR: round2(num(r.roundToR, 0)),
    label: label || DEFAULT_CONTINGENCY_LABEL,
    // Absent reads as shown. A contingency that quietly folded itself into
    // labour because a field was missing is money on a document nobody chose to
    // put there.
    show: r.show !== false,
    note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
  }
}

/**
 * A line the customer is buying a PART on, as opposed to time or a certificate.
 *
 * Both engines mark their own labour, and they mark it differently: the scope
 * builder stamps kind:'labour'|'fee' on typed lines, while both engines give
 * their generated labour/CoC lines a synthetic `labour:` id and no kind at all.
 * Reading only one of those would silently count the solar Labour section as
 * materials and quote a contingency on it.
 */
function isMaterialLine(line: BomLine): boolean {
  if (line.kind === 'labour' || line.kind === 'fee') return false
  return !line.catalogId.startsWith('labour:')
}

function sumLines(bom: DesignBom, predicate: (l: BomLine) => boolean): number {
  let total = 0
  for (const s of bom.sections) {
    for (const l of s.lines) {
      // Optional extras aren't in the quote total, so they can't be in the base
      // of a percentage of it — an extra the customer declines would otherwise
      // leave the contingency priced for work nobody bought.
      if (l.optional) continue
      if (predicate(l)) total += l.lineSellR
    }
  }
  return round2(total)
}

/** What the materials on this quote sell for — the base of the usual contingency. */
export function materialsSellR(bom: DesignBom): number {
  return sumLines(bom, isMaterialLine)
}

/** What the labour and certificates on this quote sell for. */
export function labourSellR(bom: DesignBom): number {
  return sumLines(bom, (l) => !isMaterialLine(l))
}

/**
 * The labour line a folded contingency rides on: the biggest single-unit labour
 * line on the quote.
 *
 * qty === 1 is the gate, and it is not cosmetic — both engines generate their
 * labour as one line of one, while a scope quote's TYPED labour line is priced
 * per hour. Folding a lump onto a per-hour line would multiply it by the hours.
 */
function foldTarget(bom: DesignBom): { section: BomSection; line: BomLine } | null {
  let best: { section: BomSection; line: BomLine } | null = null
  for (const s of bom.sections) {
    for (const l of s.lines) {
      if (l.optional || !l.priced || l.qty !== 1 || isMaterialLine(l)) continue
      if (!best || l.lineSellR > best.line.lineSellR) best = { section: s, line: l }
    }
  }
  return best
}

/**
 * The figures a contingency is worked out from, before any of it is applied.
 *
 * Stamped into the generated document (see build-quote-document) so the panel
 * can price a change to the contingency exactly the way the server will,
 * without loading the 15k-row catalog into a browser to do it. Same reason
 * grossFiguresFromDocument exists for credits: previewing against the CURRENT
 * total would compound, because the current total already has a contingency in
 * it.
 */
export interface ContingencyBases {
  materialsR: number
  labourR: number
  totalR: number
  /** False when there is no labour line to fold a hidden contingency into. */
  hasLabour: boolean
}

export function contingencyBases(bom: DesignBom): ContingencyBases {
  return {
    materialsR: materialsSellR(bom),
    labourR: labourSellR(bom),
    totalR: round2(bom.totalSellR),
    hasLabour: foldTarget(bom) !== null,
  }
}

/** Tolerant parse of the bases stamped into a saved document. */
export function parseContingencyBases(raw: unknown): ContingencyBases | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.totalR !== 'number' || !Number.isFinite(r.totalR)) return null
  return {
    materialsR: num(r.materialsR, 0),
    labourR: num(r.labourR, 0),
    totalR: num(r.totalR, 0),
    hasLabour: r.hasLabour === true,
  }
}

export interface ContingencyResult {
  /** What the percentage was taken of. 0 on 'fixed' and 'none'. */
  baseR: number
  /** The allowance itself — percentage of the base, or the fixed amount. */
  uplift: number
  /** What was added purely to take the total to the next round figure. */
  rounding: number
  /** uplift + rounding: what goes on the quote. */
  amountR: number
  /** The quote total before any of it. */
  beforeR: number
  /** The quote total after. */
  afterR: number
}

/**
 * Work out the contingency on a set of figures.
 *
 * Split from the BOM so the panel can run the identical arithmetic off the
 * bases stamped in the document. Order matters and is fixed: the allowance
 * first, then the rounding on top of the result — rounding first and then
 * adding 5% would leave a total as un-round as the one you started with.
 */
export function computeContingencyFrom(
  c: QuoteContingency,
  bases: Pick<ContingencyBases, 'materialsR' | 'labourR' | 'totalR'>,
): ContingencyResult {
  const beforeR = round2(bases.totalR)
  if (!c.enabled) {
    return { baseR: 0, uplift: 0, rounding: 0, amountR: 0, beforeR, afterR: beforeR }
  }

  const baseR =
    c.basis === 'materials' ? round2(bases.materialsR)
      : c.basis === 'labour' ? round2(bases.labourR)
        : c.basis === 'total' ? beforeR
          : 0

  const uplift =
    c.basis === 'fixed' ? round2(c.amountR)
      : c.basis === 'none' ? 0
        : round2(baseR * (c.percent / 100))

  // Round the TOTAL up, not the allowance — the round number the customer reads
  // is the one at the bottom of the quote.
  const subtotal = round2(beforeR + uplift)
  let rounding = 0
  if (c.roundToR > 0 && subtotal > 0) {
    // Sub-cent slop from the percentage above must not push an already-round
    // total up a whole step, so the ceiling is taken on whole cents.
    const cents = Math.round(subtotal * 100)
    const stepCents = Math.round(c.roundToR * 100)
    if (stepCents > 0) {
      const over = cents % stepCents
      rounding = over === 0 ? 0 : round2((stepCents - over) / 100)
    }
  }

  const amountR = round2(uplift + rounding)
  return { baseR, uplift, rounding, amountR, beforeR, afterR: round2(beforeR + amountR) }
}

/** Same arithmetic, straight off a priced BOM. */
export function computeContingency(bom: DesignBom, c: QuoteContingency): ContingencyResult {
  return computeContingencyFrom(c, contingencyBases(bom))
}

export interface ContingencyApplication {
  /** The BOM with the contingency in it. The same object when there is none. */
  bom: DesignBom
  result: ContingencyResult
  /**
   * Where it ended up:
   *   'none'    no contingency, or it worked out to nothing
   *   'line'    its own section on the document
   *   'labour'  folded into the labour line
   */
  placement: 'none' | 'line' | 'labour'
  /**
   * True when it was meant to be folded but there was no labour line to fold it
   * into, so it printed as its own line instead. The panel says so — money
   * appearing on a document that was told to hide it is worth a sentence.
   */
  foldFailed: boolean
}

/**
 * Add the contingency to a priced BOM.
 *
 * This is the ONLY place it enters the money, and it runs after both engines
 * have finished pricing — so everything downstream of the BOM (the document
 * total, the deposit, bom_snapshot, the job, finance) sees one figure and it
 * already includes the allowance.
 *
 * The line carries NO cost (cost 0, sell the allowance), unlike the generated
 * labour lines beside it which are quoted cost == sell. That is the honest
 * entry: a contingency has not been spent on anything, so internally it reads
 * as margin — margin earmarked for a problem that may not turn up. Costing it
 * at sell would show a job at break-even on money still sitting in the bank.
 */
export function applyContingency(bom: DesignBom, c: QuoteContingency): ContingencyApplication {
  const result = computeContingency(bom, c)
  if (!c.enabled || result.amountR <= 0) {
    return { bom, result, placement: 'none', foldFailed: false }
  }

  const target = c.show ? null : foldTarget(bom)
  const foldFailed = !c.show && target === null

  if (target) {
    const sections = bom.sections.map((s) => {
      if (s !== target.section) return s
      const lines = s.lines.map((l) => (l === target.line ? {
        ...l,
        unitSellR: round2(l.unitSellR + result.amountR),
        lineSellR: round2(l.lineSellR + result.amountR),
      } : l))
      return { ...s, lines, sellR: round2(s.sellR + result.amountR) }
    })
    return {
      bom: { ...bom, sections, totalSellR: round2(bom.totalSellR + result.amountR) },
      result,
      placement: 'labour',
      foldFailed: false,
    }
  }

  const line: BomLine = {
    section: CONTINGENCY_SECTION,
    catalogId: 'contingency:allowance',
    sku: '',
    description: c.label || DEFAULT_CONTINGENCY_LABEL,
    qty: 1,
    unitCostR: 0,
    unitSellR: result.amountR,
    lineCostR: 0,
    lineSellR: result.amountR,
    priced: true,
    status: 'ok',
    // Payable on completion, never part of the deposit — see the header.
    kind: 'fee',
  }
  return {
    bom: {
      ...bom,
      sections: [...bom.sections, {
        name: CONTINGENCY_SECTION,
        lines: [line],
        costR: 0,
        sellR: result.amountR,
        needsPricing: 0,
      }],
      totalSellR: round2(bom.totalSellR + result.amountR),
    },
    result,
    placement: 'line',
    foldFailed,
  }
}

/** One line of plain English describing what the setting will do. */
export function describeContingency(c: QuoteContingency): string {
  if (!c.enabled) return 'No contingency on this quote.'
  const parts: string[] = []
  if (c.basis === 'fixed' && c.amountR > 0) {
    parts.push(`R${c.amountR.toLocaleString('en-ZA')} added`)
  } else if (c.basis !== 'none' && c.basis !== 'fixed' && c.percent > 0) {
    const of = c.basis === 'materials' ? 'materials' : c.basis === 'labour' ? 'labour' : 'the quote total'
    parts.push(`${c.percent}% of ${of} added`)
  }
  if (c.roundToR > 0) {
    parts.push(`the total rounded up to the next R${c.roundToR.toLocaleString('en-ZA')}`)
  }
  if (parts.length === 0) return 'Contingency is on, but set to nothing — it adds R0.00.'
  const where = c.show ? 'shown as its own line' : 'folded into the labour line'
  return `${parts.join(', and ')} — ${where}.`
}
