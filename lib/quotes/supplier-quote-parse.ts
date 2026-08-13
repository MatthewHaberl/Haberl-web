// ─────────────────────────────────────────────────────────────────────────────
// Supplier-quote document extraction (W98) — server only.
//
// Sends the uploaded quote (PDF or photo) to Claude as a document/image content
// block and extracts structured line items. Same house pattern as the equipment
// research route: dynamic SDK import (module load survives a missing key) and a
// JSON-in-a-```json-fence output contract.
//
// Callers: app/api/quotes/[id]/supplier-quotes (upload) and .../[sqId]/parse
// (re-parse). Both go through parseAndStoreLines so the replace-lines +
// header-update behavior stays identical.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export const SUPPLIER_QUOTES_BUCKET = 'supplier-quotes'

export interface ParsedSupplierQuoteLine {
  sku: string
  description: string
  qty: number
  unit: string
  /** Supplier EX-VAT unit price (rands). */
  unit_price_ex_vat: number
}

export interface ParsedSupplierQuote {
  supplier: string | null
  reference: string | null
  /** ISO date (YYYY-MM-DD) or null. */
  quote_date: string | null
  lines: ParsedSupplierQuoteLine[]
}

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

/** Extract structured lines from a supplier quote document via Claude. Throws on failure. */
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
 * Download the stored document, extract lines, REPLACE any existing lines and
 * update the header. On failure the header goes to 'failed' with the error
 * recorded and existing lines are left untouched (manual entry still works).
 */
export async function parseAndStoreLines(
  admin: SupabaseClient,
  supplierQuote: { id: string; storage_path: string | null; mime_type: string | null },
): Promise<{ ok: boolean; error?: string; lineCount?: number }> {
  const fail = async (error: string) => {
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

  let parsed: ParsedSupplierQuote
  try {
    parsed = await parseSupplierQuoteDocument(
      Buffer.from(await blob.arrayBuffer()),
      supplierQuote.mime_type || 'application/pdf',
    )
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Extraction failed')
  }
  if (parsed.lines.length === 0) return fail('No line items found on the document')

  const skuMatches = await matchSkusToCatalog(admin, parsed.lines.map((l) => l.sku))

  // Replace-all: a re-parse must not duplicate lines from the previous run.
  await admin.from('supplier_quote_lines').delete().eq('supplier_quote_id', supplierQuote.id)
  const { error: insErr } = await admin.from('supplier_quote_lines').insert(
    parsed.lines.map((l, i) => ({
      supplier_quote_id: supplierQuote.id,
      line_no: i + 1,
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      unit_price_r: l.unit_price_ex_vat,
      catalog_id: l.sku ? (skuMatches.get(l.sku) ?? null) : null,
    })),
  )
  if (insErr) return fail('Could not save the extracted lines')

  const header: Record<string, unknown> = {
    status: 'parsed',
    parse_error: null,
    line_count: parsed.lines.length,
  }
  if (parsed.supplier) header.supplier = parsed.supplier
  if (parsed.reference) header.reference = parsed.reference
  if (parsed.quote_date) header.quote_date = parsed.quote_date
  // Only fill supplier when the upload form left it blank — the typed name wins.
  const { data: current } = await admin
    .from('supplier_quotes')
    .select('supplier')
    .eq('id', supplierQuote.id)
    .single()
  if (current?.supplier && parsed.supplier) delete header.supplier

  await admin.from('supplier_quotes').update(header).eq('id', supplierQuote.id)
  return { ok: true, lineCount: parsed.lines.length }
}
