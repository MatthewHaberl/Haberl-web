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

/**
 * One work package on a combined quote — a job the customer could buy on its
 * own, shown with its own price beside the bundled one.
 */
export interface ScopeQuotePackageView {
  /** ScopePackage.id — what an acceptance of just this package records. */
  id: string
  name: string
  /** This package's own scope-of-works paragraph. */
  summary: string
  sections: ScopeQuoteSectionView[]
  /** What it costs bought on its own: its work, its visit, its CoC. */
  ownTotal: string
  ownTotalRands: number
  /** Deposit if this package alone is accepted — its material lines. */
  depositItems: DepositItem[]
  depositTotalRands: number
  /**
   * Job materials for a single-package acceptance. Held per package so the
   * accept route never has to guess which lines belong to it by matching
   * section names.
   */
  supplierBom: SupplierBomItem[]
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
  /**
   * How many sections the customer authored — i.e. could ask us to drop.
   * Labour and Compliance are excluded: they follow the work that remains.
   * Absent on quotes generated before W99; treated as "no choice to offer".
   */
  chooseableSections?: number
  /**
   * Work packages, when this quote combines several jobs. EMPTY on an ordinary
   * single-job quote, which renders exactly as it always has.
   */
  packages: ScopeQuotePackageView[]
  /** Sections billed across the whole job (labour, CoC) — no single package. */
  sharedSections: ScopeQuoteSectionView[]
  /** Every package bought separately. Only meaningful with packages. */
  separateTotal: string
  separateTotalRands: number
  /** What taking everything together saves. Zero when there is nothing to save. */
  bundleSaving: string
  bundleSavingRands: number
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
    /* One ink, one accent, one positive. Everything else is a grey. */
    --ink:          #0f1b2d;
    --fg:           #1b2432;
    --muted-fg:     #6a7482;
    --rule:         #dfe3e9;
    --hairline:     #edeff2;
    --accent:       #e8850c;   /* amber on ink grounds */
    --accent-ink:   #a4600b;   /* the same amber, readable on paper */
    --accent-wash:  #fdf6ec;
    --positive:     #15734a;
    --paper:        #ffffff;
    --surround:     #eceae6;

    --serif: 'Source Serif 4', Georgia, 'Times New Roman', serif;
    --sans:  'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

    /* Legacy aliases — older inline styles still reference these. */
    --primary: var(--ink);
    --border:  var(--rule);
    --white:   var(--paper);
    --muted:   #f6f7f9;
    --accent-light: var(--accent-wash);
    --accent-fg: var(--ink);
    --success: var(--positive);
    --row-alt: transparent;
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

  .page {
    max-width: 860px;
    margin: 0 auto;
    padding: 0 40px 56px;
  }

  /* ── Masthead — the one strong brand moment on the page ─────────────────── */
  .header {
    background: var(--ink);
    color: var(--paper);
    padding: 36px 40px 32px;
    margin: 0 -40px 36px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 32px;
  }
  .logo-block { display: flex; flex-direction: column; }
  .logo-name {
    font-family: var(--serif);
    font-size: 25px; font-weight: 600;
    letter-spacing: 0.16em; line-height: 1;
  }
  .logo-name span { color: var(--accent); letter-spacing: 0; }
  .logo-sub {
    margin-top: 9px;
    font-size: 9.5px; font-weight: 500;
    letter-spacing: 0.26em; text-transform: uppercase;
    color: rgba(255,255,255,0.5);
  }
  .logo-contact {
    margin-top: 18px; display: flex; flex-direction: column; gap: 3px;
    font-size: 11.5px; color: rgba(255,255,255,0.72);
  }

  .quote-meta { text-align: right; }
  .quote-meta .quo-number {
    font-family: var(--serif);
    font-size: 19px; font-weight: 600; letter-spacing: 0.04em;
    color: var(--paper); line-height: 1;
    padding-bottom: 11px;
    border-bottom: 1px solid rgba(232,133,12,0.65);
  }
  .quote-meta table { margin-top: 11px; border-collapse: collapse; }
  .quote-meta td { padding: 2.5px 0 2.5px 18px; font-size: 11.5px; color: rgba(255,255,255,0.82); }
  .quote-meta td:first-child {
    color: rgba(255,255,255,0.42);
    font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase;
    text-align: right; padding-left: 0; padding-right: 10px;
  }

  /* ── A note in the margin, not an alert component ───────────────────────── */
  .validity-bar {
    background: none;
    border: none;
    border-left: 2px solid var(--accent);
    border-radius: 0;
    padding: 1px 0 1px 15px;
    margin-bottom: 32px;
    font-size: 12px;
    color: var(--muted-fg);
    display: block;
  }
  .validity-bar strong { color: var(--fg); font-weight: 600; }
  .validity-bar .dot { display: none; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 30px; }

  /* ── Blocks — hairline-ruled, never filled ──────────────────────────────── */
  .card {
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 22px;
  }
  .card-header {
    background: none;
    color: var(--ink);
    padding: 13px 20px 11px;
    border-bottom: 1px solid var(--rule);
  }
  .card-header h2 {
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.15em; text-transform: uppercase;
    color: var(--ink);
  }
  .card-body { padding: 0; }

  .info-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .info-table td { padding: 9px 20px; border-bottom: 1px solid var(--hairline); }
  .info-table tr:last-child td { border-bottom: none; }
  .info-table td:first-child { color: var(--muted-fg); width: 42%; font-size: 11.5px; }
  .info-table td:last-child { font-weight: 500; color: var(--fg); font-variant-numeric: tabular-nums; }

  .section-heading {
    font-family: var(--serif);
    font-size: 19px; font-weight: 600; color: var(--ink);
    letter-spacing: -0.005em;
    margin: 40px 0 16px;
    display: flex; align-items: center; gap: 16px;
  }
  .section-heading::after { content: ''; flex: 1; height: 1px; background: var(--rule); }

  /* ── Tables — rules, not stripes ────────────────────────────────────────── */
  .bom-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .bom-table thead tr { background: none; border-bottom: 1px solid var(--ink); }
  .bom-table thead th {
    padding: 11px 20px 9px; text-align: left;
    font-weight: 600; color: var(--muted-fg);
    font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.13em;
  }
  .bom-table thead th.right { text-align: right; }
  .bom-table tbody tr { border-bottom: 1px solid var(--hairline); background: none; }
  .bom-table tbody tr:last-child { border-bottom: none; }
  .bom-table td { padding: 10px 20px; vertical-align: top; }
  .bom-table td.right, .bom-table th.right { text-align: right; font-variant-numeric: tabular-nums; }
  .bom-table .subtitle { font-size: 11px; color: var(--muted-fg); margin-top: 3px; line-height: 1.5; }
  .bom-table .star { color: var(--accent-ink); font-weight: 600; }
  .bom-table .subtotal-row { background: none; font-weight: 600; }
  .bom-table .subtotal-row td {
    color: var(--ink);
    border-top: 1px solid var(--ink);
    border-bottom: none;
    padding-top: 11px;
  }

  /* ── The number that matters ────────────────────────────────────────────── */
  .summary-block {
    background: var(--ink);
    border-radius: 3px;
    padding: 32px 34px;
    color: var(--paper);
    margin-bottom: 22px;
  }
  .summary-block h2 {
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.15em; text-transform: uppercase;
    color: rgba(255,255,255,0.5);
    margin-bottom: 6px;
  }
  .summary-lines { border-collapse: collapse; width: 100%; }
  .summary-lines td { padding: 6px 0; font-size: 13px; color: rgba(255,255,255,0.8); }
  .summary-lines td:last-child { text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; }
  .summary-lines .divider td { border-top: 1px solid rgba(255,255,255,0.16); padding-top: 12px; }
  .summary-lines .total-row td {
    font-family: var(--serif);
    font-size: 27px; font-weight: 600; letter-spacing: -0.01em;
    color: var(--paper);
    padding-top: 14px;
  }
  .summary-lines .total-row td:first-child {
    font-family: var(--sans);
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.15em; text-transform: uppercase;
    color: rgba(255,255,255,0.5);
    vertical-align: middle;
  }
  .summary-lines .total-row td:last-child { color: var(--accent); }
  .summary-lines .deposit-row td { font-size: 12.5px; color: rgba(255,255,255,0.62); }
  .vat-badge {
    display: block;
    margin-top: 18px; padding-top: 14px;
    border-top: 1px solid rgba(255,255,255,0.14);
    background: none; border-radius: 0;
    font-size: 11px; color: rgba(255,255,255,0.5);
  }

  /* ── Figures ────────────────────────────────────────────────────────────── */
  .roi-grid { display: grid; grid-template-columns: repeat(3, 1fr); }
  .roi-item { padding: 18px 20px 20px; border-right: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline); }
  .roi-item:nth-child(3n) { border-right: none; }
  .roi-item:nth-child(n+4) { border-bottom: none; }
  .roi-label { font-size: 9.5px; font-weight: 600; color: var(--muted-fg); text-transform: uppercase; letter-spacing: 0.13em; margin-bottom: 7px; }
  .roi-value { font-family: var(--serif); font-size: 23px; font-weight: 600; color: var(--ink); line-height: 1.15; font-variant-numeric: tabular-nums; }
  .roi-value.accent { color: var(--accent-ink); }
  .roi-sub { font-size: 11px; color: var(--muted-fg); margin-top: 5px; line-height: 1.45; }

  .disclaimer-box {
    background: var(--accent-wash);
    border: none; border-left: 2px solid var(--accent);
    border-radius: 0;
    padding: 13px 18px; margin: 16px 0;
    font-size: 12px; color: var(--fg); line-height: 1.6;
  }

  .exclusions-list { padding: 16px 20px 18px; }
  .exclusions-list ul { list-style: none; padding-left: 0; }
  .exclusions-list li {
    font-size: 12.5px; color: var(--fg);
    margin-bottom: 7px; padding-left: 18px;
    position: relative; line-height: 1.55;
  }
  .exclusions-list li::before {
    content: '—'; position: absolute; left: 0;
    color: var(--muted-fg);
  }
  .exclusions-list li:last-child { margin-bottom: 0; }

  .terms-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .terms-item {
    padding: 13px 20px;
    border-right: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
    font-size: 12px;
  }
  .terms-item:nth-child(2n) { border-right: none; }
  .terms-item:nth-child(n+5) { border-bottom: none; }
  .terms-item .t-label {
    font-size: 9.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.13em;
    color: var(--muted-fg); margin-bottom: 4px;
  }

  .footer {
    border-top: 1px solid var(--ink);
    margin-top: 48px; padding-top: 16px;
    display: flex; justify-content: space-between; align-items: baseline; gap: 24px;
    font-size: 11px; color: var(--muted-fg);
  }
  .footer strong { color: var(--ink); font-weight: 600; }
  .footer .badge {
    background: none; color: var(--muted-fg);
    border-radius: 0; padding: 0;
    font-size: 9.5px; font-weight: 600;
    letter-spacing: 0.13em; text-transform: uppercase;
    white-space: nowrap;
  }

  .eq-photos { display: flex; flex-wrap: wrap; gap: 22px; padding: 20px; }
  .eq-photo { width: 148px; }
  .eq-photo img { width: 100%; height: 108px; object-fit: contain; background: var(--paper); border: 1px solid var(--rule); border-radius: 2px; padding: 8px; }
  .eq-photo-label { margin-top: 9px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.13em; color: var(--muted-fg); font-weight: 600; }
  .eq-photo-model { font-size: 12px; font-weight: 500; color: var(--fg); margin-top: 2px; line-height: 1.4; }

  @media print {
    @page { size: A4; margin: 0; }
    html { font-size: 12px; }
    body { padding: 0; }
    .page { padding: 18mm 18mm 18mm; max-width: 100%; }
    .header { margin: -18mm -18mm 30px; padding: 26px 18mm; }
    .no-break { page-break-inside: avoid; break-inside: avoid; }
  }

  @media screen {
    body { background: var(--surround); }
    .page {
      background: var(--paper);
      margin: 28px auto;
      box-shadow: 0 1px 2px rgba(15,27,45,0.05), 0 14px 44px rgba(15,27,45,0.10);
      border-radius: 2px;
    }
  }

  /* ── Scope-only: the money column, section totals and their footnotes ───── */

  /* Money column: one width, one alignment, figures that line up down the page. */
  .bom-table th.right, .bom-table td.right { white-space: nowrap; }
  .bom-table .amount {
    width: 150px;
    font-weight: 600;
    font-size: 13px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  /* Every section table states its own total rather than leaving it to be added up. */
  .bom-table tfoot tr { background: none; }
  .bom-table tfoot tr:first-child td { border-top: 1px solid var(--ink); }
  .bom-table tfoot tr.pick td { background: var(--accent-wash); }
  .bom-table tfoot tr.pick td.amount { color: var(--accent-ink); font-size: 17px; }
  .bom-table tfoot td { padding: 12px 20px; font-weight: 600; font-size: 12.5px; color: var(--ink); }
  .bom-table tfoot td.amount { font-family: var(--serif); font-size: 16px; font-weight: 600; text-align: right; }
  .bom-table tfoot .foot-note {
    display: block; margin-top: 3px;
    font-family: var(--sans);
    font-size: 10.5px; font-weight: 400; letter-spacing: 0;
    text-transform: none; color: var(--muted-fg);
  }

  /* Intro paragraph above a section table (a package's own scope of works). */
  .lead {
    padding: 14px 20px 15px;
    border-bottom: 1px solid var(--hairline);
    font-size: 12.5px; line-height: 1.65; color: var(--muted-fg);
    white-space: pre-line;
  }

  /* The quiet footnote under a card — never louder than the table above it. */
  .card-note {
    padding: 12px 20px; border-top: 1px solid var(--hairline);
    font-size: 11.5px; line-height: 1.6; color: var(--muted-fg);
  }

  /* The standalone-price footnote: a stated figure, not a price buried in a sentence. */
  .own-price { padding: 12px 20px; border-top: 1px solid var(--hairline); }
  .own-price .op-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .own-price .op-label {
    font-size: 9.5px; font-weight: 600; letter-spacing: 0.13em;
    text-transform: uppercase; color: var(--muted-fg);
  }
  .own-price .op-value {
    font-family: var(--serif);
    font-size: 15px; font-weight: 600; color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
  .own-price .op-note { margin-top: 5px; font-size: 11.5px; line-height: 1.6; color: var(--muted-fg); }
  .own-price .op-note strong { color: var(--fg); font-weight: 600; }

  .scope-summary { padding: 16px 20px 18px; font-size: 13px; line-height: 1.7; white-space: pre-line; color: var(--fg); }

  /* Detailed quote: the section states its total, its items sit quietly beneath. */
  .bom-table.detailed .section-row td { padding-top: 16px; padding-bottom: 6px; border-bottom: none; }
  .bom-table.detailed tbody tr:first-child.section-row td { padding-top: 11px; }
  .bom-table .line-row td { border-bottom: none; padding-top: 3px; padding-bottom: 3px; font-size: 12px; color: var(--muted-fg); }
  .bom-table .line-row td:first-child { padding-left: 36px; }
  .bom-table .line-row td.amount { font-weight: 400; font-size: 12px; color: var(--muted-fg); }
  .bom-table .line-row.last-line td { padding-bottom: 13px; border-bottom: 1px solid var(--hairline); }
  .line-qty { color: var(--muted-fg); }
`

/**
 * Same formatting as lib/quotes/scope-quote's rand(). Totals shown on this
 * document are derived here from the *Rands figures rather than added as new
 * string fields, so a quote generated before these totals existed still
 * renders them.
 */
function rand(n: number): string {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function sumSubtotals(sections: ScopeQuoteSectionView[]): number {
  return Math.round(sections.reduce((t, s) => t + (s.subtotalRands || 0), 0) * 100) / 100
}

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

/** The section rows shared by the flat table and every package card. */
function sectionRows(sections: ScopeQuoteSectionView[]): string {
  return sections.map((s) => {
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
          <td class="right amount">${escapeHtml(s.subtotal)}</td>
        </tr>`
  }).join('')
}

/**
 * A section table that states its own total.
 *
 * The total is the figure a customer actually looks for, so it belongs in the
 * table as a footer row rather than being left for them to add up from the
 * rows above. `footLabel` and `footNote` are HTML — escape at the call site.
 */
function sectionTable(
  sections: ScopeQuoteSectionView[],
  footLabel: string,
  footAmount: string,
  footNote = '',
): string {
  if (sections.length === 0) return ''
  return `
      <table class="bom-table">
        <thead>
          <tr><th>Section</th><th class="right">Subtotal</th></tr>
        </thead>
        <tbody>${sectionRows(sections)}
        </tbody>
        <tfoot>
          <tr>
            <td>${footLabel}${footNote ? `<span class="foot-note">${footNote}</span>` : ''}</td>
            <td class="right amount">${escapeHtml(footAmount)}</td>
          </tr>
        </tfoot>
      </table>`
}

/**
 * The combined quote's "What's Included" — one card per work package, each with
 * its own sections and its own standalone price, then a final card for what is
 * billed once across the whole job (labour, CoC).
 */
function packagesTable(data: ScopeQuoteData): string {
  const hasShared = data.sharedSections.length > 0
  const ownVisit = data.cocIncluded ? 'its own site visit and certificate' : 'its own site visit'

  const cards = data.packages.map((pkg, i) => {
    // What this work adds to THIS quote — its sections, before the costs the
    // whole job shares. The standalone price sits below it as a comparison,
    // stated as a figure rather than buried in a sentence.
    const included = sumSubtotals(pkg.sections)
    const premium = Math.round((pkg.ownTotalRands - included) * 100) / 100
    const note = premium > 0
      ? `<strong>${escapeHtml(rand(premium))} more</strong> than the subtotal above: on its own this job
         carries ${ownVisit}. Done with the rest of the work, that is shared &mdash; which is the whole
         reason the combined price is lower.`
      : `On its own this job carries ${ownVisit}. Done with the rest of the work, that is shared.`
    return `
  <div class="card no-break">
    <div class="card-header"><h2>${i + 1}. ${escapeHtml(pkg.name)}</h2></div>
    <div class="card-body">
      ${pkg.summary ? `<p class="lead">${escapeHtml(pkg.summary)}</p>` : ''}
      ${sectionTable(
        pkg.sections,
        `Subtotal &mdash; ${escapeHtml(pkg.name)}`,
        rand(included),
        hasShared ? 'in this quote, before the costs shared across the job' : 'in this quote',
      )}
      <div class="own-price">
        <div class="op-row">
          <span class="op-label">If done on its own</span>
          <span class="op-value">${escapeHtml(pkg.ownTotal)}</span>
        </div>
        <p class="op-note">${note}</p>
      </div>
    </div>
  </div>`
  }).join('')

  const shared = !hasShared ? '' : `
  <div class="card no-break">
    <div class="card-header"><h2>Across all of the work</h2></div>
    <div class="card-body">
      ${sectionTable(
        data.sharedSections,
        'Subtotal &mdash; shared across the job',
        rand(sumSubtotals(data.sharedSections)),
        'charged once, not once per item of work',
      )}
      <div class="card-note">These follow the job, not any one part of it: one visit, one team on site${
        data.cocIncluded ? ', one certificate' : ''}.</div>
    </div>
  </div>`

  return `
  <div class="section-heading">What&rsquo;s Included</div>
${cards}${shared}`
}

/**
 * The choice, stated plainly: each job's own price, then the price for all of
 * it. Printed only when there is genuinely something to save — a bundle that
 * costs the same as the parts has no offer to make and must not imply one.
 */
function bundleChoiceSection(data: ScopeQuoteData): string {
  if (data.packages.length < 2 || data.bundleSavingRands <= 0) return ''
  const rows = data.packages.map((p, i) => `
        <tr>
          <td>${i + 1}. ${escapeHtml(p.name)} <span class="subtitle">on its own</span></td>
          <td class="right amount">${escapeHtml(p.ownTotal)}</td>
        </tr>`).join('')
  return `
  <div class="section-heading">Your Options</div>

  <div class="card no-break">
    <div class="card-body">
      <table class="bom-table">
        <thead>
          <tr><th>Option</th><th class="right">Price</th></tr>
        </thead>
        <tbody>${rows}
        </tbody>
        <tfoot>
        <tr>
          <td>Each of them separately<span class="foot-note">every job booked on its own</span></td>
          <td class="right amount">${escapeHtml(data.separateTotal)}</td>
        </tr>
        <tr class="pick">
          <td>All of it together<span class="foot-note">one booking, one team on site &mdash; you save ${escapeHtml(data.bundleSaving)}</span></td>
          <td class="right amount">${escapeHtml(data.quoteTotal)}</td>
        </tr>
        </tfoot>
      </table>
      <div class="disclaimer-box">
        Doing everything in one visit means one set-up, one team on site and one certificate, which is
        where the ${escapeHtml(data.bundleSaving)} comes from. The quote total below is the combined
        price. Happy to do any part on its own at the price shown &mdash; just say which.
      </div>
    </div>
  </div>`
}

function sectionsTable(data: ScopeQuoteData): string {
  if (data.packages.length > 0) return packagesTable(data)
  if (data.sections.length === 0) return ''
  // The sections ARE the whole quote here, so their total is the quote total —
  // stated in the table so nobody has to add the subtotals up by hand.
  return `
  <div class="section-heading">What&rsquo;s Included</div>

  <div class="card no-break">
    <div class="card-body">
      ${sectionTable(data.sections, 'Quote total', data.quoteTotal)}
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

/**
 * "Taking All of It, or Part of It" — the quote's own instructions for buying
 * less than the whole thing.
 *
 * Customers routinely want two of the three jobs, or the board but not the
 * lights, and with no wording for it they either ask for a whole new quote or
 * go quiet. This says the answer out loud.
 *
 * Two honest shapes, because the accept page only offers what the scope really
 * supports (see PublicQuoteActions):
 *   packages  — everything, or ONE package on its own, both a real button.
 *   sections  — everything is the button; a subset is a conversation, so it
 *               says so rather than implying a checkbox that isn't there.
 * Either way it refuses to imply that section subtotals subtract cleanly: the
 * visit, the set-up and the certificate are charged once, so what is left costs
 * more than the arithmetic. Nothing to choose between (one section, no
 * packages) prints nothing.
 */
function takeAllOrPartSection(data: ScopeQuoteData): string {
  const hasPackages = data.packages.length >= 2
  if (!hasPackages && (data.chooseableSections ?? 0) < 2) return ''

  const partItem = hasPackages
    ? `<div class="terms-item">
          <div class="t-label">Or just one part</div>
          Take any one of the numbered items of work above on its own, at the price shown with it.
          The accept page lets you pick it &mdash; the deposit and the balance then follow that part alone.
        </div>`
    : `<div class="terms-item">
          <div class="t-label">Or only some of it</div>
          Tell us which sections you&rsquo;d like done and we&rsquo;ll re-issue this quote with only those in it.
          Accepting online accepts the whole quote, so let us know before you accept.
        </div>`

  const mixItem = hasPackages
    ? `<div class="terms-item">
          <div class="t-label">Or a different combination</div>
          Two of them but not the third, or one with a section left out &mdash; reply to this quote or
          call us and we&rsquo;ll send a new one priced for exactly that.
        </div>`
    : ''

  return `
  <div class="card no-break">
    <div class="card-header"><h2>Taking All of It, or Part of It</h2></div>
    <div class="card-body">
      <div class="terms-grid">
        <div class="terms-item">
          <div class="t-label">All of it</div>
          Accept the quote as it stands at <strong>${escapeHtml(data.quoteTotal)}</strong>.
          One booking, one team on site${data.cocIncluded ? ', one certificate' : ''}.
        </div>
        ${partItem}
        ${mixItem}
      </div>
      <div class="disclaimer-box">
        Leaving work out doesn&rsquo;t simply subtract its subtotal: ${data.cocIncluded
          ? 'getting to site, setting up and issuing the certificate are'
          : 'getting to site and setting up are'} charged once for the visit, so a smaller job carries a
        larger share of them. That&rsquo;s why we re-price rather than cross lines out &mdash; the new figure
        is always confirmed with you in writing before anything starts.
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
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
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
${scopeSummarySection(data)}${sectionsTable(data)}${needsPricingNote(data)}${photosSection(data)}${optionalExtrasSection(data)}${bundleChoiceSection(data)}
  <div class="section-heading">Total Investment</div>

  <div class="summary-block no-break">
    <table class="summary-lines">
      <tr class="total-row"><td>Quote total</td><td>${escapeHtml(data.quoteTotal)}</td></tr>
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
${takeAllOrPartSection(data)}${exclusionsSection(data)}
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
