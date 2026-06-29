// Shared types for the financial documents + cost-recharge ledger feature.
// The Supabase client in this app is untyped, so these describe the rows we
// read/write and back the UI. Mirrors migration 047_financial_documents.sql.

export type FinDocType =
  | 'supplier_invoice'
  | 'receipt'
  | 'sales_invoice'
  | 'pro_forma'
  | 'credit_note'
  | 'bank_statement'
  | 'other'

export const FIN_DOC_TYPES: { value: FinDocType; label: string }[] = [
  { value: 'supplier_invoice', label: 'Supplier invoice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'sales_invoice', label: 'Sales invoice (to customer)' },
  { value: 'pro_forma', label: 'Pro forma' },
  { value: 'credit_note', label: 'Credit note' },
  { value: 'bank_statement', label: 'Bank statement' },
  { value: 'other', label: 'Other' },
]

export const FIN_DOC_TYPE_LABEL = Object.fromEntries(
  FIN_DOC_TYPES.map((t) => [t.value, t.label]),
) as Record<FinDocType, string>

// When separate scans are folded into one multi-page PDF, the primary document
// carries this marker in its `notes` (pipe-separated flags). Single source of
// truth for writing it (merge route) and reading it (detail page + list).
export const COMBINED_MARKER_RE = /📎\s*Combined\s*—\s*(\d+)\s*pages?/i

/** Page count if the document is a combined multi-page scan, else null. */
export function parseCombinedPages(notes: string | null | undefined): number | null {
  if (!notes) return null
  for (const flag of notes.split('|')) {
    const m = flag.match(COMBINED_MARKER_RE)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

export type FinAllocation = 'unallocated' | 'customer' | 'company' | 'split'

export type FinOcrStatus = 'none' | 'pending' | 'done' | 'failed' | 'manual'

export interface FinDocument {
  id: string
  doc_type: FinDocType
  supplier_name: string | null
  doc_number: string | null
  doc_date: string | null
  currency: string
  total_cents: number | null
  vat_cents: number | null
  notes: string | null
  customer_id: string | null
  job_id: string | null
  file_url: string
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  visible_to_customer: boolean
  ocr_status: FinOcrStatus
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

// Joined shape used in the documents list.
export interface FinDocumentWithCustomer extends FinDocument {
  customer?: { id: string; full_name: string } | null
}

// What the bank import / OCR slices will read; defined here so the whole
// feature shares one source of truth.
export interface FinLineItem {
  id: string
  document_id: string
  line_no: number | null
  description: string
  qty: number
  unit_cost_cents: number
  line_total_cents: number
  vat_cents: number
  category: string | null
  allocation: FinAllocation
  customer_id: string | null
  job_id: string | null
  recharge_cents: number | null
  visible_to_customer: boolean
  notes: string | null
  created_at: string
  updated_at: string
}
