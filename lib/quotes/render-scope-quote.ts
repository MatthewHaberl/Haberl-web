// ─────────────────────────────────────────────────────────────────────────────
// render-scope-quote — the customer-facing HTML for scope-engine quotes (W97).
//
// The scope sibling of lib/solar/render-quote.ts. Brand chrome (stylesheet,
// header, customer card, totals, deposit, terms, footer) is copied verbatim
// from the solar customer template rather than extracted — the solar renderer
// is the revenue path and stays untouched; a shared render-shell extraction is
// gated on the golden-file test (lib/quotes/__tests__/render-quote-golden) and
// deferred until it can be proven output-neutral.
//
// Matthew's locked format: grouped sections with subtotals — never per-part
// prices — which keeps the deposit-by-line-items rule intact.
//
// Pure string templating — no React, no Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import type { DepositItem, EquipmentPhoto, SupplierBomItem } from '@/lib/solar/render-quote'

export interface ScopeQuoteSectionView {
  name: string
  /** One-line description of what the section covers — no per-part prices. */
  detail: string
  subtotal: string
  subtotalRands: number
  /** Lines in this section still waiting on a supplier price. */
  toQuote: number
  /** True when this section is part of the deposit (holds material lines). */
  deposit: boolean
}

export interface ScopeOptionalExtraView {
  description: string
  qty: number
  /** Formatted amount, or 'Quote' when unpriced. */
  amount: string
}

export interface ScopeQuoteData {
  /** Discriminates a scope payload inside generated_quote. */
  type: 'scope'
  workType: string
  workTypeLabel: string
  quoteNumber: string
  dateIssued: string
  dateExpires: string
  customerName: string
  municipality: string
  customerPhone: string
  customerEmail: string
  siteAddress: string
  /** Customer-facing scope-of-works narrative. */
  summary: string
  sections: ScopeQuoteSectionView[]
  optionalExtras: ScopeOptionalExtraView[]
  exclusions: string[]
  cocIncluded: boolean
  quoteTotal: string
  quoteTotalRands: number
  depositTotal: string
  depositTotalRands: number
  balanceTotal: string
  depositItems: DepositItem[]
  /** Optional-stripped — job materials seed from this via extractBom(). */
  supplierBom: SupplierBomItem[]
  equipmentPhotos?: EquipmentPhoto[]
  needsPricing: number
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Copied verbatim from lib/solar/render-quote.ts BASE_CSS so scope and solar
// quotes are visually one family. Keep in sync until the render-shell
// extraction lands.
const SCOPE_CSS = `
  :root {
    --primary:      #0f1b2d;
    --accent:       #e8850c;
    --accent-fg:    #0f1b2d;
    --accent-light: #fdf3e7;
    --fg:           #14181f;
    --muted:        #f5f5f5;
    --muted-fg:     #5b6470;
    --border:       #e6e8ec;
    --white:        #ffffff;
    --success:      #16a34a;
    --row-alt:      #f8fafc;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 14px; }
  body {
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--fg);
    background: var(--white);
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 32px 48px;
  }

  .header {
    background: var(--primary);
    color: var(--white);
    padding: 32px;
    margin: 0 -32px 32px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
  }
  .logo-block { display: flex; flex-direction: column; gap: 2px; }
  .logo-name { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
  .logo-name span { color: var(--accent); }
  .logo-sub { font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.6); }
  .logo-contact { margin-top: 12px; display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: rgba(255,255,255,0.75); }
  .quote-meta { text-align: right; }
  .quote-meta .quo-number { font-size: 22px; font-weight: 700; color: var(--accent); line-height: 1; }
  .quote-meta table { margin-top: 8px; border-collapse: collapse; }
  .quote-meta td { padding: 2px 0 2px 16px; font-size: 12px; color: rgba(255,255,255,0.8); }
  .quote-meta td:first-child { color: rgba(255,255,255,0.5); text-align: right; padding-left: 0; padding-right: 8px; }

  .validity-bar {
    background: var(--accent-light);
    border: 1px solid #fed7aa;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 12.5px;
    color: #9a3412;
    margin-bottom: 28px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .validity-bar .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }

  .card { background: var(--white); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
  .card-header { background: var(--primary); color: var(--white); padding: 10px 18px; }
  .card-header h2 { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; }
  .card-body { padding: 0; }

  .info-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .info-table td { padding: 6px 12px; border-bottom: 1px solid var(--border); }
  .info-table tr:last-child td { border-bottom: none; }
  .info-table td:first-child { color: var(--muted-fg); width: 44%; font-size: 11.5px; }
  .info-table td:last-child { font-weight: 500; }

  .section-heading {
    font-size: 16px; font-weight: 700; color: var(--primary);
    margin: 28px 0 14px;
    display: flex; align-items: center; gap: 10px;
  }
  .section-heading::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .bom-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .bom-table thead tr { background: var(--muted); border-bottom: 1px solid var(--border); }
  .bom-table thead th { padding: 8px 12px; text-align: left; font-weight: 600; color: var(--muted-fg); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .bom-table thead th.right { text-align: right; }
  .bom-table tbody tr { border-bottom: 1px solid var(--border); }
  .bom-table tbody tr:last-child { border-bottom: none; }
  .bom-table tbody tr:nth-child(odd) { background: var(--row-alt); }
  .bom-table tbody tr:nth-child(even) { background: var(--white); }
  .bom-table td { padding: 7px 12px; vertical-align: top; }
  .bom-table td.right { text-align: right; }
  .bom-table .subtitle { font-size: 11px; color: var(--muted-fg); margin-top: 2px; }
  .bom-table .star { color: var(--accent); font-weight: 700; }

  .scope-summary { padding: 14px 18px; font-size: 13px; line-height: 1.7; white-space: pre-line; }

  .summary-block { background: var(--primary); border-radius: 12px; padding: 28px; color: var(--white); margin-bottom: 20px; }
  .summary-block h2 { font-size: 15px; font-weight: 700; margin-bottom: 16px; }
  .summary-lines { border-collapse: collapse; width: 100%; }
  .summary-lines td { padding: 5px 0; font-size: 13px; color: rgba(255,255,255,0.85); }
  .summary-lines td:last-child { text-align: right; font-weight: 500; }
  .summary-lines .total-row td { font-size: 20px; font-weight: 800; color: var(--white); padding-top: 12px; }
  .summary-lines .total-row td:last-child { color: var(--accent); }
  .vat-badge { display: inline-block; margin-top: 12px; background: rgba(255,255,255,0.1); border-radius: 20px; padding: 4px 12px; font-size: 11px; color: rgba(255,255,255,0.6); }

  .disclaimer-box { background: var(--muted); border-left: 4px solid var(--accent); border-radius: 4px; padding: 12px 16px; margin: 16px 0; font-size: 12px; color: var(--fg); line-height: 1.6; }

  .exclusions-list { padding: 14px 18px; }
  .exclusions-list ul { padding-left: 18px; }
  .exclusions-list li { font-size: 12.5px; color: var(--fg); margin-bottom: 5px; line-height: 1.5; }

  .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .terms-item { padding: 10px 18px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); font-size: 12px; }
  .terms-item:nth-child(2n) { border-right: none; }
  .terms-item:nth-child(n+5) { border-bottom: none; }
  .terms-item .t-label { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted-fg); margin-bottom: 3px; }

  .footer { border-top: 1px solid var(--border); margin-top: 36px; padding-top: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--muted-fg); }
  .footer strong { color: var(--primary); }
  .footer .badge { background: var(--primary); color: var(--white); border-radius: 4px; padding: 4px 10px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.5px; }

  .eq-photos { display: flex; flex-wrap: wrap; gap: 16px; }
  .eq-photo { width: 150px; text-align: center; }
  .eq-photo img { width: 100%; height: 110px; object-fit: contain; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
  .eq-photo-label { margin-top: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  .eq-photo-model { font-size: 12px; font-weight: 600; color: #111827; }

  @media print {
    @page { size: A4; margin: 0; }
    html { font-size: 12px; }
    body { padding: 0; }
    .page { padding: 20mm 20mm 20mm; max-width: 100%; }
    .header { margin: -20mm -20mm 24px; padding: 24px 20mm; }
    .no-break { page-break-inside: avoid; break-inside: avoid; }
  }

  @media screen {
    body { background: #e5e7eb; }
    .page { background: white; margin: 24px auto; box-shadow: 0 4px 32px rgba(0,0,0,0.10); border-radius: 4px; }
  }
`

function scopeSummarySection(data: ScopeQuoteData): string {
  if (!data.summary.trim()) return ''
  return `
  <div class="card no-break">
    <div class="card-header"><h2>Scope of Works</h2></div>
    <div class="card-body">
      <div class="scope-summary">${escapeHtml(data.summary.trim())}</div>
    </div>
  </div>`
}

function sectionsTable(data: ScopeQuoteData): string {
  if (data.sections.length === 0) return ''
  const rows = data.sections.map((s) => {
    const star = s.deposit ? ' <span class="star">&#9733;</span>' : ''
    const toQuote = s.toQuote > 0
      ? `<div class="subtitle">${s.toQuote} item${s.toQuote === 1 ? '' : 's'} to be priced separately &mdash; not in this subtotal</div>`
      : ''
    return `
        <tr>
          <td>
            <strong>${escapeHtml(s.name)}</strong>${star}
            ${s.detail ? `<div class="subtitle">${escapeHtml(s.detail)}</div>` : ''}${toQuote}
          </td>
          <td class="right">${escapeHtml(s.subtotal)}</td>
        </tr>`
  }).join('')
  return `
  <div class="section-heading">What&rsquo;s Included</div>

  <div class="card no-break">
    <div class="card-body">
      <table class="bom-table">
        <thead>
          <tr><th>Section</th><th class="right">Subtotal</th></tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
  </div>`
}

function optionalExtrasSection(data: ScopeQuoteData): string {
  if (data.optionalExtras.length === 0) return ''
  const rows = data.optionalExtras.map((x) => `
        <tr>
          <td>${escapeHtml(x.description)}</td>
          <td class="right">${x.qty}</td>
          <td class="right">${escapeHtml(x.amount)}</td>
        </tr>`).join('')
  return `
  <div class="card no-break">
    <div class="card-header"><h2>Optional Extras</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead>
          <tr><th>Item</th><th class="right">Qty</th><th class="right">Price</th></tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
      <div class="disclaimer-box">Optional extras are not included in the quote total &mdash; let us know if you&rsquo;d like any added and we&rsquo;ll send an updated quote.</div>
    </div>
  </div>`
}

function exclusionsSection(data: ScopeQuoteData): string {
  if (data.exclusions.length === 0) return ''
  const items = data.exclusions.map((e) => `<li>${escapeHtml(e)}</li>`).join('\n          ')
  return `
  <div class="card no-break">
    <div class="card-header"><h2>What&rsquo;s Not Included</h2></div>
    <div class="card-body">
      <div class="exclusions-list">
        <ul>
          ${items}
        </ul>
      </div>
    </div>
  </div>`
}

function photosSection(data: ScopeQuoteData): string {
  const photos = (data.equipmentPhotos ?? []).filter((p) => p.imageUrl)
  if (photos.length === 0) return ''
  const cards = photos.map((p) => `
        <div class="eq-photo">
          <img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.model)}" />
          <div class="eq-photo-label">${escapeHtml(p.label)}</div>
          <div class="eq-photo-model">${escapeHtml(p.model)}</div>
        </div>`).join('')
  return `
  <div class="card no-break">
    <div class="card-header"><h2>What You&rsquo;re Getting</h2></div>
    <div class="card-body" style="padding: 14px 18px;">
      <div class="eq-photos">${cards}
      </div>
    </div>
  </div>`
}

function needsPricingNote(data: ScopeQuoteData): string {
  if (data.needsPricing === 0) return ''
  return `
  <div class="disclaimer-box">
    ${data.needsPricing} item${data.needsPricing === 1 ? '' : 's'} in this scope still need${data.needsPricing === 1 ? 's' : ''} a supplier price and ${data.needsPricing === 1 ? 'is' : 'are'} not in the total &mdash; we&rsquo;ll confirm ${data.needsPricing === 1 ? 'it' : 'them'} before work starts.
  </div>`
}

export function renderScopeQuote(data: ScopeQuoteData): string {
  const cocTerm = data.cocIncluded
    ? 'Included &mdash; issued on completion of the work'
    : 'Not included in this quote'
  const depositCovers = data.depositItems.length
    ? `<tr><td>Deposit covers</td><td>${escapeHtml(data.depositItems.map((i) => i.name).join(', '))}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.quoteNumber)} &mdash; Haberl Quote</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>${SCOPE_CSS}</style>
</head>
<body>
<div class="page">

  <header class="header">
    <div class="logo-block">
      <div class="logo-name">HABERL<span>.</span></div>
      <div class="logo-sub">Electrical &amp; Solar</div>
      <div class="logo-contact">
        <span>+27 61 519 3016</span>
        <span>matthew@haberl.co.za</span>
        <span>haberl.co.za &nbsp;&middot;&nbsp; Gauteng, South Africa</span>
      </div>
    </div>
    <div class="quote-meta">
      <div class="quo-number">${escapeHtml(data.quoteNumber)}</div>
      <table>
        <tr><td>Date</td><td>${escapeHtml(data.dateIssued)}</td></tr>
        <tr><td>Valid until</td><td>${escapeHtml(data.dateExpires)}</td></tr>
        <tr><td>Customer</td><td>${escapeHtml(data.customerName)}</td></tr>
        <tr><td>Work</td><td>${escapeHtml(data.workTypeLabel)}</td></tr>
      </table>
    </div>
  </header>

  <div class="validity-bar">
    <div class="dot"></div>
    <span>This quote is valid until <strong>${escapeHtml(data.dateExpires)}</strong>. A deposit (marked &#9733;) is required to confirm the booking and order materials.</span>
  </div>

  <div class="two-col no-break">
    <div class="card">
      <div class="card-header"><h2>Customer</h2></div>
      <div class="card-body">
        <table class="info-table">
          <tr><td>Customer</td><td>${escapeHtml(data.customerName)}</td></tr>
          <tr><td>Phone</td><td>${escapeHtml(data.customerPhone)}</td></tr>
          <tr><td>Email</td><td>${escapeHtml(data.customerEmail)}</td></tr>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2>Site Details</h2></div>
      <div class="card-body">
        <table class="info-table">
          <tr><td>Address</td><td>${escapeHtml(data.siteAddress)}</td></tr>
          <tr><td>Municipality</td><td>${escapeHtml(data.municipality)}</td></tr>
          <tr><td>Type of work</td><td>${escapeHtml(data.workTypeLabel)}</td></tr>
        </table>
      </div>
    </div>
  </div>
${scopeSummarySection(data)}${sectionsTable(data)}${needsPricingNote(data)}${photosSection(data)}${optionalExtrasSection(data)}
  <div class="section-heading">Total Investment</div>

  <div class="summary-block no-break">
    <h2>Quote Total</h2>
    <table class="summary-lines">
      <tr class="total-row"><td>QUOTE TOTAL</td><td>${escapeHtml(data.quoteTotal)}</td></tr>
    </table>
    <div class="vat-badge">Haberl Electrical &amp; Solar does not add VAT &mdash; all prices inclusive</div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Deposit &amp; Payment</h2></div>
    <div class="card-body">
      <table class="info-table">
        <tr><td>Deposit required (&#9733; sections)</td><td><strong>${escapeHtml(data.depositTotal)}</strong></td></tr>
        ${depositCovers}
        <tr><td>Balance on completion</td><td>${escapeHtml(data.balanceTotal)}</td></tr>
        <tr><td>Quote total</td><td>${escapeHtml(data.quoteTotal)}</td></tr>
      </table>
    </div>
  </div>
${exclusionsSection(data)}
  <div class="card no-break">
    <div class="card-header"><h2>Terms &amp; Warranty</h2></div>
    <div class="card-body">
      <div class="terms-grid">
        <div class="terms-item"><div class="t-label">Quote Validity</div>Until ${escapeHtml(data.dateExpires)}</div>
        <div class="terms-item"><div class="t-label">Deposit</div>Required to confirm the booking and order materials (&#9733; sections)</div>
        <div class="terms-item"><div class="t-label">Balance Payment</div>Payable on completion of the work</div>
        <div class="terms-item"><div class="t-label">Certificate of Compliance</div>${cocTerm}</div>
        <div class="terms-item"><div class="t-label">Materials Warranty</div>Manufacturer warranty on supplied equipment</div>
        <div class="terms-item"><div class="t-label">Workmanship</div>SANS 10142 compliant workmanship</div>
      </div>
    </div>
  </div>

  <footer class="footer">
    <div>
      <strong>Haberl Electrical &amp; Solar</strong> &nbsp;&middot;&nbsp;
      +27 61 519 3016 &nbsp;&middot;&nbsp;
      matthew@haberl.co.za &nbsp;&middot;&nbsp;
      haberl.co.za
    </div>
    <div class="badge">SANS 10142 COMPLIANT</div>
  </footer>

</div>
</body>
</html>`
}
