// ─────────────────────────────────────────────────────────────────────────────
// Supplier quotes (W98) — shared types + pricing helpers for the "key quote"
// workflow: a supplier's quote uploaded against one quote_request, parsed into
// lines, and pulled into builder sections at the quoted price.
//
// Pricing convention (locked): supplier_quote_lines.unit_price_r is the
// supplier's EX-VAT price. Landed cost = × 1.15 (unrecoverable VAT) — the same
// basis equipment_supplier_offers uses — and sell = landed × markup.
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

export type SupplierQuoteStatus = 'uploaded' | 'parsing' | 'parsed' | 'failed' | 'manual'

export interface SupplierQuoteRow {
  id: string
  quote_request_id: string
  supplier: string
  reference: string | null
  quote_date: string | null
  source_filename: string | null
  storage_path: string | null
  mime_type: string | null
  status: SupplierQuoteStatus
  /** The RFQ this quote answers (W99), when it was sent from here. */
  rfq_id?: string | null
  parse_error: string | null
  line_count: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface SupplierQuoteLineRow {
  id: string
  supplier_quote_id: string
  line_no: number
  sku: string
  description: string
  qty: number
  unit: string
  /** Supplier EX-VAT unit price (rands). */
  unit_price_r: number
  catalog_id: string | null
  created_at: string
}

/** Unrecoverable input VAT folded into cost — same basis as the offer layer. */
export const UNRECOVERABLE_VAT = 1.15

const round2 = (n: number) => Math.round(n * 100) / 100

/** Landed unit cost (rands) from a supplier ex-VAT price. */
export function landedCostR(unitPriceExVatR: number): number {
  return round2(Math.max(0, unitPriceExVatR) * UNRECOVERABLE_VAT)
}

/** Sell price per unit: landed cost × markup (house rule). */
export function quotedSellR(unitPriceExVatR: number, markup: number): number {
  return round2(landedCostR(unitPriceExVatR) * markup)
}

// ── Extraction result shape (shared by the table reader and the AI fallback) ──

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
  /** The document's own ex-VAT subtotal, when it prints one (table reader only). */
  subtotal_ex_vat?: number | null
}
