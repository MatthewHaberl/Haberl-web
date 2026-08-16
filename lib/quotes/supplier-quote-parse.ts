// ─────────────────────────────────────────────────────────────────────────────
// Supplier-quote document extraction (W98, reworked W99) — server only.
//
// Two readers, tried in this order:
//   1. the TABLE READER (lib/quotes/supplier-quote-table.ts) — deterministic,
//      free, offline: it rebuilds the quote's table from the PDF's own text
//      layout. This is the normal path and needs no API key.
//   2. Claude — only as a fallback, for PDFs with no text layer (a scan) or a
//      photographed quote, and only when ANTHROPIC_API_KEY happens to be set.
//
// Callers: app/api/quotes/[id]/supplier-quotes (upload) and .../[sqId]/parse
// (re-parse). Both go through parseAndStoreLines so the replace-lines +
// header-update behavior stays identical.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractPdfTextPages, looksLikePdf } from './pdf-text'
import { linesSubtotal, parseSupplierQuotePages } from './supplier-quote-table'
import type { ParsedSupplierQuote, ParsedSupplierQuoteLine } from './supplier-quotes'

export type { ParsedSupplierQuote, ParsedSupplierQuoteLine }

export const SUPPLIER_QUOTES_BUCKET = 'supplier-quotes'

/** The AI fallback is configured (scans/photos only — PDFs never need it). */
export function aiParseAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

const EXTRACT_SYSTEM_PROMPT = `You extract line items from South African electrical/solar supplier quotations for Haberl Electrical & Solar.

You will receive one supplier quotation document (PDF or a photo of a printed quote). Return the header details and EVERY product/service line on it.

Rules:
- Prices are in South African Rand. SA supplier quotes normally list EX-VAT unit prices with 15% VAT added near the total. Return EX-VAT unit prices. If the document only shows VAT-inclusive prices, divide by 1.15 and round to 2 decimals.
- One output line per quoted line item, in document order. Include delivery/handling charges as lines (empty sku). EXCLUDE subtotal, VAT and grand-total rows.
- sku is the supplier's product/stock code exactly as printed ("" when the line has none).
- qty is the quoted quantity (default 1 when not shown). unit is "ea" unless the document clearly sells per metre ("m"), pack, roll, etc.
- If a unit price is missing but a line total and qty are shown, unit_price_ex_vat = line total ÷ qty.
- quote_date is the document's date in YYYY-MM-DD, or null. reference is the supplier's quote number, or null. supplier is the issuing company's name, or null.

Output ONLY a single \`\`\`json code block, no preamble:
\`\`\`json
{
  "supplier": "Key Electric Wholesalers" ,
  "reference": "Q-48213",
  "quote_date": "2026-08-11",
  "lines": [
    { "sku": "CBI-QF13-63", "description": "CBI 63A 13mm DIN circuit breaker 1P 6kA", "qty": 4, "unit": "ea", "unit_price_ex_vat": 128.5 }
  ]
}
\`\`\``

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.replace(/[, ]/g, '')) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function sanitize(raw: unknown): ParsedSupplierQuote | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const linesRaw = Array.isArray(r.lines) ? r.lines : []
  const lines: ParsedSupplierQuoteLine[] = []
  for (const l of linesRaw) {
    if (!l || typeof l !== 'object') continue
    const lr = l as Record<string, unknown>
    const description = str(lr.description)
    if (!description) continue
    lines.push({
      sku: str(lr.sku),
      description,
      qty: num(lr.qty) || 1,
      unit: str(lr.unit) || 'ea',
      unit_price_ex_vat: Math.round(num(lr.unit_price_ex_vat) * 100) / 100,
    })
  }
  const date = str(r.quote_date)
  return {
    supplier: str(r.supplier) || null,
    reference: str(r.reference) || null,
    quote_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    lines,
  }
}

/**
 * AI fallback: extract lines from a scanned or photographed quote via Claude.
 * Only reached when the PDF table reader found nothing. Throws on failure.
 */
export async function parseSupplierQuoteDocument(
  bytes: Buffer,
  mimeType: string,
): Promise<ParsedSupplierQuote> {
  if (!aiParseAvailable()) throw new Error('AI parsing is not configured (no ANTHROPIC_API_KEY)')

  // Dynamic import so module load doesn't fail when no API key is present.
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const data = bytes.toString('base64')
  const media =
    mimeType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: (mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
            data,
          },
        }

  // Streamed — a long quote's JSON can run past the non-streaming timeout ceiling.
  const stream = anthropic.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 64000,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          media,
          { type: 'text', text: 'Extract the header details and every line item from this supplier quotation.' },
        ],
      },
    ],
  })
  const message = await stream.finalMessage()

  const text = message.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const fence = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!fence) throw new Error('Extraction returned no JSON block')

  let parsed: unknown
  try {
    parsed = JSON.parse(fence[1])
  } catch {
    throw new Error('Extraction returned invalid JSON')
  }
  const result = sanitize(parsed)
  if (!result) throw new Error('Extraction returned an unexpected shape')
  return result
}

/**
 * Case-insensitive SKU → equipment_catalog.id match for parsed lines.
 * Informational only — the quoted price stays authoritative for this quote.
 */
export async function matchSkusToCatalog(
  admin: SupabaseClient,
  skus: string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(skus.map((s) => s.trim()).filter(Boolean))]
  const map = new Map<string, string>()
  if (!wanted.length) return map
  // Exact .in() over raw + upper/lower variants covers case drift without a
  // per-line ilike round trip; resolve back case-insensitively.
  const variants = [...new Set(wanted.flatMap((s) => [s, s.toUpperCase(), s.toLowerCase()]))]
  const { data } = await admin
    .from('equipment_catalog')
    .select('id, sku')
    .in('sku', variants)
  const byLower = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.sku) byLower.set(String(row.sku).toLowerCase(), row.id as string)
  }
  for (const s of wanted) {
    const hit = byLower.get(s.toLowerCase())
    if (hit) map.set(s, hit)
  }
  return map
}

/**
 * Read a PDF's line items off its own text layout — no API key, no network.
 * Returns null when the file has no usable text layer (a scanned/photographed
 * quote) or when no table could be recognised on it.
 */
export async function tableParsePdf(bytes: Buffer): Promise<ParsedSupplierQuote | null> {
  if (!looksLikePdf(bytes)) return null
  let pages
  try {
    pages = await extractPdfTextPages(bytes)
  } catch {
    return null
  }
  const textRuns = pages.reduce((n, p) => n + p.items.length, 0)
  if (textRuns === 0) return null // image-only PDF (a scan)
  const parsed = parseSupplierQuotePages(pages)
  return parsed.lines.length > 0 ? parsed : null
}

/**
 * The extraction's own arithmetic check: our line total against the subtotal
 * the supplier printed. A mismatch means a line was misread — worth saying so
 * rather than letting a wrong cost travel into the BOM.
 */
function subtotalWarning(parsed: ParsedSupplierQuote): string | null {
  const stated = parsed.subtotal_ex_vat
  if (stated == null || stated <= 0) return null
  const ours = linesSubtotal(parsed.lines)
  if (Math.abs(ours - stated) <= Math.max(1, stated * 0.005)) return null
  const r = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `Check the lines: they add up to ${r(ours)} but the quote's subtotal is ${r(stated)} (ex VAT).`
}

/** Replace this supplier quote's lines with the extracted ones. */
async function storeLines(
  admin: SupabaseClient,
  supplierQuoteId: string,
  lines: ParsedSupplierQuoteLine[],
): Promise<boolean> {
  const skuMatches = await matchSkusToCatalog(admin, lines.map((l) => l.sku))
  // Replace-all: a re-parse must not duplicate lines from the previous run.
  await admin.from('supplier_quote_lines').delete().eq('supplier_quote_id', supplierQuoteId)
  const { error } = await admin.from('supplier_quote_lines').insert(
    lines.map((l, i) => ({
      supplier_quote_id: supplierQuoteId,
      line_no: i + 1,
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      unit_price_r: l.unit_price_ex_vat,
      catalog_id: l.sku ? (skuMatches.get(l.sku) ?? null) : null,
    })),
  )
  return !error
}

export interface ParseOutcome {
  ok: boolean
  error?: string
  /** Non-fatal note stored against the header (e.g. a subtotal mismatch). */
  warning?: string
  lineCount?: number
  method?: 'table' | 'ai'
}

/**
 * Download the stored document, extract lines, REPLACE any existing lines and
 * update the header. The PDF table reader runs first; Claude is only consulted
 * for scans/photos and only when a key is configured. On failure the header
 * goes to 'failed' with the reason recorded and existing lines are left
 * untouched (manual entry still works).
 */
export async function parseAndStoreLines(
  admin: SupabaseClient,
  supplierQuote: { id: string; storage_path: string | null; mime_type: string | null },
): Promise<ParseOutcome> {
  const fail = async (error: string): Promise<ParseOutcome> => {
    await admin
      .from('supplier_quotes')
      .update({ status: 'failed', parse_error: error })
      .eq('id', supplierQuote.id)
    return { ok: false, error }
  }

  if (!supplierQuote.storage_path) return fail('No document to parse — add lines manually')

  await admin
    .from('supplier_quotes')
    .update({ status: 'parsing', parse_error: null })
    .eq('id', supplierQuote.id)

  const { data: blob, error: dlErr } = await admin.storage
    .from(SUPPLIER_QUOTES_BUCKET)
    .download(supplierQuote.storage_path)
  if (dlErr || !blob) return fail('Could not read the stored document')
  const bytes = Buffer.from(await blob.arrayBuffer())

  let parsed = await tableParsePdf(bytes)
  let method: 'table' | 'ai' = 'table'

  if (!parsed) {
    // A scan, a photo, or a layout the table reader couldn't recognise.
    if (!aiParseAvailable()) {
      return fail(
        looksLikePdf(bytes)
          ? "Couldn't read a line-item table on this PDF — it may be a scan. Add the lines below, or upload the supplier's emailed PDF."
          : 'Photos of quotes have to be typed in — upload the PDF version to read it automatically, or add the lines below.',
      )
    }
    try {
      parsed = await parseSupplierQuoteDocument(bytes, supplierQuote.mime_type || 'application/pdf')
      method = 'ai'
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Extraction failed')
    }
  }
  if (parsed.lines.length === 0) return fail('No line items found on the document')

  if (!(await storeLines(admin, supplierQuote.id, parsed.lines))) {
    return fail('Could not save the extracted lines')
  }

  const warning = subtotalWarning(parsed)
  const header: Record<string, unknown> = {
    status: 'parsed',
    parse_error: warning,
    line_count: parsed.lines.length,
  }
  if (parsed.reference) header.reference = parsed.reference
  if (parsed.quote_date) header.quote_date = parsed.quote_date
  // Only fill supplier when the upload form left it blank — the typed name wins.
  const { data: current } = await admin
    .from('supplier_quotes')
    .select('supplier')
    .eq('id', supplierQuote.id)
    .single()
  if (parsed.supplier && !current?.supplier) header.supplier = parsed.supplier

  await admin.from('supplier_quotes').update(header).eq('id', supplierQuote.id)
  return { ok: true, lineCount: parsed.lines.length, method, warning: warning ?? undefined }
}
