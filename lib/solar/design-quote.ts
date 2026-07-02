// ─────────────────────────────────────────────────────────────────────────────
// design-quote — the bridge from the Quotes-v2 design canvas to a sendable quote.
//
// The live canvas persists a SystemDesign and derives a priced DesignBom, but the
// customer-facing pipeline (send email → /q/[token] → accept → job materials)
// reads quote_html + generated_quote + bom_snapshot + totals. This module maps
// one to the other:
//
//   SystemDesign + DesignBom ──▶ QuoteData ──▶ renderCustomerQuote() HTML
//                             ├─▶ SupplierBomItem[]  (bom_snapshot → job materials)
//                             ├─▶ DepositItem[]      (deposit by line items, not %)
//                             └─▶ ComplianceCheck[]  (SANS verification, admin-only)
//
// Pure module — no Supabase, no React; safe on server (generate route) and
// client (the BOM panel's compliance chip).
// ─────────────────────────────────────────────────────────────────────────────

import type { EquipmentCatalogItem } from './quote-calculator'
import { parseInverterSizingSpec } from './quote-calculator'
import {
  computeBalance, designTotalKwp, designInverterKw, designBatteryKwh,
  generationDailyKwh, combinerConfigLabel, DEFAULT_SITE_CONDITIONS,
  type SystemDesign,
} from './system-design'
import { computeStringLayout, runComplianceChecks, type ComplianceCheck } from './compliance'
import { buildSavingsSummary } from './savings'
import type { DesignBom } from './design-bom'
import type { QuoteData, SupplierBomItem, DepositItem } from './render-quote'

const DAYS_PER_MONTH = 30.4

// Deposit rule (locked, 2026-06): deposit = the starred equipment line items
// (inverter, battery, panels, combiners/boards) — never a flat percentage.
const DEPOSIT_SECTIONS = ['Panels', 'Inverter', 'Batteries', 'DC combiner', 'AC board']

const round2 = (n: number) => Math.round(n * 100) / 100

function rand(n: number): string {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dateZA(d: Date): string {
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Flatten a DesignBom into the SupplierBomItem[] shape job-materials seeding parses. */
export function bomToSupplierBom(bom: DesignBom): SupplierBomItem[] {
  const out: SupplierBomItem[] = []
  for (const s of bom.sections) {
    for (const l of s.lines) {
      out.push({
        section: s.name,
        sku: l.sku,
        description: l.description,
        quantity: l.qty,
        unitCostRands: l.unitCostR,
        unitSellRands: l.unitSellR,
        lineCostRands: l.lineCostR,
        lineSellRands: l.lineSellR,
      })
    }
  }
  return out
}

/** Deposit line items from the BOM — one per starred equipment section present. */
export function computeDeposit(bom: DesignBom): { items: DepositItem[]; totalR: number } {
  const items: DepositItem[] = []
  for (const s of bom.sections) {
    if (!DEPOSIT_SECTIONS.includes(s.name) || s.sellR <= 0) continue
    items.push({ name: s.name, amountRands: round2(s.sellR) })
  }
  return { items, totalR: round2(items.reduce((t, i) => t + i.amountRands, 0)) }
}

/**
 * Run the SANS compliance engine against the live design + BOM. Checks need a
 * catalog panel + inverter to size the string physics; without them (nothing
 * designed yet / custom-only equipment) we return [] rather than guessing.
 */
export function designComplianceChecks(opts: {
  design: SystemDesign
  bom: DesignBom
  catalog: Map<string, EquipmentCatalogItem>
  gridSupply?: string
}): ComplianceCheck[] {
  const { design, bom, catalog, gridSupply } = opts
  const panelItem = design.panels.map((g) => (g.catalogId ? catalog.get(g.catalogId) : undefined)).find(Boolean)
  const inverterItem = design.inverters[0]?.catalogId ? catalog.get(design.inverters[0].catalogId!) : undefined
  if (!panelItem || !inverterItem) return []
  const batteryItem = design.batteries[0]?.catalogId ? catalog.get(design.batteries[0].catalogId!) : undefined

  const panelCount = design.panels.reduce((s, g) => s + g.panelCount, 0)
  if (panelCount <= 0) return []
  const spec = parseInverterSizingSpec(inverterItem.notes)
  const layout = computeStringLayout({
    panelCount, panel: panelItem, spec,
    conditions: design.site ?? DEFAULT_SITE_CONDITIONS,
  })
  const routeMetres = Math.max(15, ...design.panels.map((g) => g.distanceFromCombinerM ?? 0))

  // No CATALOG battery — but the battery checks must still fire when the DESIGN
  // carries one (custom/pending batteries would otherwise silently skip the
  // blocker-class comms/fuse/voltage-class checks). The stub carries the
  // design's kWh so `if (battery.kwh)` gates on battery PRESENCE, not on
  // whether a catalog row exists; parseBatteryClass on it returns null →
  // the honest "voltage class missing" info row.
  const batteryStub = {
    kwh: designBatteryKwh(design) || null,
    description: design.batteries[0]?.model ?? '',
    notes: null,
  } as unknown as EquipmentCatalogItem

  return runComplianceChecks({
    bom: bomToSupplierBom(bom),
    layout,
    spec,
    panel: panelItem,
    inverter: inverterItem,
    battery: batteryItem ?? batteryStub,
    inverterCount: design.inverters.reduce((s, u) => s + u.qty, 0),
    batteryCount: design.batteries.reduce((s, b) => s + b.qty, 0),
    panelCount,
    evChargerKw: design.extras.some((x) => x.type === 'evCharger') ? 'EV' : '',
    routeMetres,
    gridSupply: gridSupply ?? '',
  })
}

export interface DesignQuoteArgs {
  design: SystemDesign
  /** Consolidated BOM (one line per identity) — what the customer/PO should see. */
  bom: DesignBom
  catalog: Map<string, EquipmentCatalogItem>
  req: {
    customer_name?: string | null
    customer_phone?: string | null
    customer_email?: string | null
    address?: string | null
    municipality?: string | null
    monthly_kwh?: string | number | null
    grid_supply?: string | null
  }
  quoteNumber: string
  expiryDays: number
  tariffRate: number
  complianceChecks?: ComplianceCheck[]
}

/**
 * Build the full QuoteData blob renderCustomerQuote() renders. Every required
 * field is populated (the renderer prints literal `{{key}}` for anything
 * missing), with section subtotals mapped from the DesignBom's sections.
 */
export function buildQuoteDataFromDesign(args: DesignQuoteArgs): QuoteData {
  const { design, bom, req, quoteNumber, expiryDays, tariffRate } = args

  const sell = (name: string) => bom.sections.find((s) => s.name === name)?.sellR ?? 0
  const balance = computeBalance(design, { monthly_kwh: req.monthly_kwh ?? null })

  const totalKwp = designTotalKwp(design)
  const inverterKw = designInverterKw(design)
  const batteryKwh = designBatteryKwh(design)
  const panelCount = design.panels.reduce((s, g) => s + g.panelCount, 0)
  const inv0 = design.inverters[0]
  const bat0 = design.batteries[0]
  const invQty = design.inverters.reduce((s, u) => s + u.qty, 0)
  const batQty = design.batteries.reduce((s, b) => s + b.qty, 0)
  const dailyGen = generationDailyKwh(design)

  // Savings / ROI — read off the same honest engine as the Savings section.
  const annualGen = dailyGen * 365
  const annualCons = (balance.demandKwh ?? 0) * 365
  const savings = annualGen > 0 && annualCons > 0 && bom.totalSellR > 0
    ? buildSavingsSummary(annualGen, annualCons, batteryKwh, bom.totalSellR, { tariffRate })
    : null

  const deposit = computeDeposit(bom)
  const totalR = bom.totalSellR
  const balanceR = round2(totalR - deposit.totalR)

  const issued = new Date()
  const expires = new Date(issued.getTime() + expiryDays * 86_400_000)

  const panelsSell = sell('Panels')
  const cablesSell = round2(sell('Cables & Connectors') + sell('Cabling'))
  const dcSell = sell('DC combiner')
  const inverterSell = sell('Inverter')
  const batterySell = sell('Batteries')
  const accessoriesSell = sell('Monitoring')
  const acDbSell = round2(sell('AC board') + sell('Extras'))
  const earthingSell = sell('Earthing')
  const consumablesSell = sell('Consumables')
  const labourSell = sell('Labour')

  const monthlyUsage = req.monthly_kwh != null && String(req.monthly_kwh).trim() !== ''
    ? String(req.monthly_kwh)
    : balance.demandKwh != null ? String(Math.round(balance.demandKwh * DAYS_PER_MONTH)) : '—'

  return {
    // Header
    quoteNumber,
    dateIssued: dateZA(issued),
    dateExpires: dateZA(expires),
    customerName: req.customer_name ?? '',
    municipality: req.municipality ?? '',

    // Customer card
    customerPhone: req.customer_phone ?? '',
    customerEmail: req.customer_email ?? '',
    siteAddress: req.address ?? '',
    monthlyUsageKwh: monthlyUsage,

    // System overview
    systemType: batteryKwh > 0 ? 'Hybrid solar + battery backup' : 'Grid-tied solar (no battery)',
    inverterModel: inv0 ? `${inv0.model}${invQty > 1 ? ` ×${invQty}` : ''}` : '—',
    inverterKw: inverterKw > 0 ? inverterKw.toFixed(1) : '—',
    batteryModel: bat0 ? bat0.model : batteryKwh > 0 ? 'Battery storage' : 'None',
    batteryKwh: batteryKwh > 0 ? batteryKwh.toFixed(1) : '0',
    panelCount: String(panelCount),
    panelModel: design.panels[0]?.panelModel ?? '—',
    totalKwp: totalKwp.toFixed(2),
    monthlyGenKwh: String(Math.round(dailyGen * DAYS_PER_MONTH)),

    // BOM section subtotals (formatted)
    panelCost: rand(panelsSell),
    panelMountingConsumables: rand(0),
    panelMountingSubtotal: rand(panelsSell),
    cablesCost: rand(cablesSell),
    cablesSubtotal: rand(cablesSell),
    dcCombinerConfig: design.dcCombiners[0] ? combinerConfigLabel(design.dcCombiners[0]) : `${design.panels.length}-string`,
    dcCombinerCost: rand(dcSell),
    dcProtectionSubtotal: rand(dcSell),
    inverterQty: String(invQty),
    inverterCost: rand(inverterSell),
    batteryQty: String(batQty),
    batteryCost: rand(batterySell),
    batteryAccessoriesCost: rand(accessoriesSell),
    inverterBatterySubtotal: rand(round2(inverterSell + batterySell + accessoriesSell)),
    acDbCost: rand(acDbSell),
    acDbSubtotal: rand(acDbSell),
    earthingSpikeCount: String(design.earthing.spikeCount ?? 0),
    earthingCost: rand(earthingSell),
    earthingSubtotal: rand(earthingSell),
    consumablesCost: rand(consumablesSell),
    consumablesSubtotal: rand(consumablesSell),
    labourCost: rand(labourSell),
    labourSubtotal: rand(labourSell),

    // Totals
    materialsLabourSubtotal: rand(totalR),
    quoteTotal: rand(totalR),
    depositTotal: rand(deposit.totalR),
    balanceTotal: rand(balanceR),
    quoteTotalRands: totalR,
    depositTotalRands: deposit.totalR,

    // ROI
    annualOffsetPercent: savings ? `${savings.balance.annual.gridIndependencePct}%` : '—',
    monthlySavingR: savings ? rand(savings.annualSavingR / 12) : '—',
    tariffRate: `R${tariffRate.toFixed(2)}/kWh`,
    annualSavingR: savings ? rand(savings.annualSavingR) : '—',
    paybackMonths: savings?.financial.paybackYears != null ? String(Math.round(savings.financial.paybackYears * 12)) : '—',
    paybackYears: savings?.financial.paybackYears != null ? savings.financial.paybackYears.toFixed(1) : '—',
    paybackMonthsEscalated: savings?.financial.paybackYearsEscalated != null ? String(Math.round(savings.financial.paybackYearsEscalated * 12)) : '—',

    // Monthly generation table (customer-facing) — read straight off the honest
    // hourly balance so the quote's month-by-month rows match the Savings view.
    ...(savings ? {
      monthlyGenTable: savings.balance.months.map((m) => ({
        month: m.month,
        solarGenKwh: Math.round(m.generationKwh),
        consumptionKwh: Math.round(m.consumptionKwh),
        importedKwh: Math.round(m.importedKwh),
        energyFromSolarPct: m.consumptionKwh > 0 ? Math.round((m.generationKwh / m.consumptionKwh) * 100) : 0,
        billBefore: rand(m.billBeforeR),
        billAfter: rand(m.billAfterR),
        saving: rand(m.savingR),
      })),
      annualSolarGenKwh: Math.round(savings.balance.annual.generationKwh).toLocaleString('en-ZA'),
      annualConsumptionKwh: Math.round(savings.balance.annual.consumptionKwh).toLocaleString('en-ZA'),
      annualGridOffsetPct: String(savings.balance.annual.gridIndependencePct),
    } : {}),

    // Deposit + supplier BOM + verification
    depositItems: deposit.items,
    supplierBom: bomToSupplierBom(bom),
    complianceChecks: args.complianceChecks ?? [],
    calculationWarnings: [],
  }
}
