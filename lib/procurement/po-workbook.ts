import { buildGenericWorkbook, type WorkbookCell } from '@/lib/solar/export-quote-workbook'
import type { PurchaseOrder, PurchaseOrderLine, Supplier } from '@/types/database'

/** Supplier-facing PO workbook: cost prices only — sell prices never leave. */
export function buildPoWorkbook(po: PurchaseOrder, lines: PurchaseOrderLine[], supplier: Supplier | null) {
  const rows: WorkbookCell[][] = [
    [`Purchase Order ${po.po_number}`],
    ['From', 'Haberl Electrical & Solar'],
    ['To', supplier?.name ?? ''],
    ...(supplier?.contact_person ? [['Attention', supplier.contact_person] as WorkbookCell[]] : []),
    ['Date', new Date(po.created_at).toLocaleDateString('en-ZA')],
    ...(po.expected_date ? [['Required by', new Date(po.expected_date).toLocaleDateString('en-ZA')] as WorkbookCell[]] : []),
    ...(po.notes ? [['Notes', po.notes] as WorkbookCell[]] : []),
    [],
    ['SKU', 'Description', 'Qty', 'Unit Price (R)', 'Line Total (R)'],
    ...lines.map((line) => [
      line.sku,
      line.description,
      line.qty_ordered,
      line.unit_cost_cents / 100,
      Math.round(line.qty_ordered * line.unit_cost_cents) / 100,
    ] as WorkbookCell[]),
    [],
    ['', '', '', 'Total',
      Math.round(lines.reduce((sum, line) => sum + line.qty_ordered * line.unit_cost_cents, 0)) / 100],
  ]

  return buildGenericWorkbook(`${po.po_number}-${supplier?.name ?? 'supplier'}`, [
    { name: 'Purchase Order', rows },
  ])
}
