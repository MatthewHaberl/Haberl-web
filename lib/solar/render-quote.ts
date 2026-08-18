// Pure HTML-string builder — no React, no browser APIs, no 'use client'. The
// directive used to sit here, which made it unimportable from a server
// component (the staff quote preview renders on the server); client callers
// like DesignWorkspace still bundle it fine without it.

import type { ComplianceCheck } from './compliance'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DepositItem {
  name: string
  amountRands: number
}

export interface SupplierBomItem {
  section: string
  sku: string
  description: string
  quantity: number
  unitCostRands: number
  unitSellRands: number
  lineCostRands: number
  lineSellRands: number
}

/** One picture of one piece of kit on the customer quote (W53). */
/**
 * One line of the itemised breakdown on a DETAILED quote (migration 124).
 * Sell prices only — cost and markup never leave the office.
 */
export interface DetailedBomLine {
  description: string
  qty: number
  /** Formatted unit price, or '' when the line is still to be priced. */
  unit: string
  /** Formatted line total, or 'Quote' when unpriced. */
  amount: string
}

export interface DetailedBomSection {
  name: string
  subtotal: string
  lines: DetailedBomLine[]
}

export interface EquipmentPhoto {
  /** What it is — "Inverter", "Battery", "Solar panels". */
  label: string
  /** What model it is, as the customer should read it. */
  model: string
  imageUrl: string
}

export interface MonthlyGenRow {
  month: string
  solarGenKwh: number
  consumptionKwh: number
  importedKwh: number
  energyFromSolarPct: number
  billBefore: string
  billAfter: string
  saving: string
}

export interface TwentyYearRow {
  year: string
  consumptionKwh: string
  solarGenKwh: string
  billBefore: string
  billAfter: string
  annualSaving: string
  cumulativeImpact: string
}

export interface QuoteSizingInputs {
  inverterQty: number
  batteryQty: number
  targetInverterKw: number
  minimumBatteryKwh: number
  targetPanelCount: number
}

export interface QuoteData {
  // Header
  quoteNumber: string
  dateIssued: string
  dateExpires: string
  customerName: string
  municipality: string

  // Customer card
  customerPhone: string
  customerEmail: string
  siteAddress: string
  monthlyUsageKwh: string

  // System overview
  systemType: string
  inverterModel: string
  inverterKw: string
  batteryModel: string
  batteryKwh: string
  panelCount: string
  panelModel: string
  totalKwp: string
  monthlyGenKwh: string

  // BOM — Panels & Mounting
  panelCost: string
  panelMountingConsumables: string
  panelMountingSubtotal: string

  // BOM — Cables & Connectors
  cablesCost: string
  cablesSubtotal: string

  // BOM — DC Protection
  dcCombinerConfig: string
  dcCombinerCost: string
  dcProtectionSubtotal: string

  // BOM — Inverter & Battery System
  inverterQty: string
  inverterCost: string
  batteryQty: string
  batteryCost: string
  batteryAccessoriesCost: string
  inverterBatterySubtotal: string

  // BOM — AC & DB Protection
  acDbCost: string
  acDbSubtotal: string

  // BOM — Earthing System
  earthingSpikeCount: string
  earthingCost: string
  earthingSubtotal: string

  // BOM — Consumables & Compliance (includes R1,500 COC)
  consumablesCost: string
  consumablesSubtotal: string

  // BOM — Labour
  labourCost: string
  labourSubtotal: string

  // Totals (formatted strings for template)
  materialsLabourSubtotal: string
  quoteTotal: string
  depositTotal: string
  balanceTotal: string

  // Totals as raw rands (for DepositSelector calculations)
  quoteTotalRands: number
  depositTotalRands: number

  // ROI — legacy short form
  annualOffsetPercent: string
  monthlySavingR: string
  tariffRate: string
  annualSavingR: string
  paybackMonths: string
  paybackYears: string
  paybackMonthsEscalated: string

  // Deposit line items
  depositItems: DepositItem[]

  // Supplier-facing itemized BOM
  supplierBom?: SupplierBomItem[]

  // Product photography for the customer's "What you're getting" panel (W53).
  equipmentPhotos?: EquipmentPhoto[]

  /**
   * Every part and task behind the summarised sections above, priced one line
   * at a time (migration 124). Present only when the quote is set to
   * 'detailed'; absent is the simplified document, which is the default and
   * what every quote before W100 carries.
   */
  detailedSections?: DetailedBomSection[]

  // SANS 10142-1 / design-rule verification results (internal — admin only)
  complianceChecks?: ComplianceCheck[]
  calculationWarnings?: string[]

  // Monthly generation table (optional — new format)
  monthlyGenTable?: MonthlyGenRow[]
  annualSolarGenKwh?: string
  annualConsumptionKwh?: string
  annualGridOffsetPct?: string

  // 20-year financial model (optional — new format)
  lifetimeBillSavings?: string
  netSystemCost?: string
  estimatedNetSavings?: string
  npv?: string
  roi?: string
  annualReturnRate?: string
  twentyYearTable?: TwentyYearRow[]
  sizingInputs?: QuoteSizingInputs

  // SLD Diagram Component Configurations (optional — new format)
  // Stores detailed component specs from the enhanced diagram editor
  components_config?: Record<string, unknown> // ComponentsConfigData JSON
  cable_details?: Record<string, unknown> // CableDetailsData JSON
  diagram_state?: Record<string, unknown> // DiagramState JSON

  // Additional component costs derived from diagram (added to BOM)
  extraLugsCost?: string
  mountingCost?: string

  // EV Charger add-on (present when ev_charger is selected in the survey)
  evChargerKw?: string       // e.g., "7kW"
  evChargerCost?: string     // formatted section subtotal
  evChargerSubtotal?: string // same as evChargerCost — used in template summary row
}

// ── Multi-option types ────────────────────────────────────────────────────────

export interface OptionQuoteData extends QuoteData {
  tier: 'premium' | 'recommended' | 'budget'
  tierLabel: string
  recommended?: boolean
}

export interface ComparisonRow {
  label: string
  premium: string
  recommended: string
  budget: string
}

export interface MultiOptionQuoteData {
  type: 'multi-option'
  quoteNumber: string
  dateIssued: string
  dateExpires: string
  customerName: string
  municipality: string
  customerPhone: string
  customerEmail: string
  siteAddress: string
  monthlyUsageKwh: string
  comparisonTable: ComparisonRow[]
  options: OptionQuoteData[]
}

export type AnyQuoteData = QuoteData | MultiOptionQuoteData

// ── JSON extractor ────────────────────────────────────────────────────────────

export function extractQuoteJson(text: string): AnyQuoteData | null {
  const trimmed = text.trim()

  // Try ```json ... ``` block first
  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1]) } catch { /* fall through */ }
  }

  // Try entire text as JSON
  try { return JSON.parse(trimmed) } catch { return null }
}

export function isMultiOption(data: AnyQuoteData): data is MultiOptionQuoteData {
  return (data as MultiOptionQuoteData).type === 'multi-option'
}

// ── Main render dispatcher ────────────────────────────────────────────────────

export function renderQuote(data: AnyQuoteData): string {
  if (isMultiOption(data)) return renderMultiOptionQuote(data)
  return renderSimplifiedQuote(data as QuoteData)
}

// Keep for backward compatibility
export function renderSimplifiedQuote(data: QuoteData): string {
  return renderSingleOptionHtml(data)
}

// Customer-facing summary (no BOM line items — just system overview, price, ROI)
export function renderCustomerQuote(data: AnyQuoteData): string {
  if (isMultiOption(data)) return renderMultiOptionCustomerQuote(data)
  return renderCustomerSingleHtml(data as QuoteData)
}

// ── Single-option renderer ────────────────────────────────────────────────────

/**
 * HTML-escape an interpolated value. Several quote fields (customerName,
 * siteAddress, municipality, customerEmail) are user-supplied — via the public
 * lead form among others — and end up in quote_html, which the Print/PDF button
 * writes into a live document. Without escaping, a `<script>` smuggled into a
 * name would execute in the app origin. Escape at every interpolation point.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function val(data: Record<string, unknown>, key: string): string {
  const v = data[key]
  // Missing keys keep the {{key}} placeholder so the section injectors that run
  // after this pass (MONTHLY_GEN_SECTION, TWENTY_YEAR_SECTION, …) still match.
  return v !== undefined && v !== null ? escapeHtml(v) : `{{${key}}}`
}

function renderSingleOptionHtml(data: QuoteData, tierLabel?: string): string {
  const d = data as unknown as Record<string, unknown>
  let html = SINGLE_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, key: string) => val(d, key))

  // Inject tier badge if part of multi-option
  if (tierLabel) {
    html = html.replace('{{TIER_BADGE}}', `<div class="tier-badge">${escapeHtml(tierLabel)}</div>`)
  } else {
    html = html.replace('{{TIER_BADGE}}', '')
  }

  // Inject monthly generation table if data exists
  if (data.monthlyGenTable?.length) {
    html = html.replace('{{MONTHLY_GEN_SECTION}}', renderMonthlyGenSection(data))
  } else {
    html = html.replace('{{MONTHLY_GEN_SECTION}}', '')
  }

  // Inject 20-year financial if data exists
  if (data.twentyYearTable?.length) {
    html = html.replace('{{TWENTY_YEAR_SECTION}}', renderTwentyYearSection(data))
  } else {
    html = html.replace('{{TWENTY_YEAR_SECTION}}', '')
  }

  // Inject EV charger section if present
  if (data.evChargerKw && data.evChargerCost) {
    html = html.replace('{{EV_CHARGER_SECTION}}', renderEvChargerSection(data))
    html = html.replace('{{EV_CHARGER_SUMMARY_ROW}}', `<tr><td>EV Charger (${data.evChargerKw})</td><td>${data.evChargerCost}</td></tr>`)
  } else {
    html = html.replace('{{EV_CHARGER_SECTION}}', '')
    html = html.replace('{{EV_CHARGER_SUMMARY_ROW}}', '')
  }

  return html
}

// ── Multi-option renderer ─────────────────────────────────────────────────────

function renderMultiOptionQuote(data: MultiOptionQuoteData): string {
  const comparisonRows = (data.comparisonTable ?? []).map(row => `
    <tr>
      <td class="comp-label">${escapeHtml(row.label)}</td>
      <td class="comp-cell">${escapeHtml(row.premium)}</td>
      <td class="comp-cell comp-recommended">${escapeHtml(row.recommended)}</td>
      <td class="comp-cell">${escapeHtml(row.budget)}</td>
    </tr>`).join('')

  // Merge top-level header fields into each option — the agent puts shared fields
  // (quoteNumber, customerName, etc.) at the top level, not inside each option.
  const optionSections = data.options.map(opt => {
    const isRec = opt.tier === 'recommended'
    // Option objects only carry equipment fields — header/customer fields live at the
    // top level of the multi-option structure. Merge them in with ?? so option-specific
    // values still win when present.
    const merged: OptionQuoteData = {
      ...opt,
      quoteNumber:     opt.quoteNumber     ?? data.quoteNumber,
      dateIssued:      opt.dateIssued      ?? data.dateIssued,
      dateExpires:     opt.dateExpires     ?? data.dateExpires,
      customerName:    opt.customerName    ?? data.customerName,
      municipality:    opt.municipality    ?? data.municipality,
      customerPhone:   opt.customerPhone   ?? data.customerPhone,
      customerEmail:   opt.customerEmail   ?? data.customerEmail,
      siteAddress:     opt.siteAddress     ?? data.siteAddress,
      monthlyUsageKwh: opt.monthlyUsageKwh ?? data.monthlyUsageKwh,
    }
    return `
    <div class="option-wrapper${isRec ? ' option-recommended' : ''}">
      ${isRec ? '<div class="rec-ribbon">Our Recommendation</div>' : ''}
      ${renderSingleOptionHtml(merged, opt.tierLabel)}
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.quoteNumber)} — Haberl Solar Proposal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
  <style>
    ${BASE_CSS}

    .option-wrapper { margin-bottom: 48px; }
    .option-recommended { border: 3px solid var(--accent); border-radius: 12px; padding: 0; overflow: hidden; position: relative; }
    .rec-ribbon {
      background: var(--accent); color: var(--accent-fg); text-align: center;
      font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      padding: 6px 0;
    }
    .tier-badge {
      display: inline-block; background: rgba(255,255,255,0.15); border-radius: 20px;
      padding: 4px 14px; font-size: 13px; font-weight: 600; color: white; margin-top: 8px;
    }

    .comparison-wrapper { margin-bottom: 36px; }
    .comparison-wrapper h2 { font-size: 18px; font-weight: 700; color: var(--primary); margin-bottom: 16px; }
    .comp-table { width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .comp-table thead tr { background: var(--primary); color: white; }
    .comp-table thead th { padding: 12px 16px; text-align: left; font-weight: 600; }
    .comp-table thead th.comp-recommended-head { background: var(--accent); color: var(--accent-fg); }
    .comp-table tbody tr:nth-child(odd) { background: var(--muted); }
    .comp-table tbody tr:nth-child(even) { background: white; }
    .comp-table td { padding: 10px 16px; border-bottom: 1px solid var(--border); }
    .comp-label { font-weight: 500; color: var(--muted-fg); }
    .comp-cell { font-weight: 500; }
    .comp-recommended { background: var(--accent-light) !important; font-weight: 700; color: var(--primary); }

    .page-divider { border: none; border-top: 3px dashed var(--border); margin: 48px 0; }
  </style>
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
        <tr><td>Municipality</td><td>${escapeHtml(data.municipality)}</td></tr>
      </table>
    </div>
  </header>

  <div class="validity-bar">
    <div class="dot"></div>
    <span>This proposal presents <strong>3 options</strong>. It is valid for <strong>7 days</strong> from date of issue. A deposit (marked &#9733;) is required to confirm the order and procure equipment.</span>
  </div>

  <!-- Option Comparison Table -->
  <div class="comparison-wrapper">
    <h2>Option Comparison</h2>
    <table class="comp-table">
      <thead>
        <tr>
          <th></th>
          <th>Premium</th>
          <th class="comp-recommended-head">Recommended</th>
          <th>Budget</th>
        </tr>
      </thead>
      <tbody>
        ${comparisonRows}
      </tbody>
    </table>
  </div>

  <hr class="page-divider" />

  ${optionSections}

  <!-- Shared Disclaimers -->
  <div class="card no-break">
    <div class="card-header"><h2>Disclaimers &amp; Exclusions</h2></div>
    <div class="card-body">
      <div class="exclusions-list">
        <ul>
          <li>Body corporate or HOA approval for roof modifications is the client&apos;s responsibility. Associated fees and structural reports are not included in this quote.</li>
          <li>Internal wall chasing or plastering (if cable must route via conduit)</li>
          <li>Main DB panel upgrade or expansion (quoted separately if required after inspection)</li>
          <li>Trenching or underground cable routing</li>
          <li>Travel surcharge beyond Gauteng standard service zone (charged at R8.00/km)</li>
          <li>Any electrical work outside the solar installation scope</li>
        </ul>
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

// ── Customer-facing summary renderer (no BOM) ────────────────────────────────

function renderCustomerSingleHtml(data: QuoteData, tierLabel?: string): string {
  const d = data as unknown as Record<string, unknown>
  let html = CUSTOMER_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, key: string) => val(d, key))

  if (tierLabel) {
    html = html.replace('{{TIER_BADGE}}', `<div class="tier-badge">${escapeHtml(tierLabel)}</div>`)
  } else {
    html = html.replace('{{TIER_BADGE}}', '')
  }

  if (data.monthlyGenTable?.length) {
    html = html.replace('{{MONTHLY_GEN_SECTION}}', renderMonthlyGenSection(data))
  } else {
    html = html.replace('{{MONTHLY_GEN_SECTION}}', '')
  }

  if (data.twentyYearTable?.length) {
    html = html.replace('{{TWENTY_YEAR_SECTION}}', renderTwentyYearSection(data))
  } else {
    html = html.replace('{{TWENTY_YEAR_SECTION}}', '')
  }

  if (data.evChargerKw) {
    html = html.replace('{{EV_CHARGER_SYSTEM_ROW}}', `<tr><td>EV Charger</td><td>${data.evChargerKw} Type 2 Wallbox</td></tr>`)
  } else {
    html = html.replace('{{EV_CHARGER_SYSTEM_ROW}}', '')
  }

  html = html.replace('{{EQUIPMENT_PHOTOS_SECTION}}', renderEquipmentPhotosSection(data))
  html = html.replace('{{DETAILED_BOM_SECTION}}', renderDetailedBomSection(data))

  return html
}

/**
 * The itemised breakdown — every part and task behind the summarised sections,
 * with its quantity and its price.
 *
 * The customer document has never carried a bill of materials — it states the
 * system, the price and the returns — so this is additive rather than a second
 * copy of anything: the list a customer asks for when they want to put our
 * quote beside someone else's. It sums to the quote total because it is the
 * same BOM the total came from. Empty on a simplified quote, the default.
 */
function renderDetailedBomSection(data: QuoteData): string {
  const sections = data.detailedSections ?? []
  if (sections.length === 0) return ''

  const cards = sections.map((section) => {
    const rows = section.lines.map((l) => `
          <tr>
            <td>${escapeHtml(l.description)}</td>
            <td class="right">${l.qty}</td>
            <td class="right">${escapeHtml(l.unit || '—')}</td>
            <td class="right">${escapeHtml(l.amount)}</td>
          </tr>`).join('')
    return `
  <div class="card no-break">
    <div class="card-header"><h2>${escapeHtml(section.name)}</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:52%">Item</th><th class="right">Qty</th><th class="right">Unit</th><th class="right">Total (R)</th></tr></thead>
        <tbody>${rows}
          <tr class="subtotal-row"><td colspan="3">Section Total</td><td class="right">${escapeHtml(section.subtotal)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>`
  }).join('')

  return `
  <div class="section-heading">Itemised Breakdown</div>

  <div class="disclaimer-box">
    Every part and every task in this installation, priced one line at a time. These
    amounts are the quote total stated in detail &mdash; they add up to it, they are
    not extra to it.
  </div>
${cards}`
}

/**
 * "What you're getting" — a photo of each major piece of kit (W53).
 * Images come from the catalog's primary_image_url / gallery_image_urls, so a
 * product with no photo simply doesn't appear; no photos at all → no section.
 * Rendered as remote <img> URLs: the quote is emailed and printed, and mail
 * clients handle absolute image URLs fine.
 */
function renderEquipmentPhotosSection(data: QuoteData): string {
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
    <div class="card-body">
      <div class="eq-photos">${cards}
      </div>
    </div>
  </div>`
}

function renderMultiOptionCustomerQuote(data: MultiOptionQuoteData): string {
  const comparisonRows = (data.comparisonTable ?? []).map(row => `
    <tr>
      <td class="comp-label">${escapeHtml(row.label)}</td>
      <td class="comp-cell">${escapeHtml(row.premium)}</td>
      <td class="comp-cell comp-recommended">${escapeHtml(row.recommended)}</td>
      <td class="comp-cell">${escapeHtml(row.budget)}</td>
    </tr>`).join('')

  const optionSections = data.options.map(opt => {
    const isRec = opt.tier === 'recommended'
    const merged: OptionQuoteData = {
      ...opt,
      quoteNumber:     opt.quoteNumber     ?? data.quoteNumber,
      dateIssued:      opt.dateIssued      ?? data.dateIssued,
      dateExpires:     opt.dateExpires     ?? data.dateExpires,
      customerName:    opt.customerName    ?? data.customerName,
      municipality:    opt.municipality    ?? data.municipality,
      customerPhone:   opt.customerPhone   ?? data.customerPhone,
      customerEmail:   opt.customerEmail   ?? data.customerEmail,
      siteAddress:     opt.siteAddress     ?? data.siteAddress,
      monthlyUsageKwh: opt.monthlyUsageKwh ?? data.monthlyUsageKwh,
    }
    return `
    <div class="option-wrapper${isRec ? ' option-recommended' : ''}">
      ${isRec ? '<div class="rec-ribbon">Our Recommendation</div>' : ''}
      ${renderCustomerSingleHtml(merged, opt.tierLabel)}
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.quoteNumber)} — Haberl Solar Proposal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
  <style>
    ${BASE_CSS}
    .option-wrapper { margin-bottom: 52px; }
    .option-recommended { border: 1px solid var(--rule); border-top: 2px solid var(--accent); border-radius: 3px; overflow: hidden; position: relative; }
    .rec-ribbon { background: var(--accent-wash); color: var(--accent-ink); text-align: center; font-size: 9.5px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; padding: 9px 0; border-bottom: 1px solid var(--rule); }
    .tier-badge { display: inline-block; margin-top: 14px; font-size: 9.5px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent); }
    .comparison-wrapper { margin-bottom: 40px; }
    .comparison-wrapper h2 { font-family: var(--serif); font-size: 19px; font-weight: 600; color: var(--ink); margin-bottom: 16px; }
    .comp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
    .comp-table thead tr { background: none; }
    .comp-table thead th { padding: 13px 18px 11px; text-align: left; font-weight: 600; font-size: 9.5px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--muted-fg); border-bottom: 1px solid var(--ink); }
    .comp-table thead th.comp-recommended-head { color: var(--accent-ink); border-bottom-color: var(--accent); }
    .comp-table tbody tr { background: none; }
    .comp-table td { padding: 11px 18px; border-bottom: 1px solid var(--hairline); font-variant-numeric: tabular-nums; }
    .comp-table tbody tr:last-child td { border-bottom: none; }
    .comp-label { font-weight: 400; color: var(--muted-fg); }
    .comp-cell { font-weight: 500; }
    .comp-recommended { background: var(--accent-wash); font-weight: 600; color: var(--ink); }
    .page-divider { border: none; border-top: 1px solid var(--rule); margin: 48px 0; }
  </style>
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
        <tr><td>Municipality</td><td>${escapeHtml(data.municipality)}</td></tr>
      </table>
    </div>
  </header>
  <div class="validity-bar">
    <div class="dot"></div>
    <span>This proposal presents <strong>3 options</strong>. It is valid for <strong>7 days</strong> from date of issue. A deposit (marked &#9733;) is required to confirm the order and procure equipment.</span>
  </div>
  <div class="comparison-wrapper">
    <h2>Option Comparison</h2>
    <table class="comp-table">
      <thead>
        <tr>
          <th></th>
          <th>&#9733;&#9733;&#9733; Premium</th>
          <th class="comp-recommended-head">&#9733;&#9733;&#9734; Recommended</th>
          <th>&#9733;&#9734;&#9734; Budget</th>
        </tr>
      </thead>
      <tbody>${comparisonRows}</tbody>
    </table>
  </div>
  <hr class="page-divider" />
  ${optionSections}
  <div class="card no-break">
    <div class="card-header"><h2>Disclaimers &amp; Exclusions</h2></div>
    <div class="card-body">
      <div class="exclusions-list">
        <ul>
          <li>Body corporate or HOA approval for roof modifications is the client&apos;s responsibility. Associated fees and structural reports are not included in this quote.</li>
          <li>Internal wall chasing or plastering (if cable must route via conduit)</li>
          <li>Main DB panel upgrade or expansion (quoted separately if required after inspection)</li>
          <li>Trenching or underground cable routing</li>
          <li>Travel surcharge beyond Gauteng standard service zone (charged at R8.00/km)</li>
          <li>Any electrical work outside the solar installation scope</li>
        </ul>
      </div>
    </div>
  </div>
  <footer class="footer">
    <div><strong>Haberl Electrical &amp; Solar</strong> &nbsp;&middot;&nbsp; +27 61 519 3016 &nbsp;&middot;&nbsp; matthew@haberl.co.za &nbsp;&middot;&nbsp; haberl.co.za</div>
    <div class="badge">SANS 10142 COMPLIANT</div>
  </footer>
</div>
</body>
</html>`
}

// ── EV Charger section (injected when evChargerKw is set) ────────────────────

function renderEvChargerSection(data: QuoteData): string {
  if (!data.evChargerKw || !data.evChargerCost) return ''
  return `
  <div class="card no-break">
    <div class="card-header"><h2>EV Charger</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>${data.evChargerKw} Type 2 EV Wallbox &#9733;<div class="subtitle">Dedicated EV charging circuit — ${data.evChargerKw === '7kW' ? '10m 6mm² single-phase cable, 32A DP MCB' : data.evChargerKw === '11kW' ? '10m 6mm² 3-phase cable, 20A TP MCB' : '10m 10mm² 3-phase cable, 32A TP MCB'}, glands, conduit, and installation labour</div></td>
            <td class="right">1</td>
            <td class="right">${data.evChargerCost}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">${data.evChargerCost}</td></tr>
        </tbody>
      </table>
    </div>
  </div>`
}

// ── Monthly generation section ────────────────────────────────────────────────

function renderMonthlyGenSection(data: QuoteData): string {
  if (!data.monthlyGenTable?.length) return ''

  const maxGen = Math.max(...data.monthlyGenTable.map(r => r.solarGenKwh))
  const maxCon = Math.max(...data.monthlyGenTable.map(r => r.consumptionKwh))
  const maxVal = Math.max(maxGen, maxCon)

  const tableRows = data.monthlyGenTable.map(r => {
    const genBar = Math.round((r.solarGenKwh / maxVal) * 100)
    const conBar = Math.round((r.consumptionKwh / maxVal) * 100)
    return `
        <tr>
          <td>${r.month}</td>
          <td>
            <div class="bar-wrap">
              <div class="bar bar-solar" style="width:${genBar}%"></div>
              <span class="bar-val">${r.solarGenKwh.toLocaleString()}</span>
            </div>
          </td>
          <td>
            <div class="bar-wrap">
              <div class="bar bar-grid" style="width:${conBar}%"></div>
              <span class="bar-val">${r.consumptionKwh.toLocaleString()}</span>
            </div>
          </td>
          <td class="right">${r.energyFromSolarPct}%</td>
          <td class="right">${r.billBefore}</td>
          <td class="right">${r.billAfter}</td>
          <td class="right saving-cell">${r.saving}</td>
        </tr>`
  }).join('')

  return `
  <div class="section-heading">Monthly Solar Generation &amp; Savings</div>
  <div class="card no-break">
    <div class="card-header"><h2>Energy Flow — Month by Month</h2></div>
    <div class="card-body">
      <style>
        .bar-wrap { display: flex; align-items: center; gap: 9px; }
        .bar { height: 9px; border-radius: 1px; min-width: 3px; }
        .bar-solar { background: var(--accent); }
        .bar-grid  { background: #c3c9d1; }
        .bar-val { font-size: 11px; color: var(--muted-fg); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .saving-cell { color: var(--positive); font-weight: 600; }
        .monthly-legend { display: flex; gap: 22px; padding: 13px 20px; border-top: 1px solid var(--hairline); font-size: 10.5px; letter-spacing: 0.04em; color: var(--muted-fg); }
        .monthly-legend span { display: flex; align-items: center; gap: 7px; }
        .leg-dot { width: 9px; height: 9px; border-radius: 1px; }
      </style>
      <table class="bom-table">
        <thead>
          <tr>
            <th style="width:8%">Month</th>
            <th style="width:25%">Solar Generation (kWh)</th>
            <th style="width:25%">Consumption (kWh)</th>
            <th class="right" style="width:10%">% Solar</th>
            <th class="right" style="width:12%">Bill Before</th>
            <th class="right" style="width:10%">Bill After</th>
            <th class="right" style="width:10%">Saving</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          <tr class="subtotal-row">
            <td><strong>Annual</strong></td>
            <td colspan="2"><strong>${data.annualSolarGenKwh ?? ''} kWh solar vs ${data.annualConsumptionKwh ?? ''} kWh consumption</strong></td>
            <td class="right"><strong>${data.annualGridOffsetPct ?? ''}%</strong></td>
            <td class="right"></td>
            <td class="right"></td>
            <td class="right saving-cell"><strong>${data.annualSavingR}</strong></td>
          </tr>
        </tbody>
      </table>
      <div class="monthly-legend">
        <span><span class="leg-dot" style="background:var(--accent)"></span>Solar generation</span>
        <span><span class="leg-dot" style="background:#c3c9d1"></span>Household consumption</span>
      </div>
    </div>
  </div>`
}

// ── 20-year financial section ─────────────────────────────────────────────────

function renderTwentyYearSection(data: QuoteData): string {
  if (!data.twentyYearTable?.length) return ''

  // Find payback year (first positive cumulative)
  const paybackYear = data.twentyYearTable.find(r => {
    const val = parseFloat(r.cumulativeImpact.replace(/[^0-9.-]/g, ''))
    return val > 0
  })

  const tableRows = data.twentyYearTable.map(r => {
    const cumVal = parseFloat(r.cumulativeImpact.replace(/[^0-9.-]/g, ''))
    const isPayback = r === paybackYear
    const isPositive = cumVal > 0
    return `
        <tr${isPayback ? ' class="payback-row"' : ''}>
          <td>${isPayback ? '★ ' : ''}Year ${r.year}</td>
          <td class="right">${r.consumptionKwh}</td>
          <td class="right">${r.solarGenKwh}</td>
          <td class="right">${r.billBefore}</td>
          <td class="right">${r.billAfter}</td>
          <td class="right saving-cell">${r.annualSaving}</td>
          <td class="right${isPositive ? ' cumulative-positive' : ' cumulative-negative'}">${r.cumulativeImpact}</td>
        </tr>`
  }).join('')

  return `
  <div class="section-heading">20-Year Financial Impact</div>

  <div class="financial-hero no-break">
    <div class="hero-item">
      <div class="hero-label">Lifetime bill savings</div>
      <div class="hero-value">${data.lifetimeBillSavings ?? ''}</div>
    </div>
    <div class="hero-item">
      <div class="hero-label">Less system cost</div>
      <div class="hero-value">${data.netSystemCost ?? ''}</div>
    </div>
    <div class="hero-item hero-net">
      <div class="hero-label">Estimated net benefit</div>
      <div class="hero-value hero-net-value">${data.estimatedNetSavings ?? ''}</div>
    </div>
  </div>

  <div class="metrics-strip no-break">
    <div class="metric-item">
      <div class="metric-label">Net Present Value</div>
      <div class="metric-value">${data.npv ?? ''}</div>
      <div class="metric-sub">At 6.75% discount rate</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Total ROI</div>
      <div class="metric-value accent">${data.roi ?? ''}</div>
      <div class="metric-sub">Over 20 years</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Annual Return</div>
      <div class="metric-value">${data.annualReturnRate ?? ''}</div>
      <div class="metric-sub">Approx. IRR</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Simple Payback</div>
      <div class="metric-value accent">${data.paybackMonths} mo</div>
      <div class="metric-sub">At flat tariff</div>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Year-by-Year Projection</h2></div>
    <div class="card-body">
      <style>
        .payback-row td { background: var(--accent-wash); font-weight: 600; }
        .payback-row td:first-child { color: var(--accent-ink); }
        .cumulative-positive { color: var(--positive); font-weight: 600; }
        .cumulative-negative { color: var(--muted-fg); }
        .saving-cell { color: var(--positive); }
        .financial-hero { display: flex; background: var(--ink); border-radius: 3px; padding: 28px 32px; color: #fff; margin-bottom: 22px; }
        .hero-item { flex: 1; }
        .hero-item + .hero-item { border-left: 1px solid rgba(255,255,255,0.14); padding-left: 28px; margin-left: 28px; }
        .hero-label { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.13em; color: rgba(255,255,255,0.5); margin-bottom: 7px; }
        .hero-value { font-family: var(--serif); font-size: 25px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .hero-net-value { color: var(--accent); }
        .metrics-strip { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; margin-bottom: 22px; }
        .metric-item { padding: 18px 20px 20px; border-right: 1px solid var(--hairline); }
        .metric-item:last-child { border-right: none; }
        .metric-label { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.13em; color: var(--muted-fg); margin-bottom: 7px; }
        .metric-value { font-family: var(--serif); font-size: 23px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
        .metric-value.accent { color: var(--accent-ink); }
        .metric-sub { font-size: 11px; color: var(--muted-fg); margin-top: 5px; }
        .assumptions-note { font-size: 11px; color: var(--muted-fg); padding: 12px 20px; border-top: 1px solid var(--hairline); line-height: 1.6; }
      </style>
      <table class="bom-table">
        <thead>
          <tr>
            <th style="width:12%">Year</th>
            <th class="right" style="width:14%">Consumption</th>
            <th class="right" style="width:14%">Solar Gen</th>
            <th class="right" style="width:13%">Bill Before</th>
            <th class="right" style="width:12%">Bill After</th>
            <th class="right" style="width:13%">Annual Saving</th>
            <th class="right" style="width:16%">Cumulative Impact</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <div class="assumptions-note">
        Assumptions: electricity tariff escalation 4.6% p.a. &middot; panel degradation 0.5% p.a. &middot; system cost deducted in Year 1
        &middot; ★ = payback crossover year
      </div>
    </div>
  </div>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared CSS
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CSS = `
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
`

// ─────────────────────────────────────────────────────────────────────────────
// Single-option HTML template
// ─────────────────────────────────────────────────────────────────────────────

const SINGLE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{quoteNumber}} — Haberl Solar Quote</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
  <style>${BASE_CSS}</style>
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
      {{TIER_BADGE}}
    </div>
    <div class="quote-meta">
      <div class="quo-number">{{quoteNumber}}</div>
      <table>
        <tr><td>Date</td><td>{{dateIssued}}</td></tr>
        <tr><td>Valid until</td><td>{{dateExpires}}</td></tr>
        <tr><td>Customer</td><td>{{customerName}}</td></tr>
        <tr><td>Municipality</td><td>{{municipality}}</td></tr>
      </table>
    </div>
  </header>

  <div class="validity-bar">
    <div class="dot"></div>
    <span>This quote is valid for <strong>7 days</strong> from date of issue. A deposit (marked &#9733;) is required to confirm the order and procure equipment.</span>
  </div>

  <div class="two-col no-break">
    <div class="card">
      <div class="card-header"><h2>Customer</h2></div>
      <div class="card-body">
        <table class="info-table">
          <tr><td>Customer</td><td>{{customerName}}</td></tr>
          <tr><td>Phone</td><td>{{customerPhone}}</td></tr>
          <tr><td>Email</td><td>{{customerEmail}}</td></tr>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2>Site Details</h2></div>
      <div class="card-body">
        <table class="info-table">
          <tr><td>Address</td><td>{{siteAddress}}</td></tr>
          <tr><td>Municipality</td><td>{{municipality}}</td></tr>
          <tr><td>Avg monthly usage</td><td>{{monthlyUsageKwh}} kWh</td></tr>
        </table>
      </div>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Recommended System</h2></div>
    <div class="card-body">
      <table class="info-table">
        <tr><td>System type</td><td>{{systemType}}</td></tr>
        <tr><td>Inverter</td><td>{{inverterModel}} {{inverterKw}}kW</td></tr>
        <tr><td>Battery</td><td>{{batteryModel}} {{batteryKwh}}kWh</td></tr>
        <tr><td>Panels</td><td>{{panelCount}} &times; {{panelModel}}</td></tr>
        <tr><td>Total capacity</td><td>{{totalKwp}}kWp</td></tr>
        <tr><td>Est. monthly generation</td><td>~{{monthlyGenKwh}} kWh</td></tr>
      </table>
    </div>
  </div>

  <div class="section-heading">Bill of Materials</div>

  <div class="card no-break">
    <div class="card-header"><h2>Panel &amp; Mounting</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>Solar Panels <span class="star">&#9733;</span><div class="subtitle">{{panelCount}} &times; {{panelModel}} = {{totalKwp}}kWp</div></td>
            <td class="right">1</td><td class="right">{{panelCost}}</td>
          </tr>
          <tr>
            <td>Consumables &mdash; Panels &amp; Mounting<div class="subtitle">Mounting hardware, clamps, fasteners, hooks, sealing</div></td>
            <td class="right">1</td><td class="right">{{panelMountingConsumables}}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">{{panelMountingSubtotal}}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Cables &amp; Connectors</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>Cables &amp; Connectors<div class="subtitle">Solar cable (4mm red/black), MC4 sets, flex panel wire, earth bonding</div></td>
            <td class="right">1</td><td class="right">{{cablesCost}}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">{{cablesSubtotal}}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>DC Protection</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>DC Combiner ({{dcCombinerConfig}})<div class="subtitle">Includes breaker, surge protection, enclosure</div></td>
            <td class="right">1</td><td class="right">{{dcCombinerCost}}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">{{dcProtectionSubtotal}}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Inverter &amp; Battery System</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>Inverter &mdash; {{inverterModel}} {{inverterKw}}kW <span class="star">&#9733;</span></td>
            <td class="right">{{inverterQty}}</td><td class="right">{{inverterCost}}</td>
          </tr>
          <tr>
            <td>Battery &mdash; {{batteryModel}} {{batteryKwh}}kWh <span class="star">&#9733;</span></td>
            <td class="right">{{batteryQty}}</td><td class="right">{{batteryCost}}</td>
          </tr>
          <tr>
            <td>AC Combiner &amp; Gateway<div class="subtitle">Home gateway, monitoring, communication module, power cables, fuses, lugs</div></td>
            <td class="right">1</td><td class="right">{{batteryAccessoriesCost}}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">{{inverterBatterySubtotal}}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>AC &amp; DB Protection</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>AC &amp; DB Protection<div class="subtitle">Changeover switch, MCB, surge protection, essential loads DB, terminal bars, trunking, AC flex cable</div></td>
            <td class="right">1</td><td class="right">{{acDbCost}}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">{{acDbSubtotal}}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Earthing System</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>Earthing System ({{earthingSpikeCount}}-spike)<div class="subtitle">Earth rods, couplings, clamps, cement, bonding wire, anchors</div></td>
            <td class="right">1</td><td class="right">{{earthingCost}}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">{{earthingSubtotal}}</td></tr>
        </tbody>
      </table>
      <div class="disclaimer-box">
        <strong>Soil resistivity disclaimer:</strong> Spike count is determined by soil conditions including resistivity (&Omega;&middot;m) and moisture content. Standard: 2 spikes for 3kW, 4 spikes for 5kW, 6 spikes for 8&ndash;10kW. Final count confirmed on site.
      </div>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Consumables &amp; Compliance</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>Consumables &amp; Compliance Materials<div class="subtitle">Cable ties, glands, ferrules, heat shrink, labels, sealant, fasteners, COC (R1,500)</div></td>
            <td class="right">1</td><td class="right">{{consumablesCost}}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">{{consumablesSubtotal}}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Installation Labour</h2></div>
    <div class="card-body">
      <table class="bom-table">
        <thead><tr><th style="width:50%">Description</th><th class="right">Qty</th><th class="right">Total (R)</th></tr></thead>
        <tbody>
          <tr>
            <td>Installation Labour<div class="subtitle">Panel installation, inverter setup, DB commissioning, system testing</div></td>
            <td class="right">1</td><td class="right">{{labourCost}}</td>
          </tr>
          <tr class="subtotal-row"><td>Section Total</td><td class="right" colspan="2">{{labourSubtotal}}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  {{EV_CHARGER_SECTION}}

  <div class="section-heading">Total Investment</div>

  <div class="summary-block no-break">
    <h2>Quote Summary</h2>
    <table class="summary-lines">
      <tr><td>Panel &amp; Mounting</td><td>{{panelMountingSubtotal}}</td></tr>
      <tr><td>Cables &amp; Connectors</td><td>{{cablesSubtotal}}</td></tr>
      <tr><td>DC Protection</td><td>{{dcProtectionSubtotal}}</td></tr>
      <tr><td>Inverter &amp; Battery System</td><td>{{inverterBatterySubtotal}}</td></tr>
      <tr><td>AC &amp; DB Protection</td><td>{{acDbSubtotal}}</td></tr>
      <tr><td>Earthing System</td><td>{{earthingSubtotal}}</td></tr>
      <tr><td>Consumables &amp; Compliance</td><td>{{consumablesSubtotal}}</td></tr>
      <tr><td>Installation Labour</td><td>{{labourSubtotal}}</td></tr>
      {{EV_CHARGER_SUMMARY_ROW}}
      <tr class="total-row divider"><td>QUOTE TOTAL</td><td>{{quoteTotal}}</td></tr>
    </table>
    <div class="vat-badge">Haberl Electrical &amp; Solar does not add VAT &mdash; all prices inclusive</div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Deposit &amp; Payment</h2></div>
    <div class="card-body">
      <table class="info-table">
        <tr><td>Deposit required (&#9733; items)</td><td><strong>{{depositTotal}}</strong></td></tr>
        <tr><td>Balance on completion</td><td>{{balanceTotal}}</td></tr>
        <tr><td>Quote total</td><td>{{quoteTotal}}</td></tr>
      </table>
    </div>
  </div>

  <div class="section-heading">Estimated Returns</div>

  <div class="card no-break">
    <div class="card-header"><h2>Solar Generation &amp; Savings</h2></div>
    <div class="card-body">
      <div class="roi-grid">
        <div class="roi-item">
          <div class="roi-label">Monthly Generation</div>
          <div class="roi-value">~{{monthlyGenKwh}} kWh</div>
          <div class="roi-sub">{{totalKwp}}kWp &middot; 5.3 avg PSH &middot; 80% efficiency</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Annual Grid Offset</div>
          <div class="roi-value">~{{annualOffsetPercent}}%</div>
          <div class="roi-sub">Battery bridges overnight load</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Monthly Saving</div>
          <div class="roi-value accent">{{monthlySavingR}}</div>
          <div class="roi-sub">At {{tariffRate}}/kWh blended rate</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Annual Saving</div>
          <div class="roi-value">~{{annualSavingR}}</div>
          <div class="roi-sub">Flat tariff (conservative)</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Simple Payback</div>
          <div class="roi-value">~{{paybackMonths}} months</div>
          <div class="roi-sub">{{paybackYears}} years at current tariffs</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Payback (12% escalation)</div>
          <div class="roi-value accent">~{{paybackMonthsEscalated}} months</div>
          <div class="roi-sub">At 12% p.a. tariff escalation</div>
        </div>
      </div>
    </div>
  </div>

  {{MONTHLY_GEN_SECTION}}

  {{TWENTY_YEAR_SECTION}}

  <div class="card no-break">
    <div class="card-header"><h2>Disclaimers &amp; Exclusions</h2></div>
    <div class="card-body">
      <div class="exclusions-list">
        <ul>
          <li>Body corporate or HOA approval for roof modifications is the client&apos;s responsibility. Associated fees and structural reports are not included in this quote.</li>
          <li>Internal wall chasing or plastering (if cable must route via conduit)</li>
          <li>Main DB panel upgrade or expansion (quoted separately if required after inspection)</li>
          <li>Trenching or underground cable routing</li>
          <li>Travel surcharge beyond Gauteng standard service zone (charged at R8.00/km)</li>
          <li>Any electrical work outside the solar installation scope</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Terms &amp; Warranty</h2></div>
    <div class="card-body">
      <div class="terms-grid">
        <div class="terms-item"><div class="t-label">Quote Validity</div>7 days from date of issue</div>
        <div class="terms-item"><div class="t-label">Deposit</div>Required to confirm order and procure equipment (&#9733; items)</div>
        <div class="terms-item"><div class="t-label">Balance Payment</div>Payable on day of installation completion</div>
        <div class="terms-item"><div class="t-label">Certificate of Compliance</div>Issued within 5 business days of installation</div>
        <div class="terms-item"><div class="t-label">Inverter Warranty</div>Manufacturer warranty (typically 5&ndash;10 years)</div>
        <div class="terms-item"><div class="t-label">Battery Warranty</div>Manufacturer warranty (typically 5&ndash;10 years)</div>
        <div class="terms-item"><div class="t-label">Panel Warranty</div>Manufacturer product &amp; performance warranty</div>
        <div class="terms-item"><div class="t-label">Workmanship</div>SANS 10142 compliant installation</div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Customer summary template (no BOM — system overview + price + ROI only)
// ─────────────────────────────────────────────────────────────────────────────

const CUSTOMER_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{quoteNumber}} — Haberl Solar Quote</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
  <style>${BASE_CSS}</style>
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
      {{TIER_BADGE}}
    </div>
    <div class="quote-meta">
      <div class="quo-number">{{quoteNumber}}</div>
      <table>
        <tr><td>Date</td><td>{{dateIssued}}</td></tr>
        <tr><td>Valid until</td><td>{{dateExpires}}</td></tr>
        <tr><td>Customer</td><td>{{customerName}}</td></tr>
        <tr><td>Municipality</td><td>{{municipality}}</td></tr>
      </table>
    </div>
  </header>

  <div class="validity-bar">
    <div class="dot"></div>
    <span>This quote is valid for <strong>7 days</strong> from date of issue. A deposit (marked &#9733;) is required to confirm the order and procure equipment.</span>
  </div>

  <div class="two-col no-break">
    <div class="card">
      <div class="card-header"><h2>Customer</h2></div>
      <div class="card-body">
        <table class="info-table">
          <tr><td>Customer</td><td>{{customerName}}</td></tr>
          <tr><td>Phone</td><td>{{customerPhone}}</td></tr>
          <tr><td>Email</td><td>{{customerEmail}}</td></tr>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2>Site Details</h2></div>
      <div class="card-body">
        <table class="info-table">
          <tr><td>Address</td><td>{{siteAddress}}</td></tr>
          <tr><td>Municipality</td><td>{{municipality}}</td></tr>
          <tr><td>Avg monthly usage</td><td>{{monthlyUsageKwh}} kWh</td></tr>
        </table>
      </div>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Your System</h2></div>
    <div class="card-body">
      <table class="info-table">
        <tr><td>System type</td><td>{{systemType}}</td></tr>
        <tr><td>Inverter</td><td>{{inverterModel}} {{inverterKw}}kW</td></tr>
        <tr><td>Battery</td><td>{{batteryModel}} {{batteryKwh}}kWh</td></tr>
        <tr><td>Solar panels</td><td>{{panelCount}} &times; {{panelModel}}</td></tr>
        <tr><td>Total capacity</td><td>{{totalKwp}}kWp</td></tr>
        <tr><td>Est. monthly generation</td><td>~{{monthlyGenKwh}} kWh</td></tr>
        {{EV_CHARGER_SYSTEM_ROW}}
      </table>
    </div>
  </div>

  {{EQUIPMENT_PHOTOS_SECTION}}

  {{DETAILED_BOM_SECTION}}

  <div class="section-heading">Total Investment</div>

  <div class="summary-block no-break">
    <table class="summary-lines">
      <tr class="total-row"><td>Quote total</td><td>{{quoteTotal}}</td></tr>
    </table>
    <div class="vat-badge">Haberl Electrical &amp; Solar does not add VAT &mdash; all prices inclusive</div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Deposit &amp; Payment</h2></div>
    <div class="card-body">
      <table class="info-table">
        <tr><td>Deposit required (&#9733; items)</td><td><strong>{{depositTotal}}</strong></td></tr>
        <tr><td>Balance on completion</td><td>{{balanceTotal}}</td></tr>
        <tr><td>Quote total</td><td>{{quoteTotal}}</td></tr>
      </table>
    </div>
  </div>

  <div class="section-heading">Estimated Returns</div>

  <div class="card no-break">
    <div class="card-header"><h2>Solar Generation &amp; Savings</h2></div>
    <div class="card-body">
      <div class="roi-grid">
        <div class="roi-item">
          <div class="roi-label">Monthly Generation</div>
          <div class="roi-value">~{{monthlyGenKwh}} kWh</div>
          <div class="roi-sub">{{totalKwp}}kWp &middot; 5.3 avg PSH &middot; 80% efficiency</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Annual Grid Offset</div>
          <div class="roi-value">~{{annualOffsetPercent}}%</div>
          <div class="roi-sub">Battery bridges overnight load</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Monthly Saving</div>
          <div class="roi-value accent">{{monthlySavingR}}</div>
          <div class="roi-sub">At {{tariffRate}}/kWh blended rate</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Annual Saving</div>
          <div class="roi-value">~{{annualSavingR}}</div>
          <div class="roi-sub">Flat tariff (conservative)</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Simple Payback</div>
          <div class="roi-value">~{{paybackMonths}} months</div>
          <div class="roi-sub">{{paybackYears}} years at current tariffs</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Payback (12% escalation)</div>
          <div class="roi-value accent">~{{paybackMonthsEscalated}} months</div>
          <div class="roi-sub">At 12% p.a. tariff escalation</div>
        </div>
      </div>
    </div>
  </div>

  {{MONTHLY_GEN_SECTION}}

  {{TWENTY_YEAR_SECTION}}

  <div class="card no-break">
    <div class="card-header"><h2>Disclaimers &amp; Exclusions</h2></div>
    <div class="card-body">
      <div class="exclusions-list">
        <ul>
          <li>Body corporate or HOA approval for roof modifications is the client&apos;s responsibility. Associated fees and structural reports are not included in this quote.</li>
          <li>Internal wall chasing or plastering (if cable must route via conduit)</li>
          <li>Main DB panel upgrade or expansion (quoted separately if required after inspection)</li>
          <li>Trenching or underground cable routing</li>
          <li>Travel surcharge beyond Gauteng standard service zone (charged at R8.00/km)</li>
          <li>Any electrical work outside the solar installation scope</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="card no-break">
    <div class="card-header"><h2>Terms &amp; Warranty</h2></div>
    <div class="card-body">
      <div class="terms-grid">
        <div class="terms-item"><div class="t-label">Quote Validity</div>7 days from date of issue</div>
        <div class="terms-item"><div class="t-label">Deposit</div>Required to confirm order and procure equipment (&#9733; items)</div>
        <div class="terms-item"><div class="t-label">Balance Payment</div>Payable on day of installation completion</div>
        <div class="terms-item"><div class="t-label">Certificate of Compliance</div>Issued within 5 business days of installation</div>
        <div class="terms-item"><div class="t-label">Inverter Warranty</div>Manufacturer warranty (typically 5&ndash;10 years)</div>
        <div class="terms-item"><div class="t-label">Battery Warranty</div>Manufacturer warranty (typically 5&ndash;10 years)</div>
        <div class="terms-item"><div class="t-label">Panel Warranty</div>Manufacturer product &amp; performance warranty</div>
        <div class="terms-item"><div class="t-label">Workmanship</div>SANS 10142 compliant installation</div>
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
