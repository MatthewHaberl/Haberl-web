// ─────────────────────────────────────────────────────────────────────────────
// Supplier-quote table reader (W99) — deterministic, no AI.
//
// Supplier quotes are machine-generated PDFs with a real table on them: the
// columns line up to the point, so the layout itself carries the meaning. This
// module rebuilds that table from positioned text runs (lib/quotes/pdf-text.ts):
//
//   1. cluster text runs into rows by baseline, and merge touching runs to cells
//   2. find the column header row ("Description  Qty  Unit Price  …") and turn
//      each header into an x-range
//   3. a row with a quantity AND a price in those ranges starts a line item;
//      text-only rows under it are description continuation
//   4. stop at the totals block; ignore repeated page furniture
//
// Deliberately supplier-agnostic — nothing here knows about Key Electric. What
// it relies on is the one thing every quoting system does: a labelled column
// header above right-aligned numbers.
//
// Prices come out EX VAT per lib/quotes/supplier-quotes.ts (landed = × 1.15).
// The net (after-discount) column wins over the list column when both exist,
// because the net is what the supplier will actually invoice.
//
// Whether a figure carries VAT is a property of its COLUMN, not of the
// document: Solarway's invoice prints "Incl. Price" and "Excl. Total" on the
// same header row, so the page is neither one thing nor the other. Each column
// is read against its own heading and divided back to ex VAT where it says
// "Incl.".
//
// Pure module — no I/O, no pdf.js — so it unit-tests on synthetic pages.
// ─────────────────────────────────────────────────────────────────────────────

import type { PdfTextPage, PdfTextItem } from './pdf-text'
import type { ParsedSupplierQuote, ParsedSupplierQuoteLine } from './supplier-quotes'

// ── Geometry tuning ──────────────────────────────────────────────────────────
/** Baselines within this many points are the same row. */
const ROW_TOLERANCE = 2.5
/** Text runs closer than this belong to the same cell. */
const CELL_GAP = 3
/** A continuation row further than this below its line is a different block. */
const MAX_CONTINUATION_GAP = 46

export interface TableCell {
  text: string
  x0: number
  x1: number
}

export interface TableRow {
  page: number
  y: number
  cells: TableCell[]
}

type ColumnKey = 'code' | 'description' | 'qty' | 'unit' | 'price' | 'discount' | 'net' | 'total'

interface Column {
  key: ColumnKey | null
  x0: number
  x1: number
  /** The heading as printed, kept so a mis-read column can be recognised. */
  label: string
  /** That heading says its figures carry VAT, so they need dividing back out. */
  vatInclusive: boolean
}

/** Columns that hold money, where two competing figures must not be glued together. */
const MONEY_KEYS: ReadonlySet<ColumnKey> = new Set<ColumnKey>(['price', 'net', 'total'])

/** South African VAT — the only rate these documents are printed at. */
const VAT_MULTIPLIER = 1.15

const exVat = (amount: number, vatInclusive: boolean) =>
  vatInclusive ? amount / VAT_MULTIPLIER : amount

// Most specific first — "Unit Net" must not be read as the "Unit" column, and
// "Line Total" must not be read as a price.
const HEADER_PATTERNS: Array<{ key: ColumnKey; re: RegExp }> = [
  { key: 'discount', re: /\bdisc(ount)?\b|\bdisc\s*%|%\s*disc/i },
  { key: 'net', re: /\bnett?\b/i },
  { key: 'total', re: /line\s*total|\btotal\b|\bamount\b|extended|\bext\b|\bvalue\b/i },
  { key: 'price', re: /price|\brate\b|\beach\b|\bcost\b/i },
  // "Ord" (ordered) is Key Electric's quantity heading, and it is the column the
  // line total is struck from. Missing it defaulted every line to qty 1, which
  // then made resolveUnitPrice read the LINE TOTAL as the unit price.
  { key: 'qty', re: /\bqty\b|quantit|\bunits?\s*ordered\b|\bordered\b|^ord\.?$|^q'?ty\.?$/i },
  { key: 'unit', re: /\bunit\b|\buom\b|\bpack\b|\bmeasure\b/i },
  { key: 'code', re: /\bcode\b|\bsku\b|\bpart\s*(no|number)?\b|\bstock\s*(no|code)\b|\bitem\s*(no|code)\b/i },
  { key: 'description', re: /descript|\bproduct\b|\bitem\b|\bgoods\b/i },
]

/** Rows the document repeats on every page, or that belong to a stock/status strip. */
const NOISE_ROW = [
  /^stock\b/i,
  /\bon hand\b/i,
  /\breserved\b/i,
  /\bavailable\b/i,
  /\binbound\b/i,
  // A batch/lot stamp printed under a cut-length line — traceability for the
  // reel that was cut, not part of what the product is.
  /^serial\s*\/?\s*lot\b/i,
  /^batch\s*(no|number)?\b/i,
  /^printed\b/i,
  /^page \d+ of \d+/i,
  /^ver[\s.]/i,
  /^continued\b/i,
  /^brought forward\b/i,
  /^carried forward\b/i,
]

/** Once one of these appears in the first column, the line-item table is over. */
const TOTALS_ROW =
  /^(sub[-\s]?total|totals?|grand total|nett? total|vat\b|v\.a\.t|amount due|balance due|total due|total excl|total incl|delivery total)/i

const DOC_TYPE_WORDS =
  /^(quote|quotation|pro[-\s]?forma|proforma|tax invoice|invoice|statement|order|purchase order|credit note|delivery note|page \d)/i

/**
 * Round to the cent, half up.
 *
 * The toFixed step is not decoration: dividing an ex-VAT total by a quantity
 * lands on halves a lot (R33.91 over 2 is 16.955), and in binary that is
 * 16.954999999999998, which Math.round takes DOWN to 16.95 — a cent light on
 * every such line, against a supplier who rounded up.
 */
const round2 = (n: number) => Math.round(Number((n * 100).toFixed(4))) / 100

// ── Row / cell assembly ──────────────────────────────────────────────────────

/** Cluster a page's text runs into rows of merged cells, top row first. */
export function buildRows(page: PdfTextPage): TableRow[] {
  const buckets: Array<{ y: number; items: PdfTextItem[] }> = []
  for (const item of [...page.items].sort((a, b) => b.y - a.y)) {
    const bucket = buckets.find((b) => Math.abs(b.y - item.y) <= ROW_TOLERANCE)
    if (bucket) bucket.items.push(item)
    else buckets.push({ y: item.y, items: [item] })
  }

  return buckets.map(({ y, items }) => {
    const sorted = [...items].sort((a, b) => a.x - b.x)
    const cells: TableCell[] = []
    for (const item of sorted) {
      const text = item.str.trim()
      if (!text) continue
      const last = cells[cells.length - 1]
      if (last && item.x - last.x1 < CELL_GAP) {
        // Runs that touch are one cell; pdf.js splits on font/kerning changes.
        last.text = `${last.text}${item.x - last.x1 > 0.6 ? ' ' : ''}${text}`
        last.x1 = Math.max(last.x1, item.x + item.width)
      } else {
        cells.push({ text, x0: item.x, x1: item.x + Math.max(item.width, 1) })
      }
    }
    return { page: page.page, y, cells: cells.filter((c) => c.text.length > 0) }
  }).filter((r) => r.cells.length > 0)
}

// ── Column detection ─────────────────────────────────────────────────────────

function classifyHeader(text: string): ColumnKey | null {
  for (const { key, re } of HEADER_PATTERNS) if (re.test(text)) return key
  return null
}

/**
 * Does this heading say its figures include VAT?
 *
 * "Excl." has to be ruled out explicitly, because including and excluding are
 * the same word bar two letters at the front — and the old test (both "incl"
 * AND "vat"/"tax" somewhere in the header row) missed Solarway's "Incl. Price"
 * entirely, so a R19.50 VAT-inclusive price was stored as if it were the
 * ex-VAT cost.
 */
function isInclusiveHeading(label: string): boolean {
  return /incl/i.test(label) && !/excl/i.test(label)
}

/**
 * Turn a candidate header row into columns spanning to the next header's edge.
 * Returns null when the row doesn't look like a table header (needs a
 * description-ish column plus a price/total, which no address block has).
 */
export function readHeaderRow(row: TableRow, pageWidth: number): Column[] | null {
  const cols: Column[] = row.cells.map((c) => ({
    key: classifyHeader(c.text),
    x0: c.x0,
    x1: c.x1,
    label: c.text,
    vatInclusive: isInclusiveHeading(c.text),
  }))
  const keys = new Set(cols.map((c) => c.key).filter(Boolean))
  const hasSubject = keys.has('description') || keys.has('code')
  const hasMoney = keys.has('price') || keys.has('net') || keys.has('total')
  if (!hasSubject || !hasMoney) return null

  // Widen each column to touch its neighbour: numbers are right-aligned under a
  // left-aligned header, so a header's own width says nothing about its reach.
  for (let i = 0; i < cols.length; i++) {
    const next = cols[i + 1]
    cols[i].x0 = i === 0 ? Math.min(cols[i].x0, 0) : (cols[i - 1].x1 + cols[i].x0) / 2
    cols[i].x1 = next ? (cols[i].x1 + next.x0) / 2 : Math.max(cols[i].x1, pageWidth)
  }
  // Second pass so each boundary is shared exactly (the loop above reads x1
  // before its neighbour is adjusted).
  for (let i = 0; i < cols.length - 1; i++) cols[i + 1].x0 = cols[i].x1
  return cols
}

/**
 * The column a cell sits in.
 *
 * Numbers are right-aligned INSIDE their column, so the widest overlap is the
 * right answer for them. Wording is left-aligned and free to run past its
 * column's right edge — a 200pt description under a 145pt "Product" column
 * overlaps the NEXT column more, which is how full descriptions were being
 * filed under "Unit" and thrown away (the SKU-only lines on Key's invoices).
 * Text is therefore placed by where it STARTS; only unplaceable text (a cell
 * beginning left of the table) falls back to overlap.
 */
function columnFor(cell: TableCell, cols: Column[]): Column | null {
  if (parseAmount(cell.text) == null) {
    const startsIn = cols.find((c) => cell.x0 >= c.x0 && cell.x0 < c.x1)
    if (startsIn) return startsIn
  }
  let best: Column | null = null
  let bestOverlap = 0
  for (const col of cols) {
    const overlap = Math.min(cell.x1, col.x1) - Math.max(cell.x0, col.x0)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = col
    }
  }
  return bestOverlap > 0 ? best : null
}

/** What one column contributed to a row, carrying its heading's VAT basis. */
interface ColumnCell {
  text: string
  vatInclusive: boolean
}

/**
 * A row's cells filed under the column they sit in.
 *
 * Several cells can land in one column and are joined — a description that runs
 * on, or a currency symbol printed hard against its column's left edge with the
 * digits right-aligned away from it ("R" … "33.91"), which only parses once
 * it's back in one piece.
 *
 * Money is the exception. Solarway prints "Excl. Total" and "Incl. Total" side
 * by side and both are, by their wording, the line total; joining them gave
 * "R 33.91 R 39.00", which parses as nothing at all and lost the line total
 * completely. When two genuine figures claim the same money role the ex-VAT one
 * wins, because ex VAT is what we store.
 */
function cellsByColumn(row: TableRow, cols: Column[]): Map<ColumnKey, ColumnCell> {
  const out = new Map<ColumnKey, ColumnCell>()
  for (const cell of row.cells) {
    const col = columnFor(cell, cols)
    if (!col?.key) continue
    const prev = out.get(col.key)
    if (!prev) {
      out.set(col.key, { text: cell.text, vatInclusive: col.vatInclusive })
      continue
    }
    const competing =
      MONEY_KEYS.has(col.key) && parseAmount(prev.text) != null && parseAmount(cell.text) != null
    if (competing) {
      if (prev.vatInclusive && !col.vatInclusive) {
        out.set(col.key, { text: cell.text, vatInclusive: false })
      }
      continue
    }
    out.set(col.key, { text: `${prev.text} ${cell.text}`, vatInclusive: prev.vatInclusive })
  }
  return out
}

// ── Value parsing ────────────────────────────────────────────────────────────

/** A number as printed on SA quotes: 1,234.56 / 1 234,56 / (12.00) negative / R 45. */
export function parseAmount(text: string | undefined): number | null {
  if (!text) return null
  let s = text.replace(/[R\s ]/gi, '').replace(/[()]/g, '')
  if (!/\d/.test(s)) return null
  if (!/^[-+]?[\d.,]+%?$/.test(s)) return null
  s = s.replace(/%$/, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    // Comma is the decimal separator (1.234,56) — drop dots, swap the comma.
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * A stock-code token, for documents with no separate code column: the code sits
 * on the line-item row and the wording arrives on the rows beneath it.
 *
 * Deliberately permissive about SHAPE — a supplier's codes are whatever their
 * system prints. Requiring a letter AND a digit lost every pure-numeric code
 * (570332, 2149010, 622902) and every pure-alpha one (EARTHCLAMP,
 * EARTHCOUPLING); those lines came through with a blank SKU and so matched
 * nothing in the catalog. What it must NOT swallow is ordinary wording, so a
 * lone token still has to look like a code rather than a word: a digit,
 * all-caps, or code punctuation.
 */
function looksLikeSku(text: string): boolean {
  if (!text || /\s/.test(text) || text.length < 2 || text.length > 32) return false
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_/.+#*()&]*$/.test(text)) return false
  // A quantity or a price that landed here is not a code.
  if (/^\d{1,3}$/.test(text)) return false
  if (/^\d[\d ,]*[.,]\d{1,2}$/.test(text)) return false
  const allCaps = /[A-Z]/.test(text) && text === text.toUpperCase()
  return /\d/.test(text) || allCaps || /[-_/.#*]/.test(text)
}

/**
 * The stock code written into the front of the wording:
 * "AS-AMC-01B - ADJUSTABLE MID CLAMP/INCL SPRING". Solarway has no code column
 * at all, so without this every line arrives with a blank SKU and matches
 * nothing in the catalog.
 *
 * Only the FIRST word counts, and only when the document itself set it apart
 * with a spaced dash. It then has to look like a part number rather than the
 * first word of a sentence: four characters or more, carrying a digit or code
 * punctuation. Key Electric's "CBI 80A 2P MCB 6KA - MINI RAIL BLACK 2 MOD" is
 * the reason for the guard — "CBI" is a brand, it is all-caps like a code, and
 * tearing it off would leave a description that no longer says whose breaker
 * this is.
 */
function splitInlineSku(description: string): { sku: string; description: string } | null {
  const match = description.match(/^(\S+)\s+-\s+(\S.*)$/)
  if (!match) return null
  const [, token, rest] = match
  if (token.length < 4 || !/[-\d_/.]/.test(token) || !looksLikeSku(token)) return null
  return { sku: token, description: rest.trim() }
}

function isNoise(text: string): boolean {
  return NOISE_ROW.some((re) => re.test(text))
}

// ── Line-item extraction ─────────────────────────────────────────────────────

interface DraftLine extends ParsedSupplierQuoteLine {
  page: number
  y: number
}

/**
 * Resolve the ex-VAT unit price from whatever columns the document offers.
 * Preference: the line total ÷ qty (what will be invoiced) when it agrees with
 * the net column, else net, else list price less discount.
 */
interface LineValues {
  price: number | null
  net: number | null
  discount: number | null
  total: number | null
  /**
   * Which of those figures were printed under an "Incl." heading. Optional, so
   * the arithmetic below can also be handed plain ex-VAT numbers.
   */
  inclusive?: { price?: boolean; net?: boolean; total?: boolean }
}

/** The per-unit figure the document prints, ex VAT, and where it came from. */
interface UnitBasis {
  value: number
  /** VAT had to be divided out of it — a weaker number than an ex-VAT total. */
  wasInclusive: boolean
}

/** The per-unit figure the document itself prints, before any total check. */
function unitBasis(vals: LineValues): UnitBasis | null {
  const { price, net, discount } = vals
  if (net != null) {
    const wasInclusive = vals.inclusive?.net ?? false
    return { value: exVat(net, wasInclusive), wasInclusive }
  }
  if (price != null) {
    const wasInclusive = vals.inclusive?.price ?? false
    const afterDiscount =
      discount != null && discount > 0 && discount < 100 ? price * (1 - discount / 100) : price
    return { value: exVat(afterDiscount, wasInclusive), wasInclusive }
  }
  return null
}

/** The line total, ex VAT, whichever basis its column was printed on. */
function totalExVat(vals: LineValues): number | null {
  return vals.total == null ? null : exVat(vals.total, vals.inclusive?.total ?? false)
}

/**
 * Quantity from the line's own arithmetic, for documents whose quantity column
 * we couldn't label. total ÷ unit is only trusted when the whole number it
 * lands on reproduces the printed total — allowing for the unit price having
 * been rounded to the cent, which at qty 100 is 50c of drift.
 *
 * This is the belt to the "Ord" header's braces: a supplier heading we have
 * never seen should still not silently price a 25-off line as one item.
 */
export function inferQty(vals: LineValues): number | null {
  // Both sides on the same VAT basis, or an inclusive price over an exclusive
  // total would put the count out by 15%.
  const unit = unitBasis(vals)?.value ?? null
  const total = totalExVat(vals)
  if (unit == null || unit <= 0 || total == null || total <= 0) return null
  const qty = Math.round(total / unit)
  if (qty < 1 || qty > 100_000) return null
  const slack = Math.max(0.02, qty * 0.005 + total * 0.001)
  return Math.abs(qty * unit - total) <= slack ? qty : null
}

function resolveUnitPrice(vals: LineValues, qty: number): number | null {
  const unit = unitBasis(vals)
  const total = totalExVat(vals)
  const fromTotal = total != null && qty > 0 ? total / qty : null

  if (unit != null && fromTotal != null) {
    // A VAT-inclusive per-unit price is the weaker of the two whenever an
    // exclusive line total is on the page: the printed figure was rounded to the
    // cent BEFORE we divided the VAT back out, and a zero-rated line on an
    // otherwise 15% invoice (Solarway's trading fee, VAT % 0,00) never carried
    // VAT at all — dividing it by 1.15 would invent a discount that isn't there.
    if (unit.wasInclusive && !(vals.inclusive?.total ?? false)) return round2(fromTotal)
    // Cent-level rounding differs between the two; a real disagreement (a
    // per-line surcharge, a free item) means the total is the truth.
    const tolerance = Math.max(0.02, Math.abs(unit.value) * 0.02)
    return round2(Math.abs(fromTotal - unit.value) <= tolerance ? unit.value : fromTotal)
  }
  const chosen = unit?.value ?? fromTotal
  return chosen == null ? null : round2(chosen)
}

function extractLines(pages: PdfTextPage[]): ParsedSupplierQuoteLine[] {
  const lines: DraftLine[] = []
  let cols: Column[] | null = null

  for (const page of pages) {
    const rows = buildRows(page)
    // Find this page's header; pages without one reuse the last page's columns
    // (some systems print the header on page 1 only).
    let startIndex = 0
    for (let i = 0; i < rows.length; i++) {
      const candidate = readHeaderRow(rows[i], page.width)
      if (candidate) {
        cols = candidate
        startIndex = i + 1
        break
      }
    }
    if (!cols) continue

    let current: DraftLine | null = null
    for (const row of rows.slice(startIndex)) {
      const byCol = cellsByColumn(row, cols)
      const cellText = (key: ColumnKey) => byCol.get(key)?.text
      const subject = [cellText('code'), cellText('description')].filter(Boolean).join(' ').trim()
      // Totals block — the table's done. The label can sit in any column (Key
      // prints SUBTOTAL/VAT/TOTAL over the price columns, terms on the left).
      if (row.cells.some((c) => TOTALS_ROW.test(c.text.trim()))) break
      if (subject && isNoise(subject)) continue
      if (!subject && row.cells.every((c) => isNoise(c.text))) continue

      const qtyVal = parseAmount(cellText('qty'))
      const vals: LineValues = {
        price: parseAmount(cellText('price')),
        net: parseAmount(cellText('net')),
        discount: parseAmount(cellText('discount')),
        total: parseAmount(cellText('total')),
        inclusive: {
          price: byCol.get('price')?.vatInclusive ?? false,
          net: byCol.get('net')?.vatInclusive ?? false,
          total: byCol.get('total')?.vatInclusive ?? false,
        },
      }
      const moneyCount = [vals.price, vals.net, vals.total].filter((v) => v != null).length
      const isLineStart = subject.length > 0 && moneyCount > 0 && (qtyVal != null || moneyCount > 1)

      if (isLineStart) {
        const qty = qtyVal && qtyVal > 0 ? qtyVal : (inferQty(vals) ?? 1)
        const unitPrice = resolveUnitPrice(vals, qty)
        if (unitPrice == null) continue
        const code = cellText('code')?.trim() ?? ''
        const descCell = cellText('description')?.trim() ?? ''
        // No dedicated code column: a code-shaped description cell is the SKU
        // and the wording arrives on the rows below it.
        let sku = code || (looksLikeSku(descCell) ? descCell : '')
        let description = code ? descCell : sku === descCell ? '' : descCell
        // Still no code? It may be written into the front of the wording.
        const inline = sku ? null : splitInlineSku(description)
        if (inline) {
          sku = inline.sku
          description = inline.description
        }
        current = {
          page: page.page,
          y: row.y,
          sku,
          description,
          qty,
          unit: (cellText('unit') ?? '').trim().toLowerCase().slice(0, 12) || 'ea',
          unit_price_ex_vat: unitPrice,
        }
        lines.push(current)
        continue
      }

      // Continuation: wording under the line it belongs to, nothing else on the row.
      if (
        current &&
        current.page === page.page &&
        subject &&
        !cellText('qty') &&
        moneyCount === 0 &&
        current.y - row.y <= MAX_CONTINUATION_GAP &&
        current.description.length < 300
      ) {
        current.description = `${current.description} ${subject}`.trim()
        current.y = row.y
      }
    }
  }

  return lines
    .map(({ sku, description, qty, unit, unit_price_ex_vat }) => ({
      sku: sku.slice(0, 64),
      description: description.replace(/\s+/g, ' ').trim().slice(0, 400) || sku,
      qty,
      unit,
      unit_price_ex_vat,
    }))
    .filter((l) => l.description.length > 0)
}

// ── Header details (supplier, reference, date) ───────────────────────────────

const REFERENCE_LABELS = [
  /^(document|quote|quotation|pro[-\s]?forma|order)\s*(number|no\.?|#)?\s*:?$/i,
  /^(number|no\.?|ref(erence)?)\s*:?$/i,
]
const DATE_LABELS = [
  /^(document|quote|quotation|invoice)\s*date\s*:?$/i,
  /^date\s*:?$/i,
]
const DATE_LABEL_EXCLUDE = /required|due|expir|valid|deliver|print/i

/** How South African companies sign their own name. */
const COMPANY_SUFFIX = /\(\s*(pty|rf)\s*\)|\b(pty|ltd|limited|inc|incorporated|cc)\b/i

/** A heading that only says which block of the page follows — nobody's name. */
const BLOCK_HEADING = /^(from|to|bill(ed)?\s*to|ship\s*to|sold\s*to|attention|attn|supplier|customer)$/i

/**
 * Could this cell be somebody's name? Excludes the document type ("TAX
 * INVOICE"), field labels — anything ending in a colon, like Solarway's
 * "NUMBER:" — and the bare FROM / TO headings that sit above the two address
 * blocks, all of which are wording without being a name.
 */
function isNameLike(text: string): boolean {
  return (
    text.length >= 4 &&
    /[A-Za-z]{3}/.test(text) &&
    !text.endsWith(':') &&
    !DOC_TYPE_WORDS.test(text) &&
    !BLOCK_HEADING.test(text) &&
    !/^[\d\W]+$/.test(text)
  )
}

/** ISO-ise 2026/08/13, 13/08/2026, 13-08-26, 13 Aug 2026. Day-first when ambiguous (SA). */
export function parseDocumentDate(text: string | undefined): string | null {
  if (!text) return null
  const iso = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (iso) return isoOrNull(+iso[1], +iso[2], +iso[3])
  const dmy = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/)
  if (dmy) {
    const year = +dmy[3] < 100 ? 2000 + +dmy[3] : +dmy[3]
    return isoOrNull(year, +dmy[2], +dmy[1])
  }
  const named = text.match(
    /\b(\d{1,2})\s*(?:st|nd|rd|th)?[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})\b/i,
  )
  if (named) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      .indexOf(named[2].toLowerCase()) + 1
    const year = +named[3] < 100 ? 2000 + +named[3] : +named[3]
    return isoOrNull(year, month, +named[1])
  }
  return null
}

function isoOrNull(y: number, m: number, d: number): string | null {
  if (!(y >= 1990 && y <= 2100) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Value printed to the right of a label, on the label's row. */
function valueRightOf(rows: TableRow[], labels: RegExp[], exclude?: RegExp): string | null {
  for (const label of labels) {
    for (const row of rows) {
      for (let i = 0; i < row.cells.length; i++) {
        const text = row.cells[i].text.trim()
        if (!label.test(text)) continue
        if (exclude?.test(text)) continue
        const after = row.cells.slice(i + 1).map((c) => c.text.trim()).filter(Boolean)
        if (after.length) return after[0]
      }
    }
  }
  return null
}

function readHeaderDetails(pages: PdfTextPage[]): Omit<ParsedSupplierQuote, 'lines'> {
  const first = pages[0]
  if (!first) return { supplier: null, reference: null, quote_date: null }
  const rows = buildRows(first)
  const top = rows.slice(0, 30)

  // Supplier: a registered company name is the strongest signal on the page, so
  // look for one before falling back to position. Solarway is why — its
  // letterhead sits in the top RIGHT as a block of labelled fields, and
  // "top-most prose" read the label "NUMBER:" as the supplier while the real
  // name, "Y & R SOLAR (PTY) LTD", sat lower down under a FROM heading.
  let supplier: string | null = null
  for (const row of top) {
    const named = row.cells.map((c) => c.text.trim()).find((t) => isNameLike(t) && COMPANY_SUFFIX.test(t))
    if (named) {
      supplier = named.slice(0, 120)
      break
    }
  }
  // Nobody spelled out a company suffix: the top-most line of real prose, which
  // is where quoting systems put their own name.
  if (!supplier) {
    for (const row of top) {
      const candidate = row.cells.map((c) => c.text.trim()).find((t) => isNameLike(t))
      if (candidate) {
        supplier = candidate.slice(0, 120)
        break
      }
    }
  }

  let reference = valueRightOf(top, REFERENCE_LABELS)
  if (reference && !/[A-Za-z0-9]/.test(reference)) reference = null

  const dateText = valueRightOf(top, DATE_LABELS, DATE_LABEL_EXCLUDE)
  let quote_date = parseDocumentDate(dateText ?? undefined)
  if (!quote_date) {
    // No labelled date: take the first date-looking cell in the letterhead.
    for (const row of top) {
      for (const cell of row.cells) {
        const d = parseDocumentDate(cell.text)
        if (d) { quote_date = d; break }
      }
      if (quote_date) break
    }
  }

  return {
    supplier: supplier || null,
    reference: reference ? reference.slice(0, 64) : null,
    quote_date,
  }
}

// ── Subtotal cross-check ─────────────────────────────────────────────────────

const SUBTOTAL_LABEL = /^(sub[-\s]?total|total\s*(excl|ex\b|before)|nett?\s*total|goods\s*total)/i

/** A label that says in words that its figure excludes VAT. */
const EXCLUSIVE_SUBTOTAL_LABEL = /^total\s*(excl|ex\b|before)/i

/**
 * The document's own ex-VAT subtotal, when it prints one. Used to prove the
 * extraction added up to the same number the supplier did.
 *
 * Solarway prints two candidates: "Total Exclusive: R 33.91" and, below it,
 * "Sub Total: R 39.00" — which on that layout is VAT-INCLUSIVE. Simply keeping
 * the last match took the inclusive one and then accused a perfectly good
 * extraction of not adding up, so the labels are ranked: wording that says
 * "excluding" beats a bare "Sub Total". Within a rank the last match still
 * wins, which is how a multi-page document reaches its final total.
 */
export function findSubtotal(pages: PdfTextPage[]): number | null {
  let found: number | null = null
  let bestRank = 0
  for (const page of pages) {
    for (const row of buildRows(page)) {
      const label = row.cells.map((c) => c.text.trim()).find((t) => SUBTOTAL_LABEL.test(t))
      if (!label) continue
      const rank = EXCLUSIVE_SUBTOTAL_LABEL.test(label) ? 2 : 1
      if (rank < bestRank) continue
      const amounts = row.cells
        .map((c) => parseAmount(c.text))
        .filter((n): n is number => n != null && n > 0)
      if (amounts.length) {
        found = Math.max(...amounts)
        bestRank = rank
      }
    }
  }
  return found
}

/** Σ qty × unit price over the extracted lines. */
export function linesSubtotal(lines: ParsedSupplierQuoteLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.qty * l.unit_price_ex_vat, 0))
}

// ── Entry point ──────────────────────────────────────────────────────────────

/** Read a supplier quote's header and line items straight off the PDF's layout. */
export function parseSupplierQuotePages(pages: PdfTextPage[]): ParsedSupplierQuote {
  const lines = extractLines(pages)
  return { ...readHeaderDetails(pages), lines, subtotal_ex_vat: findSubtotal(pages) }
}
