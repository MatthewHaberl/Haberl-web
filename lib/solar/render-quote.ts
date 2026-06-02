'use client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DepositItem {
  name: string
  amountRands: number
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

// ── Single-option renderer ────────────────────────────────────────────────────

function val(data: Record<string, unknown>, key: string): string {
  const v = data[key]
  return v !== undefined && v !== null ? String(v) : `{{${key}}}`
}

function renderSingleOptionHtml(data: QuoteData, tierLabel?: string): string {
  const d = data as unknown as Record<string, unknown>
  let html = SINGLE_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, key: string) => val(d, key))

  // Inject tier badge if part of multi-option
  if (tierLabel) {
    html = html.replace('{{TIER_BADGE}}', `<div class="tier-badge">${tierLabel}</div>`)
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

  return html
}

// ── Multi-option renderer ─────────────────────────────────────────────────────

function renderMultiOptionQuote(data: MultiOptionQuoteData): string {
  const premiumOpt  = data.options.find(o => o.tier === 'premium')
  const recOpt      = data.options.find(o => o.tier === 'recommended')
  const budgetOpt   = data.options.find(o => o.tier === 'budget')

  const comparisonRows = (data.comparisonTable ?? []).map(row => `
    <tr>
      <td class="comp-label">${row.label}</td>
      <td class="comp-cell">${row.premium}</td>
      <td class="comp-cell comp-recommended">${row.recommended}</td>
      <td class="comp-cell">${row.budget}</td>
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
  <title>${data.quoteNumber} — Haberl Solar Proposal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    ${BASE_CSS}

    .option-wrapper { margin-bottom: 48px; }
    .option-recommended { border: 3px solid var(--accent); border-radius: 12px; padding: 0; overflow: hidden; position: relative; }
    .rec-ribbon {
      background: var(--accent); color: white; text-align: center;
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
    .comp-table thead th.comp-recommended-head { background: var(--accent); }
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
      <div class="quo-number">${data.quoteNumber}</div>
      <table>
        <tr><td>Date</td><td>${data.dateIssued}</td></tr>
        <tr><td>Valid until</td><td>${data.dateExpires}</td></tr>
        <tr><td>Customer</td><td>${data.customerName}</td></tr>
        <tr><td>Municipality</td><td>${data.municipality}</td></tr>
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
          <th>&#9733;&#9733;&#9733; Premium</th>
          <th class="comp-recommended-head">&#9733;&#9733;&#9734; Recommended</th>
          <th>&#9733;&#9734;&#9734; Budget</th>
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
        .bar-wrap { display: flex; align-items: center; gap: 8px; }
        .bar { height: 14px; border-radius: 3px; min-width: 4px; }
        .bar-solar { background: var(--accent); }
        .bar-grid  { background: #94a3b8; }
        .bar-val { font-size: 11px; color: var(--muted-fg); white-space: nowrap; }
        .saving-cell { color: #16a34a; font-weight: 600; }
        .monthly-legend { display: flex; gap: 20px; padding: 12px 18px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted-fg); }
        .monthly-legend span { display: flex; align-items: center; gap: 6px; }
        .leg-dot { width: 12px; height: 12px; border-radius: 2px; }
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
        <span><span class="leg-dot" style="background:#94a3b8"></span>Household consumption</span>
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
      <div class="hero-label">Lifetime Bill Savings</div>
      <div class="hero-value">${data.lifetimeBillSavings ?? ''}</div>
    </div>
    <div class="hero-minus">−</div>
    <div class="hero-item">
      <div class="hero-label">Net System Cost</div>
      <div class="hero-value">${data.netSystemCost ?? ''}</div>
    </div>
    <div class="hero-equals">=</div>
    <div class="hero-item hero-net">
      <div class="hero-label">Estimated Net Savings</div>
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
        .payback-row { background: #dcfce7 !important; font-weight: 600; }
        .payback-row td:first-child { color: #16a34a; }
        .cumulative-positive { color: #16a34a; font-weight: 600; }
        .cumulative-negative { color: var(--muted-fg); }
        .saving-cell { color: #16a34a; }
        .financial-hero { display: flex; align-items: center; gap: 16px; background: var(--primary); border-radius: 12px; padding: 24px 28px; color: white; margin-bottom: 20px; }
        .hero-item { flex: 1; }
        .hero-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); margin-bottom: 4px; }
        .hero-value { font-size: 24px; font-weight: 800; }
        .hero-minus, .hero-equals { font-size: 28px; font-weight: 700; color: rgba(255,255,255,0.4); flex: 0; }
        .hero-net-value { color: var(--accent); font-size: 28px; }
        .metrics-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
        .metric-item { padding: 16px; border-right: 1px solid var(--border); }
        .metric-item:last-child { border-right: none; }
        .metric-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted-fg); margin-bottom: 4px; }
        .metric-value { font-size: 22px; font-weight: 700; color: var(--primary); }
        .metric-value.accent { color: var(--accent); }
        .metric-sub { font-size: 11px; color: var(--muted-fg); margin-top: 2px; }
        .assumptions-note { font-size: 11px; color: var(--muted-fg); padding: 10px 18px; border-top: 1px solid var(--border); }
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
    --primary:      #1e3a5f;
    --accent:       #f97316;
    --accent-light: #fff7ed;
    --fg:           #171717;
    --muted:        #f5f5f5;
    --muted-fg:     #737373;
    --border:       #e5e7eb;
    --white:        #ffffff;
    --success:      #22c55e;
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
  .bom-table .subtotal-row { background: #eff6ff !important; font-weight: 600; }
  .bom-table .subtotal-row td { color: var(--primary); border-top: 2px solid #bfdbfe; }

  .summary-block { background: var(--primary); border-radius: 12px; padding: 28px; color: var(--white); margin-bottom: 20px; }
  .summary-block h2 { font-size: 15px; font-weight: 700; margin-bottom: 16px; }
  .summary-lines { border-collapse: collapse; width: 100%; }
  .summary-lines td { padding: 5px 0; font-size: 13px; color: rgba(255,255,255,0.85); }
  .summary-lines td:last-child { text-align: right; font-weight: 500; }
  .summary-lines .divider td { border-top: 1px solid rgba(255,255,255,0.15); padding-top: 10px; }
  .summary-lines .total-row td { font-size: 20px; font-weight: 800; color: var(--white); padding-top: 12px; }
  .summary-lines .total-row td:last-child { color: var(--accent); }
  .summary-lines .deposit-row td { font-size: 13px; color: rgba(255,255,255,0.6); }
  .vat-badge { display: inline-block; margin-top: 12px; background: rgba(255,255,255,0.1); border-radius: 20px; padding: 4px 12px; font-size: 11px; color: rgba(255,255,255,0.6); }

  .roi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
  .roi-item { padding: 16px 18px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .roi-item:nth-child(3n) { border-right: none; }
  .roi-item:nth-child(n+4) { border-bottom: none; }
  .roi-label { font-size: 10.5px; font-weight: 600; color: var(--muted-fg); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .roi-value { font-size: 20px; font-weight: 700; color: var(--primary); line-height: 1.1; }
  .roi-value.accent { color: var(--accent); }
  .roi-sub { font-size: 11px; color: var(--muted-fg); margin-top: 2px; }

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
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
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
