// ─────────────────────────────────────────────────────────────────────────────
// The payslip document.
//
// Renders to a self-contained HTML string that the browser prints (and saves as
// PDF). That's the same route MaterialsPanel takes for picking lists — no PDF
// library, no server round-trip, and the output is whatever the person printing
// chose: A4, letter, or a real PDF via "Save as PDF".
//
// Pure module: no Supabase, no React. Every interpolated value is escaped —
// names and notes are user-typed and go straight into markup.
// ─────────────────────────────────────────────────────────────────────────────

import { escapeHtml } from '@/lib/utils'
import type { PayslipLine } from './pay'

export interface PayslipDocument {
  reference: string
  periodStart: string
  periodEnd: string
  issuedAt: string

  employeeName: string
  employeeNo: string | null
  jobTitle: string | null

  companyName: string
  companyEmail: string | null
  companyPhone: string | null

  lines: PayslipLine[]
  normalHours: number
  overtimeHours: number
  hoursPayR: number
  piecePayR: number
  otherPayR: number
  grossPayR: number
  deductionsR: number
  netPayR: number
  notes: string | null
}

const rand = (n: number) =>
  `R ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
    : iso
}

function lineRow(line: PayslipLine): string {
  const qty = line.unit === 'hr' ? `${line.qty.toFixed(2)} hr` : '—'
  const rate = line.unit === 'hr' ? `${rand(line.rateR)}/hr` : '—'
  const ref = line.jobRef ? `<div class="ref">${escapeHtml(line.jobRef)}</div>` : ''
  return `
    <tr>
      <td>${escapeHtml(shortDate(line.date))}</td>
      <td>${escapeHtml(line.description)}${ref}</td>
      <td class="num">${qty}</td>
      <td class="num">${rate}</td>
      <td class="num strong">${rand(line.amountR)}</td>
    </tr>`
}

/**
 * The printable payslip.
 *
 * `autoPrint` opens the browser's print dialog on load — used by the "Print /
 * save PDF" button, which writes this document into a popup. Left off, the same
 * markup is a plain preview.
 */
export function renderPayslipHtml(doc: PayslipDocument, opts: { autoPrint?: boolean } = {}): string {
  const rows = doc.lines.length
    ? doc.lines.map(lineRow).join('')
    : `<tr><td colspan="5" class="empty">No earnings recorded for this period.</td></tr>`

  const summaryRow = (label: string, value: string, cls = '') =>
    `<tr class="${cls}"><td>${escapeHtml(label)}</td><td class="num">${value}</td></tr>`

  // Deductions are printed as an explicit zero rather than hidden: a slip that
  // silently omits the line reads as if deductions were applied and came to
  // nothing. Saying so plainly is the honest version.
  const summary = [
    summaryRow('Hours worked', `${doc.normalHours.toFixed(2)} hr`),
    doc.overtimeHours > 0 ? summaryRow('Overtime', `${doc.overtimeHours.toFixed(2)} hr`) : '',
    summaryRow('Pay for hours', rand(doc.hoursPayR)),
    doc.piecePayR > 0 ? summaryRow('Job work', rand(doc.piecePayR)) : '',
    doc.otherPayR > 0 ? summaryRow('Bonuses & allowances', rand(doc.otherPayR)) : '',
    summaryRow('Gross pay', rand(doc.grossPayR), 'total'),
    summaryRow('Deductions', rand(doc.deductionsR)),
    summaryRow('Net pay', rand(doc.netPayR), 'net'),
  ]
    .filter(Boolean)
    .join('')

  const notes = doc.notes
    ? `<div class="notes"><strong>Notes</strong><br>${escapeHtml(doc.notes)}</div>`
    : ''

  const contact = [doc.companyPhone, doc.companyEmail].filter(Boolean).map(escapeHtml).join(' · ')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Payslip ${escapeHtml(doc.reference)} — ${escapeHtml(doc.employeeName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #14202e; margin: 0; padding: 24px; background: #fff; }
  .sheet { max-width: 760px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
           border-bottom: 2px solid #14202e; padding-bottom: 12px; margin-bottom: 18px; }
  .co { font-size: 17px; font-weight: bold; letter-spacing: .2px; }
  .co-sub { color: #5b6875; font-size: 11px; margin-top: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 20px; margin: 0; letter-spacing: 1px; text-transform: uppercase; }
  .doc-title .ref { font-family: monospace; color: #5b6875; margin-top: 3px; }

  .meta { display: flex; gap: 24px; margin-bottom: 18px; }
  .meta > div { flex: 1; border: 1px solid #d9dfe6; border-radius: 5px; padding: 10px 12px; }
  .meta h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #5b6875; margin: 0 0 6px; }
  .meta .big { font-size: 14px; font-weight: bold; }
  .meta .row { color: #3d4a58; margin-top: 2px; }

  table { width: 100%; border-collapse: collapse; }
  thead th { background: #f2f5f8; border-bottom: 1px solid #d9dfe6; text-align: left;
             font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #5b6875; padding: 7px 8px; }
  tbody td { border-bottom: 1px solid #eceff3; padding: 7px 8px; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.strong { font-weight: bold; }
  td.empty { text-align: center; color: #5b6875; padding: 20px; }
  .ref { color: #5b6875; font-size: 10px; margin-top: 2px; }

  .bottom { display: flex; gap: 24px; margin-top: 18px; align-items: flex-start; }
  .notes { flex: 1; border: 1px solid #d9dfe6; border-radius: 5px; padding: 10px 12px; color: #3d4a58; }
  .summary { width: 300px; margin-left: auto; }
  .summary table td { padding: 6px 8px; border-bottom: 1px solid #eceff3; }
  .summary tr.total td { border-top: 1px solid #14202e; font-weight: bold; }
  .summary tr.net td { background: #14202e; color: #fff; font-weight: bold; font-size: 14px; }

  footer { margin-top: 26px; border-top: 1px solid #d9dfe6; padding-top: 10px;
           color: #5b6875; font-size: 10px; line-height: 1.5; }
  .sign { display: flex; gap: 40px; margin-top: 30px; }
  .sign div { flex: 1; border-top: 1px solid #98a4b0; padding-top: 4px; color: #5b6875; font-size: 10px; }
  @media print { body { padding: 0; } .sheet { max-width: none; } }
</style></head>
<body><div class="sheet">
  <header>
    <div>
      <div class="co">${escapeHtml(doc.companyName)}</div>
      ${contact ? `<div class="co-sub">${contact}</div>` : ''}
    </div>
    <div class="doc-title">
      <h1>Payslip</h1>
      <div class="ref">${escapeHtml(doc.reference)}</div>
    </div>
  </header>

  <div class="meta">
    <div>
      <h2>Employee</h2>
      <div class="big">${escapeHtml(doc.employeeName)}</div>
      ${doc.jobTitle ? `<div class="row">${escapeHtml(doc.jobTitle)}</div>` : ''}
      ${doc.employeeNo ? `<div class="row">Employee no. ${escapeHtml(doc.employeeNo)}</div>` : ''}
    </div>
    <div>
      <h2>Pay period</h2>
      <div class="big">${escapeHtml(shortDate(doc.periodStart))} – ${escapeHtml(shortDate(doc.periodEnd))}</div>
      <div class="row">Issued ${escapeHtml(shortDate(doc.issuedAt))}</div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Date</th><th>Description</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="bottom">
    ${notes}
    <div class="summary"><table>${summary}</table></div>
  </div>

  <div class="sign">
    <div>Employee signature / date</div>
    <div>Employer signature / date</div>
  </div>

  <footer>
    This payslip reflects <strong>gross earnings</strong>. Statutory deductions (PAYE, UIF and SDL)
    are not calculated on this document. Keep it for your records.
  </footer>
</div>${opts.autoPrint ? '\n<script>window.onload = function () { window.print() }</script>' : ''}
</body></html>`
}
