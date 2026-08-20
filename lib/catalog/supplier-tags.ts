// ─────────────────────────────────────────────────────────────────────────────
// Supplier status tags in catalog descriptions.
//
// Key Electric's price list carries the item's *status* inside its description
// text: "[NEW] CHINT 125A 1P CIRCUIT BREAKER D-CURVE 6KA (816128)". Because the
// status lives in the description it travels everywhere the description does —
// the quote pickers, the web store, and the customer's quote document. A
// customer has no idea what "[UNI]" means and should never be shown it.
//
// Migration 128 + lib/catalog/eol.ts did this for "[EOL]". This module is the
// same idea generalised, with one deliberate difference: **it works off an
// allowlist of known tags, not a pattern**.
//
// That matters, because the same descriptions are full of brackets that are
// real product data and must survive untouched:
//
//     "(T2US2C) SONOFF 2 LEVER (2 GANG) TOUCH WHT…"   ← model code
//     "CHINT 16A 2P CIRCUIT BREAKER C-CURVE (181519)" ← supplier part number
//     "CHINT THERMAL OVERLOAD 5.5-8A [for NXC MINI…]" ← compatibility
//     "RUWAG HARDEN 19MM 1/2\" HEX SOCKET [PER SOCKET]" ← unit of sale
//
// A "strip anything in brackets" rule would eat all four. So every bracketed
// group is looked up in TAGS below and left exactly as-is unless it is a tag we
// have actually decided about. Adding a tag is a one-line change here.
//
// Position-independent by design. "[UNI]" is the same noise whether it leads
// the description (6 rows) or sits mid-string (7 more); a leading-only rule
// would have cleaned half the problem.
//
// Pure module — safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import { stripEolMarker } from './eol'

/** What to do with a recognised tag. */
export type TagKind =
  /** Marketing/versioning noise. Deleted outright — nothing is lost. */
  | 'drop'
  /** A real stock signal. Becomes `equipment_catalog.temporarily_out_of_stock`. */
  | 'stock'
  /** An internal warning staff must keep. Moves to `equipment_catalog.notes`. */
  | 'note'
  /**
   * Part of the product's identity despite looking like a tag. Never removed.
   * Listed explicitly so a future edit to this table cannot quietly drop it.
   */
  | 'keep'

interface TagRule {
  kind: TagKind
  /** Why this call was made — read this before changing a row's `kind`. */
  because: string
  /** For 'note': the line written into `notes`. */
  note?: string
}

/**
 * Every supplier status tag observed in the live catalog, keyed by its
 * normalised inner text (uppercase, whitespace collapsed).
 *
 * Counts are from the 2026-08-20 audit of all 14 810 catalog rows.
 */
export const TAGS: Readonly<Record<string, TagRule>> = {
  // ── Noise ─────────────────────────────────────────────────────────────────
  NEW: {
    kind: 'drop',
    because:
      '25 rows. A price-list highlight that ages out — every one of them already ' +
      'carries a full product name and part number, so nothing is lost by dropping it.',
  },
  UNI: {
    kind: 'drop',
    because:
      "13 rows (6 leading, 7 mid-string). Key's marker for a generic/unbranded line. " +
      'Means nothing to a customer and nothing to staff choosing between two parts.',
  },
  '10MT': {
    kind: 'drop',
    because:
      '5 rows, all insulation tape, and every one of them already says "10M" in the ' +
      'description itself ("[10MT] INSULATION TAPE ECONO 10M BLACK"). Pure duplication.',
  },
  ECO: {
    kind: 'drop',
    because:
      "1 row. Key's price-tier marker; the SKU (ECOPID-4-5-2R-S) already carries it.",
  },
  'PROMO WHILE STOCKS LAST': {
    kind: 'drop',
    because:
      '7 rows, all trailing. A supplier promotion, not a property of the product. ' +
      "Printing it on a customer quote makes a promise about Key's stock that we cannot keep.",
  },

  // ── Real signals ──────────────────────────────────────────────────────────
  'TEMP OUT OF STOCK': {
    kind: 'stock',
    because:
      '1 row (ES-5548PL, Esener 5.2kW inverter). A genuine availability signal staff ' +
      'need before they quote it — so it becomes a column and a badge, not a deletion.',
  },
  'DO NOT USE - DUPLICATE CODE': {
    kind: 'note',
    because:
      '1 row (HCT114 cable tray), and it is ACTIVE, so this internal instruction was ' +
      'one quote away from printing in front of a customer. The warning is real, so it ' +
      'moves to notes rather than being dropped.',
    note: 'Key Electric flagged this as a duplicate code — do not use. See the catalog de-duplication pass.',
  },

  // ── Identity — must survive ───────────────────────────────────────────────
  // Three Volta rows share one description. Strip the generation marker and
  // VOLTA-STAGE1-NEWGEN and VOLTA-STAGE1-OG become byte-identical, at costs
  // R16 189.76 and R17 249.54 — staff could not tell them apart in the picker
  // and a customer would see two indistinguishable lines. The marker IS the
  // product difference here, so it stays.
  'NEW GEN': { kind: 'keep', because: 'Sole discriminator between the Volta battery generations.' },
  'OLD GEN': { kind: 'keep', because: 'Sole discriminator between the Volta battery generations.' },
} as const

/**
 * One bracketed group, plus any separator trailing it.
 *
 * Openers and closers are matched independently because the source
 * spreadsheets mismatch them — "{A}18V", "{NO COIL)" and "{EOL]" all appear in
 * the live data. The inner text excludes bracket characters so the match cannot
 * run across two adjacent groups like "(GOOGLE)(NON-DIM)", and is capped at 40
 * characters so an unclosed bracket cannot swallow the rest of the line.
 *
 * A closing bracket is required. That is what keeps "[NEW GEN]" out of the
 * "NEW" rule's hands: the inner text is read whole and looked up whole, so the
 * two can never be confused.
 */
const BRACKETED = /[[({]\s*([^[\](){}]{1,40}?)\s*[\])}]\s*[-–—:]?\s*/g

/** Whitespace collapsed and uppercased — the key used to look a tag up in TAGS. */
function normalise(inner: string): string {
  return inner.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * The rule for a bracketed group's inner text, or null if it is not a tag we know.
 *
 * A tag must be SHOUTED to count. Key's price list is uppercase throughout, so
 * "[NEW]" is theirs — while a bracketed word with any lowercase in it was typed
 * by a person here and is part of a curated product name:
 *
 *     "[NEW] CHINT 16A 4P CIRCUIT BREAKER…"        ← supplier tag, 25 rows
 *     "SolarEdge Synergy (New) Unit with RSD…"     ← our own name for the part
 *     "SolarEdge Home Hot Water Controller (New)"  ← ditto
 *
 * Without this test the three SolarEdge rows (all supplier = null, all title
 * case) get quietly renamed, and "Synergy (New) Unit" — where the qualifier
 * sits mid-name doing real work — becomes "Synergy Unit".
 *
 * If Key ever ships a "[New]" this misses it, which is the safe direction: the
 * failure is leaving text alone, not mangling a product name.
 */
export function lookupTag(inner: string): TagRule | null {
  if (/[a-z]/.test(inner)) return null
  return TAGS[normalise(inner)] ?? null
}

/** Tidy the spacing left behind after groups have been removed. */
function tidy(text: string): string {
  return text.replace(/\s{2,}/g, ' ').trim()
}

/**
 * Walk every bracketed group in `text`, handing each to `visit`. Returning a
 * string replaces the group; returning null leaves it exactly as it was —
 * which is what every unrecognised group gets, and is why model codes and part
 * numbers survive.
 *
 * `touched` says whether anything was actually removed. It matters: the
 * whitespace tidy must run only on text we disturbed. Tidying unconditionally
 * would make this function rewrite any description containing a stray double
 * space — 257 of them in the live catalog — turning a 50-row cleanup into a
 * 307-row one and burying the real change in noise.
 */
function mapTags(
  text: string,
  visit: (rule: TagRule, inner: string) => string | null,
): { text: string; touched: boolean } {
  let touched = false
  BRACKETED.lastIndex = 0
  const out = text.replace(BRACKETED, (match, inner: string) => {
    const rule = lookupTag(inner)
    if (!rule) return match
    const replacement = visit(rule, inner)
    if (replacement === null) return match
    touched = true
    return replacement
  })
  return { text: out, touched }
}

/** True when the text carries a supplier status tag we have a rule for. */
export function hasSupplierTag(text: string | null | undefined): boolean {
  if (!text) return false
  let found = false
  mapTags(text, (rule) => {
    if (rule.kind !== 'keep') found = true
    return null
  })
  return found
}

/**
 * Remove the recognised tags and tidy only if something went. Text with no tag
 * comes back byte-identical — the invariant the bulk migration relies on.
 */
function applyAndTidy(
  text: string,
  visit: (rule: TagRule, inner: string) => string | null,
): string {
  const { text: out, touched } = mapTags(text, visit)
  return touched ? tidy(out) : out
}

/**
 * The text with every recognised status tag removed. 'keep' tags stay, and so
 * does every bracketed group that is not in TAGS.
 *
 * Used on import (so the stored description is clean) and again when rendering
 * a document built before this existed.
 */
export function stripSupplierTags<T extends string | null | undefined>(text: T): T {
  if (!text) return text
  return applyAndTidy(text, (rule) => (rule.kind === 'keep' ? null : '')) as T
}

/**
 * Split a supplier description into its clean text and the status it was
 * carrying.
 *
 * Like `parseEolDescription`, the flags here are only ever set true — a later
 * price list that drops the marker does not clear it. Un-flagging is a
 * deliberate admin action, which is the safe direction for a stock warning.
 */
export function parseSupplierTags(text: string | null | undefined): {
  description: string | null
  temporarilyOutOfStock: boolean
  /** Lines to append to `equipment_catalog.notes`. Empty when there are none. */
  notes: string[]
} {
  if (!text) return { description: text ?? null, temporarilyOutOfStock: false, notes: [] }

  let temporarilyOutOfStock = false
  const notes: string[] = []

  const description = applyAndTidy(text, (rule) => {
    if (rule.kind === 'keep') return null
    if (rule.kind === 'stock') temporarilyOutOfStock = true
    if (rule.kind === 'note' && rule.note && !notes.includes(rule.note)) notes.push(rule.note)
    return ''
  })

  return { description: description || null, temporarilyOutOfStock, notes }
}

/**
 * The single scrub applied to a rendered quote document on its way to a
 * customer: supplier status tags and the older EOL marker together.
 *
 * Render sites call this rather than the two strippers, so adding a tag to
 * TAGS above is all it takes for the customer-facing pages to honour it.
 */
export function scrubSupplierMarkup<T extends string | null | undefined>(html: T): T {
  if (!html) return html
  return stripSupplierTags(stripEolMarker(html))
}
