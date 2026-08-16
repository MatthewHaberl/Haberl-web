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
  /** Header text carried through so we can spot "incl VAT" pricing. */
  label: string
}

// Most specific first — "Unit Net" must not be read as the "Unit" column, and
// "Line Total" must not be read as a price.
const HEADER_PATTERNS: Array<{ key: ColumnKey; re: RegExp }> = [
  { key: 'discount', re: /\bdisc(ount)?\b|\bdisc\s*%|%\s*disc/i },
  { key: 'net', re: /\bnett?\b/i },
  { key: 'total', re: /line\s*total|\btotal\b|\bamount\b|extended|\bext\b|\bvalue\b/i },
  { key: 'price', re: /price|\brate\b|\beach\b|\bcost\b/i },
  { key: 'qty', re: /\bqty\b|quantit|\bunits?\s*ordered\b|\bordered\b/i },
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

const round2 = (n: number) => Math.round(n * 100) / 100

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

/** The column a cell sits in — the one it overlaps most, ties to the nearer left edge. */
function columnFor(cell: TableCell, cols: Column[]): Column | null {
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

function cellsByColumn(row: TableRow, cols: Column[]): Map<ColumnKey, string> {
  const out = new Map<ColumnKey, string>()
  for (const cell of row.cells) {
    const col = columnFor(cell, cols)
    if (!col?.key) continue
    const prev = out.get(col.key)
    out.set(col.key, prev ? `${prev} ${cell.text}` : cell.text)
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

/** A code-looking token: no spaces, has a digit or a dash, not a bare number. */
function looksLikeSku(text: string): boolean {
  if (!text || /\s/.test(text) || text.length > 32) return false
  if (!/[A-Za-z]/.test(text)) return false
  if (!/[\d\-_/.]/.test(text)) return false
  return /^[A-Za-z0-9\-_/.+#]+$/.test(text)
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
function resolveUnitPrice(
  vals: { price: number | null; net: number | null; discount: number | null; total: number | null },
  qty: number,
): number | null {
  const { price, net, discount, total } = vals
  const afterDiscount =
    price != null && discount != null && discount > 0 && discount < 100
      ? price * (1 - discount / 100)
      : null
  const unit = net ?? afterDiscount ?? price
  const fromTotal = total != null && qty > 0 ? total / qty : null

  if (unit != null && fromTotal != null) {
    // Cent-level rounding differs between the two; a real disagreement (a
    // per-line surcharge, a free item) means the total is the truth.
    const tolerance = Math.max(0.02, Math.abs(unit) * 0.02)
    return round2(Math.abs(fromTotal - unit) <= tolerance ? unit : fromTotal)
  }
  const chosen = unit ?? fromTotal
  return chosen == null ? null : round2(chosen)
}

function extractLines(pages: PdfTextPage[]): ParsedSupplierQuoteLine[] {
  const lines: DraftLine[] = []
  let cols: Column[] | null = null
  let vatInclusive = false

  for (const page of pages) {
    const rows = buildRows(page)
    // Find this page's header; pages without one reuse the last page's columns
    // (some systems print the header on page 1 only).
    let startIndex = 0
    for (let i = 0; i < rows.length; i++) {
      const candidate = readHeaderRow(rows[i], page.width)
      if (candidate) {
        cols = candidate
        vatInclusive = candidate.some((c) => /incl/i.test(c.label) && /vat|tax/i.test(c.label))
        startIndex = i + 1
        break
      }
    }
    if (!cols) continue

    let current: DraftLine | null = null
    for (const row of rows.slice(startIndex)) {
      const byCol = cellsByColumn(row, cols)
      const subject = [byCol.get('code'), byCol.get('description')].filter(Boolean).join(' ').trim()
      // Totals block — the table's done. The label can sit in any column (Key
      // prints SUBTOTAL/VAT/TOTAL over the price columns, terms on the left).
      if (row.cells.some((c) => TOTALS_ROW.test(c.text.trim()))) break
      if (subject && isNoise(subject)) continue
      if (!subject && row.cells.every((c) => isNoise(c.text))) continue

      const qtyVal = parseAmount(byCol.get('qty'))
      const vals = {
        price: parseAmount(byCol.get('price')),
        net: parseAmount(byCol.get('net')),
        discount: parseAmount(byCol.get('discount')),
        total: parseAmount(byCol.get('total')),
      }
      const moneyCount = [vals.price, vals.net, vals.total].filter((v) => v != null).length
      const isLineStart = subject.length > 0 && moneyCount > 0 && (qtyVal != null || moneyCount > 1)

      if (isLineStart) {
        const qty = qtyVal && qtyVal > 0 ? qtyVal : 1
        const unitPrice = resolveUnitPrice(vals, qty)
        if (unitPrice == null) continue
        const code = byCol.get('code')?.trim() ?? ''
        const descCell = byCol.get('description')?.trim() ?? ''
        // No dedicated code column: a code-shaped description cell is the SKU
        // and the wording arrives on the rows below it.
        const sku = code || (looksLikeSku(descCell) ? descCell : '')
        const description = code ? descCell : sku === descCell ? '' : descCell
        current = {
          page: page.page,
          y: row.y,
          sku,
          description,
          qty,
          unit: (byCol.get('unit') ?? '').trim().toLowerCase().slice(0, 12) || 'ea',
          unit_price_ex_vat: vatInclusive ? round2(unitPrice / 1.15) : unitPrice,
        }
        lines.push(current)
        continue
      }

      // Continuation: wording under the line it belongs to, nothing else on the row.
      if (
        current &&
        current.page === page.page &&
        subject &&
        !byCol.get('qty') &&
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

  // Supplier: the top-most line of real prose on the page — quoting systems put
  // their own name in the letterhead, above everything else.
  let supplier: string | null = null
  for (const row of top) {
    const candidate = row.cells
      .map((c) => c.text.trim())
      .find((t) => t.length >= 4 && /[A-Za-z]{3}/.test(t) && !DOC_TYPE_WORDS.test(t) && !/^[\d\W]+$/.test(t))
    if (candidate) {
      supplier = candidate.slice(0, 120)
      break
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

/**
 * The document's own ex-VAT subtotal, when it prints one. Used to prove the
 * extraction added up to the same number the supplier did.
 */
export function findSubtotal(pages: PdfTextPage[]): number | null {
  let found: number | null = null
  for (const page of pages) {
    for (const row of buildRows(page)) {
      if (!row.cells.some((c) => SUBTOTAL_LABEL.test(c.text.trim()))) continue
      const amounts = row.cells
        .map((c) => parseAmount(c.text))
        .filter((n): n is number => n != null && n > 0)
      if (amounts.length) found = Math.max(...amounts)
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
