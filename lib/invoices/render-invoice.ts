// ─────────────────────────────────────────────────────────────────────────────
// The customer's invoice — one standalone HTML document.
//
// Same house look as the quote (lib/quotes/render-scope-quote.ts): navy is
// spent twice and only twice, on the masthead and the amount due; everything
// else is hairlines, ink and greys, with Source Serif carrying the figures.
// A customer who has just read a Haberl quote should recognise this instantly.
//
// Self-contained on purpose. It is stored on the invoice row when the invoice
// is issued and served back verbatim from then on, so what the customer was
// billed cannot drift when the template does.
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import { escapeHtml } from '@/lib/utils'
import { formatCents, type InvoiceKind } from './invoice'

export interface InvoiceDocumentLine {
  description: string
  detail?: string | null
  qty: number
  unit?: string | null
  unitPriceCents: number
  amountCents: number
}

export interface InvoiceDocumentData {
  invoiceNumber: string
  kind: InvoiceKind
  issueDate: string
  dueDate: string | null
  billToName: string
  billToEmail?: string | null
  billToPhone?: string | null
  billToAddress?: string | null
  siteAddress?: string | null
  /** The quote this invoice bills against — the customer's own reference. */
  quoteNumber?: string | null
  workLabel?: string | null
  /**
   * Rendered as a preview of a draft. The number has not been allocated yet, so
   * anything that would otherwise print one says what will happen instead of
   * printing a placeholder where a reference belongs.
   */
  draft?: boolean
  lines: InvoiceDocumentLine[]
  totalCents: number
  amountPaidCents: number
  notes?: string | null
  terms?: string | null
  banking?: {
    bank?: string
    account_name?: string
    account_number?: string
    branch_code?: string
    account_type?: string
  } | null
  /** Contact block in the masthead. */
  company: {
    name: string
    phone: string
    email: string
    site: string
  }
}

const KIND_TITLE: Record<InvoiceKind, string> = {
  deposit: 'Deposit Invoice',
  progress: 'Progress Invoice',
  final: 'Final Invoice',
}

const dateZA = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const INVOICE_CSS = `
  :root {
    --ink:         #0f1b2d;
    --fg:          #1b2432;
    --muted-fg:    #6a7482;
    --rule:        #dfe3e9;
    --hairline:    #edeff2;
    --accent:      #e8850c;
    --accent-ink:  #a4600b;
    --accent-wash: #fdf6ec;
    --positive:    #15734a;
    --paper:       #ffffff;

    --serif: 'Source Serif 4', Georgia, 'Times New Roman', serif;
    --sans:  'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 14px; }
  body {
    font-family: var(--sans);
    font-size: 13px;
    color: var(--fg);
    background: var(--paper);
    line-height: 1.62;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page { max-width: 860px; margin: 0 auto; padding: 0 40px 56px; }

  /* ── Masthead — brand moment one of two ─────────────────────────────────── */
  .header {
    background: var(--ink);
    color: var(--paper);
    padding: 36px 40px 32px;
    margin: 0 -40px 36px;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 32px;
  }
  .logo-name { font-family: var(--serif); font-size: 25px; font-weight: 600; letter-spacing: 0.16em; line-height: 1; }
  .logo-name span { color: var(--accent); letter-spacing: 0; }
  .logo-sub {
    margin-top: 9px; font-size: 9.5px; font-weight: 500;
    letter-spacing: 0.26em; text-transform: uppercase; color: rgba(255,255,255,0.5);
  }
  .logo-contact { margin-top: 18px; display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: rgba(255,255,255,0.72); }

  .doc-meta { text-align: right; }
  .doc-kind {
    font-size: 9.5px; letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 7px;
  }
  .doc-number {
    font-family: var(--serif); font-size: 19px; font-weight: 600; letter-spacing: 0.04em;
    color: var(--paper); line-height: 1; padding-bottom: 11px;
    border-bottom: 1px solid rgba(232,133,12,0.65);
  }
  .doc-meta table { margin-top: 11px; border-collapse: collapse; }
  .doc-meta td { padding: 2.5px 0 2.5px 18px; font-size: 11.5px; color: rgba(255,255,255,0.82); }
  .doc-meta td:first-child {
    color: rgba(255,255,255,0.42); font-size: 9.5px; letter-spacing: 0.12em;
    text-transform: uppercase; text-align: right; padding-left: 0; padding-right: 10px;
  }

  /* ── Addressing ─────────────────────────────────────────────────────────── */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 34px; }
  .party-label {
    font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--muted-fg); padding-bottom: 7px; margin-bottom: 10px;
    border-bottom: 1px solid var(--rule);
  }
  .party-name { font-family: var(--serif); font-size: 16px; font-weight: 600; color: var(--ink); }
  .party-line { font-size: 12.5px; color: var(--muted-fg); }

  /* ── Lines — hairlines, never filled bars ───────────────────────────────── */
  .section-heading {
    font-family: var(--serif); font-size: 15px; font-weight: 600; color: var(--ink);
    letter-spacing: 0.02em; margin-bottom: 12px;
  }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines thead th {
    font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted-fg);
    text-align: left; font-weight: 500; padding: 0 0 9px; border-bottom: 1px solid var(--ink);
  }
  table.lines thead th.num, table.lines td.num { text-align: right; }
  table.lines tbody td { padding: 13px 0; border-bottom: 1px solid var(--hairline); vertical-align: top; font-size: 13px; }
  table.lines tbody td.num { font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 18px; }
  table.lines td.amount { font-family: var(--serif); font-size: 14.5px; font-weight: 600; color: var(--ink); }
  .line-detail { display: block; margin-top: 3px; font-size: 11.5px; color: var(--muted-fg); }
  .credit .amount { color: var(--positive); }

  /* ── The amount due — brand moment two of two ───────────────────────────── */
  .total-block { background: var(--ink); color: var(--paper); margin: 26px 0 0; padding: 20px 24px; }
  .total-block table { width: 100%; border-collapse: collapse; }
  .total-block td { padding: 4px 0; font-size: 12.5px; color: rgba(255,255,255,0.7); }
  .total-block td.num { text-align: right; font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.9); }
  .total-block tr.due td {
    padding-top: 13px; border-top: 1px solid rgba(232,133,12,0.5);
    font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.55);
  }
  .total-block tr.due td.num {
    font-family: var(--serif); font-size: 27px; font-weight: 600; letter-spacing: 0;
    text-transform: none; color: var(--paper); line-height: 1.15;
  }
  .paid-stamp {
    margin-top: 14px; display: inline-block; padding: 4px 12px;
    border: 1px solid var(--positive); color: var(--positive);
    font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
  }

  .vat-note { margin-top: 12px; font-size: 11.5px; color: var(--muted-fg); }

  /* ── Payment + terms ────────────────────────────────────────────────────── */
  .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 34px; }
  .panel-title {
    font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted-fg);
    padding-bottom: 7px; margin-bottom: 10px; border-bottom: 1px solid var(--rule);
  }
  table.kv { border-collapse: collapse; width: 100%; }
  table.kv td { padding: 3.5px 0; font-size: 12.5px; vertical-align: top; }
  table.kv td:first-child { color: var(--muted-fg); padding-right: 16px; white-space: nowrap; }
  table.kv td:last-child { font-weight: 500; color: var(--fg); }
  .reference {
    margin-top: 12px; border-left: 2px solid var(--accent); padding: 1px 0 1px 14px;
    font-size: 12px; color: var(--muted-fg);
  }
  .notes { margin-top: 30px; border-left: 2px solid var(--rule); padding: 1px 0 1px 14px; font-size: 12.5px; color: var(--fg); white-space: pre-wrap; }

  .footer {
    margin-top: 44px; padding-top: 16px; border-top: 1px solid var(--ink);
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    font-size: 11.5px; color: var(--muted-fg);
  }
  .footer strong { color: var(--ink); font-weight: 600; }
  .badge {
    font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent-ink); border: 1px solid var(--accent); padding: 3px 10px;
  }

  @media print {
    @page { size: A4; margin: 0; }
    body { font-size: 11.5px; }
    .page { max-width: none; padding: 0 34px 34px; }
    .header { margin: 0 -34px 28px; }
    .no-break { break-inside: avoid; }
  }
  @media (max-width: 640px) {
    .page { padding: 0 18px 40px; }
    .header { margin: 0 -18px 26px; padding: 26px 18px; flex-direction: column; gap: 20px; }
    .doc-meta { text-align: left; }
    .doc-meta td:first-child { text-align: left; }
    .parties, .panels { grid-template-columns: 1fr; gap: 22px; }
  }
`

function partyBlock(label: string, name: string, lines: (string | null | undefined)[]): string {
  const rest = lines
    .map((l) => (l ?? '').trim())
    .filter(Boolean)
    .map((l) => `<div class="party-line">${escapeHtml(l)}</div>`)
    .join('')
  return `<div>
      <div class="party-label">${escapeHtml(label)}</div>
      <div class="party-name">${escapeHtml(name)}</div>
      ${rest}
    </div>`
}

function lineRows(lines: InvoiceDocumentLine[]): string {
  return lines
    .map((l) => {
      const showQty = l.qty !== 1 || !!l.unit
      const qtyCell = showQty
        ? `${l.qty.toLocaleString('en-ZA', { maximumFractionDigits: 2 })}${l.unit ? ` ${escapeHtml(l.unit)}` : ''}`
        : '&mdash;'
      const rateCell = showQty ? formatCents(l.unitPriceCents) : '&mdash;'
      return `<tr${l.amountCents < 0 ? ' class="credit"' : ''}>
        <td>${escapeHtml(l.description)}${
          l.detail ? `<span class="line-detail">${escapeHtml(l.detail)}</span>` : ''
        }</td>
        <td class="num">${qtyCell}</td>
        <td class="num">${rateCell}</td>
        <td class="num amount">${formatCents(l.amountCents)}</td>
      </tr>`
    })
    .join('')
}

function bankingPanel(data: InvoiceDocumentData): string {
  const b = data.banking
  const row = (label: string, value: string | undefined) =>
    value ? `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>` : ''
  if (!b || !Object.values(b).some(Boolean)) {
    return `<div>
      <div class="panel-title">How to pay</div>
      <p class="party-line">Please contact us for payment details.</p>
    </div>`
  }
  return `<div>
      <div class="panel-title">How to pay</div>
      <table class="kv">
        ${row('Bank', b.bank)}
        ${row('Account name', b.account_name)}
        ${row('Account number', b.account_number)}
        ${row('Branch code', b.branch_code)}
        ${row('Account type', b.account_type)}
      </table>
      <div class="reference">
        ${
          data.draft
            ? 'The invoice number is allocated when this is issued &mdash; use it as your payment reference so we can match the money to your account straight away.'
            : `Use <strong>${escapeHtml(data.invoiceNumber)}</strong> as your payment reference so we can
        match it to your account straight away.`
        }
      </div>
    </div>`
}

function termsPanel(data: InvoiceDocumentData): string {
  const rows: string[] = []
  if (data.quoteNumber) rows.push(`<tr><td>Quote</td><td>${escapeHtml(data.quoteNumber)}</td></tr>`)
  if (data.workLabel) rows.push(`<tr><td>Work</td><td>${escapeHtml(data.workLabel)}</td></tr>`)
  rows.push(
    `<tr><td>Payment due</td><td>${
      data.dueDate ? escapeHtml(dateZA(data.dueDate)) : 'On receipt'
    }</td></tr>`,
  )
  if (data.siteAddress) rows.push(`<tr><td>Site</td><td>${escapeHtml(data.siteAddress)}</td></tr>`)
  return `<div>
      <div class="panel-title">Terms</div>
      <table class="kv">${rows.join('')}</table>
      ${data.terms ? `<div class="reference">${escapeHtml(data.terms)}</div>` : ''}
    </div>`
}

export function renderInvoice(data: InvoiceDocumentData): string {
  const due = data.totalCents - data.amountPaidCents
  const settled = due <= 0 && data.totalCents > 0

  const paidRow =
    data.amountPaidCents > 0
      ? `<tr><td>Received</td><td class="num">&minus;${formatCents(data.amountPaidCents)}</td></tr>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.invoiceNumber)} &mdash; Haberl Invoice</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
  <style>${INVOICE_CSS}</style>
</head>
<body>
<div class="page">

  <header class="header">
    <div class="logo-block">
      <div class="logo-name">HABERL<span>.</span></div>
      <div class="logo-sub">Electrical &amp; Solar</div>
      <div class="logo-contact">
        <span>${escapeHtml(data.company.phone)}</span>
        <span>${escapeHtml(data.company.email)}</span>
        <span>${escapeHtml(data.company.site)} &nbsp;&middot;&nbsp; Gauteng, South Africa</span>
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-kind">${escapeHtml(KIND_TITLE[data.kind])}</div>
      <div class="doc-number">${escapeHtml(data.invoiceNumber)}</div>
      <table>
        <tr><td>Issued</td><td>${escapeHtml(dateZA(data.issueDate))}</td></tr>
        <tr><td>Due</td><td>${data.dueDate ? escapeHtml(dateZA(data.dueDate)) : 'On receipt'}</td></tr>
        ${data.quoteNumber ? `<tr><td>Quote</td><td>${escapeHtml(data.quoteNumber)}</td></tr>` : ''}
      </table>
    </div>
  </header>

  <div class="parties no-break">
    ${partyBlock('Invoiced to', data.billToName, [data.billToAddress, data.billToEmail, data.billToPhone])}
    ${
      data.siteAddress && data.siteAddress !== data.billToAddress
        ? partyBlock('Work carried out at', data.siteAddress, [data.workLabel])
        : partyBlock('From', data.company.name, [data.company.phone, data.company.email, data.company.site])
    }
  </div>

  <div class="section-heading">What this invoice covers</div>
  <table class="lines">
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${lineRows(data.lines)}</tbody>
  </table>

  <div class="total-block no-break">
    <table>
      <tr><td>Invoice total</td><td class="num">${formatCents(data.totalCents)}</td></tr>
      ${paidRow}
      <tr class="due">
        <td>${settled ? 'Balance' : 'Amount due'}</td>
        <td class="num">${formatCents(Math.max(0, due))}</td>
      </tr>
    </table>
  </div>
  ${settled ? '<div class="paid-stamp">Paid in full &mdash; thank you</div>' : ''}
  <p class="vat-note">Haberl Electrical &amp; Solar is not VAT registered &mdash; no VAT is charged and none is recoverable on this invoice.</p>

  ${data.notes ? `<div class="notes">${escapeHtml(data.notes)}</div>` : ''}

  <div class="panels no-break">
    ${bankingPanel(data)}
    ${termsPanel(data)}
  </div>

  <footer class="footer">
    <div>
      <strong>${escapeHtml(data.company.name)}</strong> &nbsp;&middot;&nbsp;
      ${escapeHtml(data.company.phone)} &nbsp;&middot;&nbsp;
      ${escapeHtml(data.company.email)} &nbsp;&middot;&nbsp;
      ${escapeHtml(data.company.site)}
    </div>
    <div class="badge">SANS 10142 COMPLIANT</div>
  </footer>

</div>
</body>
</html>`
}
