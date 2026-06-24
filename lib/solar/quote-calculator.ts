import type {
  ComparisonRow,
  MonthlyGenRow,
  MultiOptionQuoteData,
  OptionQuoteData,
  QuoteData,
  SupplierBomItem,
  TwentyYearRow,
} from './render-quote'
import {
  computeStringLayout,
  parseBatteryClass,
  runComplianceChecks,
  EDGE_OF_CLOUD_FACTOR,
  type ComplianceCheck,
  type StringLayout,
} from './compliance'

export const PSH_GAUTENG = 5.3
export const SYSTEM_EFFICIENCY = 0.8
export const MARKUP = 1.15
export const COC_RANDS = 1500
export const MAX_RECOMMENDED_DC_AC_RATIO = 1.3
export const MIN_BATTERY_KWH_PER_INVERTER_KW = 2

export const TARIFF_BY_MUNICIPALITY: Record<string, number> = {
  'City of Johannesburg': 2.92,
  Tshwane: 2.85,
  Ekurhuleni: 2.78,
  Eskom: 2.65,
}

// ── Cable rate card ──────────────────────────────────────────────────────────
// Rough installed cost (R) per single-conductor metre by cross-section (copper).
// Aluminium runs ~0.55× copper. Estimates until a supplier cable price list is
// wired in — every cabling BOM line is flagged `approx`.
export const CABLE_COST_PER_M_CU: Record<string, number> = {
  '1.5mm²': 9, '2.5mm²': 13, '4mm²': 20, '6mm²': 30, '10mm²': 48,
  '16mm²': 75, '25mm²': 115, '35mm²': 160, '50mm²': 225, '70mm²': 320, '95mm²': 430,
}

/** Installed cost (R) per single-conductor metre for a material + cross-section. */
export function cableCostPerMeter(material: string, crossSection: string): number {
  const base = CABLE_COST_PER_M_CU[crossSection] ?? 0
  return /al/i.test(material) ? Math.round(base * 0.55) : base
}

// ── Pricing settings (company_settings, migration 031) ───────────────────────
// Business-policy knobs extracted from the constants above. Defaults reproduce
// the historical behaviour exactly — quotes without explicit pricing are
// byte-identical to pre-extraction output (locked by the test suite).

export interface PricingSettings {
  /** Sell = cost × markup for equipment + market-estimate items (1.15 = 15%). */
  markup: number
  cocRands: number
  labourInverterPerW: number
  labourPanelPerW: number
  storeyPremium2: number
  storeyPremium3: number
  tariffs: Record<string, number>
}

export const DEFAULT_PRICING: PricingSettings = {
  markup: MARKUP,
  cocRands: COC_RANDS,
  labourInverterPerW: 0.25,
  labourPanelPerW: 0.75,
  storeyPremium2: 2000,
  storeyPremium3: 5000,
  tariffs: TARIFF_BY_MUNICIPALITY,
}

/** Map a company_settings row to PricingSettings; anything missing → default. */
export function mapSettingsToPricing(row: Record<string, unknown> | null | undefined): PricingSettings {
  if (!row) return DEFAULT_PRICING
  const num = (value: unknown, fallback: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
  const tariffs = row.tariffs && typeof row.tariffs === 'object' && !Array.isArray(row.tariffs)
    ? { ...TARIFF_BY_MUNICIPALITY, ...(row.tariffs as Record<string, number>) }
    : TARIFF_BY_MUNICIPALITY
  return {
    markup: 1 + num(row.markup_pct, 15) / 100,
    cocRands: num(row.coc_fee_rands, COC_RANDS),
    labourInverterPerW: num(row.labour_inverter_per_w, 0.25),
    labourPanelPerW: num(row.labour_panel_per_w, 0.75),
    storeyPremium2: num(row.storey_premium_2, 2000),
    storeyPremium3: num(row.storey_premium_3, 5000),
    tariffs,
  }
}

type GatewayConfig = {
  gatewaySellRands: number
  commsSellRands: number
  fuseHolderSellRands: number
  cableSellRands: number
  lugSellRands: number
}

// Market-estimate items whose SELL derives from cost × markup. Anything with a
// literal sell price below comes from the supplier price list and does NOT
// flex with markup — a different installer edits the price list, not these.
interface MarkupDerivedPrices {
  gatewayByBrand: Record<string, GatewayConfig | null>
  pvStringFuseSell: number
  batteryCommsCableSell: number
  batteryCableSetSell: number
  evTypeBElcbSell: number
  evWarningLabelsSell: number
  swaGlandSell: number
  acDbComponents: Array<{ sku: string; description: string; costRands: number; sellRands: number }>
  acDbBundleSell: number
  evChargerSpecs: Record<string, EvChargerSpec>
}

const derivedPricesCache = new Map<number, MarkupDerivedPrices>()

function getDerivedPrices(markup: number): MarkupDerivedPrices {
  const cached = derivedPricesCache.get(markup)
  if (cached) return cached

  const sigenergyGateway: GatewayConfig = {
    gatewaySellRands: roundCurrency(6980.5 * markup),
    commsSellRands: roundCurrency(2104.5 * markup),
    fuseHolderSellRands: roundCurrency(901.6 * markup),
    cableSellRands: roundCurrency((278.71 * markup) * 4),
    lugSellRands: roundCurrency((16.92 * markup) * 4),
  }

  // AC & DB section itemized per RULE-AC-01..04 (prices from pricing-reference.md).
  const acDbComponents = [
    { sku: 'JN2125G63A', description: 'Chint 2P 63A changeover switch (grid/inverter isolation)', costRands: 468.8, sellRands: 539.12 },
    { sku: 'NXB-63G-2P-C63', description: 'Chint 63A 2P MCB C-curve 6kA', costRands: 158.72, sellRands: 182.53 },
    { sku: 'NU6-IIG-2P-40KA-275V', description: 'Chint AC SPD Type 2, 2P 40kA 275V', costRands: 484.29, sellRands: 556.93 },
    { sku: 'DB-SH12PN', description: 'Chint 12-way essential loads DB IP65', costRands: 861.22, sellRands: 990.4 },
    { sku: 'SP8X12-12-BK', description: '12-way black DIN terminal bar 25mm', costRands: 98, sellRands: 112.7 },
    { sku: 'SP8X12-12-BLU', description: '12-way blue DIN terminal bar 25mm', costRands: 98, sellRands: 112.7 },
    { sku: 'SP6X9-12-GN', description: '12-way green earth bar 16mm DIN', costRands: 52.44, sellRands: 60.31 },
    { sku: 'CT50X50WHT', description: 'CT trunking PVC 50×50 white 3m', costRands: 205.68, sellRands: 236.53 },
    { sku: 'AC-DB-SUNDRY', description: 'DB wiring sundries and integration allowance', costRands: roundCurrency(2200 / markup), sellRands: 2200 },
  ]

  const value: MarkupDerivedPrices = {
    gatewayByBrand: {
      Sigenergy: sigenergyGateway,
      SigenStor: sigenergyGateway,
      'Sigenergy/SigenStor': sigenergyGateway,
    },
    pvStringFuseSell: roundCurrency(85 * markup),
    batteryCommsCableSell: roundCurrency(250 * markup),
    batteryCableSetSell: roundCurrency(807.68 * markup),
    evTypeBElcbSell: roundCurrency(3200 * markup),
    evWarningLabelsSell: roundCurrency(120 * markup),
    swaGlandSell: roundCurrency(45 * markup),
    acDbComponents,
    acDbBundleSell: roundCurrency(acDbComponents.reduce((sum, item) => sum + item.sellRands, 0)),
    evChargerSpecs: {
      '7kW':  { chargerCostRands: 4350,  chargerSellRands: roundCurrency(4350  * markup), cableSellPerM: 32, mcbSellRands: 350, labourSellRands: 1500 },
      '11kW': { chargerCostRands: 6500,  chargerSellRands: roundCurrency(6500  * markup), cableSellPerM: 48, mcbSellRands: 520, labourSellRands: 1800 },
      '22kW': { chargerCostRands: 11300, chargerSellRands: roundCurrency(11300 * markup), cableSellPerM: 68, mcbSellRands: 690, labourSellRands: 2200 },
    },
  }
  derivedPricesCache.set(markup, value)
  return value
}

const DC_BREAKER_SELL_BY_STANDARD: Record<number, number> = {
  10: 362.25,
  16: 402.5,
  20: 402.5,
  25: 414,
  32: 425.5,
  40: 425.5,
}

// Items below carry literal supplier price-list values (RULE-PRC-03 market
// estimates that flex with markup live in getDerivedPrices above).
const BATTERY_FUSE_DISCONNECT_SELL_RANDS = 1036.84                      // 143018 KELEC NH00 2P 160A (priced)
const EV_INPUT_DB_SELL_RANDS = 353.64                                   // DB-SH6PN (priced)
const EV_SPD_SELL_RANDS = 556.93                                        // NU6-IIG-2P-40KA-275V (priced)
const DC_COMBINER_ENCLOSURE_SELL_RANDS = 900
const DC_SPD_SELL_RANDS = 1151.77
const MC4_PAIR_SELL_RANDS = 19.55
const CABLE_4MM_SELL_PER_M = 15.8
const EARTH_FLEX_SELL_PER_M = 23.21
const FLEX_16MM_SELL_PER_M = 60.41
const CONDUIT_LENGTH_SELL_RANDS = 16.27
const CONDUIT_COUPLING_SELL_RANDS = 0.86
const CONDUIT_SADDLE_SELL_RANDS = 3.44
const CONDUIT_ANCHOR_SELL_RANDS = 1.28
const CONDUIT_GLAND_SELL_RANDS = 8.36
const EARTH_ROD_SELL_RANDS = 222.18
const EARTH_TIP_SELL_RANDS = 82.52
const EARTH_COUPLING_SELL_RANDS = 137.54
const EARTH_CLAMP_SELL_RANDS = 33.86
const EARTH_MUTI_SELL_RANDS = 423.2
const BARE_EARTH_WIRE_SELL_PER_M = 54.26

// ── EV Charger pricing ────────────────────────────────────────────────────────
const EV_CHARGER_CABLE_ROUTE_M = 10

interface EvChargerSpec {
  chargerCostRands: number
  chargerSellRands: number
  cableSellPerM: number
  mcbSellRands: number
  labourSellRands: number
}

const EV_CONSUMABLES_SELL_RANDS = 200

function parseEvChargerSize(evCharger: string | undefined | null): string | null {
  if (!evCharger || evCharger === 'No') return null
  if (evCharger.includes('22kW')) return '22kW'
  if (evCharger.includes('11kW')) return '11kW'
  if (evCharger.includes('7kW'))  return '7kW'
  return null
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHLY_SOLAR_FACTORS = [0.93, 0.94, 0.98, 1.01, 1.04, 1.05, 1.06, 1.05, 1.02, 0.98, 0.96, 0.98]

export interface InverterSizingSpec {
  maxPvKwp?: number
  maxPanels?: number
  maxStrings?: number
  parallelStringsPerMppt?: number
  seriesPanelsPerString?: number
  seriesMin?: number
  seriesMax?: number
  stringExample?: string
  batteryBrands?: string[]
  // Electrical limits for string physics validation (compliance.ts)
  maxDcVoltage?: number
  mpptMinVoltage?: number
  mpptMaxVoltage?: number
  mpptCount?: number
  maxIscPerMpptA?: number
  batteryClass?: string          // 'LV' | 'HV' | 'PROPRIETARY'
  batteryVoltageRange?: string   // e.g. '40-60'
  rawNotes?: string
}

export interface SizingSnapshot {
  dailyUsageKwh: number
  targetSolarKwp: number
  targetInverterKw: number
  minimumBatteryKwh: number
  targetPanelCount: number
  inverterQuantity: number
  selectedBatteryCount: number | null
  selectedBatteryBankKwh: number | null
  maxPanelCountOnSelectedInverter: number | null
  maxPvKwpOnSelectedInverter: number | null
  targetDailySolarOutputKwh: number | null
  stringSummary: string | null
}

export type EquipmentCatalogCategory =
  | 'inverter' | 'battery' | 'panel' | 'connector' | 'cable' | 'isolator' | 'mounting'
  | 'enclosure' | 'breaker' | 'fuse' | 'fuseholder' | 'spd' | 'disconnect' | 'rccb' | 'other'
export type EquipmentCatalogPhase = 'single' | 'three' | 'any'
export type QuoteTier = 'premium' | 'recommended' | 'budget'

export interface EquipmentCatalogItem {
  id: string
  category: EquipmentCatalogCategory
  brand: string
  sku: string
  description: string
  watts_ac: number | null
  watts_dc: number | null
  kwh: number | null
  phase: EquipmentCatalogPhase
  cost_rands: number
  isc_amps: number | null
  voc_volts: number | null
  active: boolean
  sort_order: number
  notes: string | null
  /** Stamped by DB trigger whenever cost_rands changes (migration 030). */
  price_updated_at?: string | null
}

export interface QuoteTierConfig {
  id: string
  min_inverter_kw: number
  max_inverter_kw: number
  tier: QuoteTier
  phase: EquipmentCatalogPhase
  inverter_id: string
  battery_id: string
  panel_id: string
  active: boolean
  sort_order: number
}

export interface CalculatorInput {
  quoteNumber: string
  tier?: QuoteTier
  tierLabel?: string
  customerName: string
  customerPhone: string
  customerEmail: string
  siteAddress: string
  municipality: string
  gridSupply: string
  storeys: string
  monthlyKwh: number
  advancedMonthlyKwh?: Array<number | null>
  batteryHours: number
  essentialLoadKw: number
  tariffRate?: number
  /** Measured routes from the map designer (Roof Design tab). Route totals drive
   *  cable quantities and the longest DC run drives the voltage-drop check. With
   *  no measured routes the calculator falls back to a conservative 15m default. */
  cableRoutes?: MeasuredCableRoutes | null
  /** Company pricing policy (migration 031). Missing fields → DEFAULT_PRICING,
   *  which reproduces the historical hardcoded behaviour exactly. */
  pricing?: Partial<PricingSettings> | null
  lockedPanelCount?: number | null
  inverterQuantity?: number | null
  batteryQuantityOverride?: number | null
  panelCountOverride?: number | null
  targetInverterKwOverride?: number | null
  minimumBatteryKwhOverride?: number | null
  evCharger?: string
  equipment: {
    inverter: EquipmentCatalogItem
    battery: EquipmentCatalogItem
    panel: EquipmentCatalogItem
  }
}

export interface MeasuredCableRoutes {
  dcRunsM: number[]
  acM: number
  batteryM: number
  earthM: number
}

type Breakdown = {
  panelCount: number
  batteryCount: number
  panelSellTotal: number
  mountingSellTotal: number
  panelMountingSubtotalRands: number
  cablesSellTotal: number
  dcProtectionSubtotalRands: number
  inverterSellTotal: number
  batterySellTotal: number
  batteryAccessoriesSellTotal: number
  inverterBatterySubtotalRands: number
  acDbSubtotalRands: number
  earthingSpikeCount: number
  earthingSubtotalRands: number
  consumablesSubtotalRands: number
  labourSubtotalRands: number
  monthlyGenerationKwh: number
  annualSolarGenerationKwh: number
  annualConsumptionKwh: number
  annualSavingRands: number
  monthlySavingRands: number
  offsetPercent: number
  depositItems: QuoteData['depositItems']
  quoteTotalRands: number
  paybackMonths: number
  paybackMonthsEscalated: number
  warnings: string[]
  supplierBom: SupplierBomItem[]
  complianceChecks: ComplianceCheck[]
  stringLayout: StringLayout
  dcCombinerConfig: string
  monthlyGenTable: MonthlyGenRow[]
  twentyYearTable: TwentyYearRow[]
  lifetimeBillSavings: number
  estimatedNetSavings: number
  cumulativeImpact20Y: number
  npv: number
  roiPct: number
  evChargerSubtotalRands: number
  evChargerSizeKw: string
  evChargerUnitSellRands: number
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function formatRands(value: number) {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatMoneyShort(value: number) {
  return `~R ${Math.round(value).toLocaleString('en-ZA')}`
}

function formatPlain(value: number, digits = 0) {
  return value.toLocaleString('en-ZA', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatPercent(value: number, digits = 0) {
  return `${value.toLocaleString('en-ZA', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeBrand(brand: string) {
  return brand.trim().toLowerCase()
}

function coercePositiveNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value !== 'string') return null

  const cleaned = value.replace(/[^0-9.:-]/g, '').trim()
  if (!cleaned) return null

  if (cleaned.includes(':')) {
    const [left, right] = cleaned.split(':').map((part) => Number(part))
    if (Number.isFinite(left) && Number.isFinite(right) && right > 0) {
      return left / right
    }
  }

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeSpecKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function ensureStringArray(value: unknown) {
  if (!Array.isArray(value)) return null
  const strings = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
  return strings.length ? strings : null
}

function summarizeStringSetup(spec: InverterSizingSpec) {
  if (spec.stringExample) return spec.stringExample

  const parts: string[] = []
  if (spec.maxStrings) parts.push(`${spec.maxStrings} strings total`)
  if (spec.parallelStringsPerMppt) parts.push(`${spec.parallelStringsPerMppt} parallel per MPPT`)

  if (spec.seriesPanelsPerString) {
    parts.push(`${spec.seriesPanelsPerString} panels in series`)
  } else if (spec.seriesMin && spec.seriesMax) {
    parts.push(`${spec.seriesMin}-${spec.seriesMax} panels in series`)
  } else if (spec.seriesMax) {
    parts.push(`up to ${spec.seriesMax} panels in series`)
  }

  return parts.length ? parts.join(' · ') : null
}

export function parseInverterSizingSpec(notes: string | null | undefined): InverterSizingSpec | null {
  if (!notes?.trim()) return null

  const rawNotes = notes.trim()

  try {
    const parsed = JSON.parse(rawNotes) as Record<string, unknown>
    const batteryBrands = ensureStringArray(parsed.batteryBrands ?? parsed.compatibleBatteryBrands ?? parsed.compatible_battery_brands)
    return {
      maxPvKwp: coercePositiveNumber(parsed.maxPvKwp ?? parsed.max_pv_kwp) ?? undefined,
      maxPanels: coercePositiveNumber(parsed.maxPanels ?? parsed.max_panels) ?? undefined,
      maxStrings: coercePositiveNumber(parsed.maxStrings ?? parsed.max_strings) ?? undefined,
      parallelStringsPerMppt: coercePositiveNumber(parsed.parallelStringsPerMppt ?? parsed.parallel_strings_per_mppt) ?? undefined,
      seriesPanelsPerString: coercePositiveNumber(parsed.seriesPanelsPerString ?? parsed.series_panels_per_string) ?? undefined,
      seriesMin: coercePositiveNumber(parsed.seriesMin ?? parsed.series_min) ?? undefined,
      seriesMax: coercePositiveNumber(parsed.seriesMax ?? parsed.series_max) ?? undefined,
      stringExample: typeof parsed.stringExample === 'string' ? parsed.stringExample.trim() : (typeof parsed.string_example === 'string' ? parsed.string_example.trim() : undefined),
      batteryBrands: batteryBrands ?? undefined,
      maxDcVoltage: coercePositiveNumber(parsed.maxDcVoltage ?? parsed.max_dc_voltage ?? parsed.max_input_voltage) ?? undefined,
      mpptMinVoltage: coercePositiveNumber(parsed.mpptMinVoltage ?? parsed.mppt_min_voltage ?? parsed.mppt_min) ?? undefined,
      mpptMaxVoltage: coercePositiveNumber(parsed.mpptMaxVoltage ?? parsed.mppt_max_voltage ?? parsed.mppt_max) ?? undefined,
      mpptCount: coercePositiveNumber(parsed.mpptCount ?? parsed.mppt_count ?? parsed.mppts) ?? undefined,
      maxIscPerMpptA: coercePositiveNumber(parsed.maxIscPerMpptA ?? parsed.max_isc_per_mppt_a) ?? undefined,
      batteryClass: typeof parsed.battery_class === 'string' ? parsed.battery_class.trim().toUpperCase() : (typeof parsed.batteryClass === 'string' ? parsed.batteryClass.trim().toUpperCase() : undefined),
      batteryVoltageRange: typeof parsed.battery_voltage_range === 'string' ? parsed.battery_voltage_range.trim() : undefined,
      rawNotes,
    }
  } catch {
    const lines = rawNotes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const spec: InverterSizingSpec = { rawNotes }
    for (const line of lines) {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex === -1) continue

      const key = normalizeSpecKey(line.slice(0, separatorIndex))
      const value = line.slice(separatorIndex + 1).trim()
      if (!value) continue

      switch (key) {
        case 'max_pv_kwp':
        case 'pv_max_kwp':
        case 'max_dc_kwp':
          spec.maxPvKwp = coercePositiveNumber(value) ?? undefined
          break
        case 'max_panels':
          spec.maxPanels = coercePositiveNumber(value) ?? undefined
          break
        case 'max_strings':
        case 'strings':
          spec.maxStrings = coercePositiveNumber(value) ?? undefined
          break
        case 'parallel_strings_per_mppt':
        case 'parallel_per_mppt':
          spec.parallelStringsPerMppt = coercePositiveNumber(value) ?? undefined
          break
        case 'series_panels_per_string':
        case 'series_panels':
          spec.seriesPanelsPerString = coercePositiveNumber(value) ?? undefined
          break
        case 'series_min':
          spec.seriesMin = coercePositiveNumber(value) ?? undefined
          break
        case 'series_max':
          spec.seriesMax = coercePositiveNumber(value) ?? undefined
          break
        case 'string_example':
        case 'string_layout':
        case 'layout':
          spec.stringExample = value
          break
        case 'battery_brands':
        case 'compatible_battery_brands':
        case 'battery_compatibility':
          spec.batteryBrands = value.split(',').map((entry) => entry.trim()).filter(Boolean)
          break
        case 'max_dc_voltage':
        case 'max_input_voltage':
        case 'voc_max':
          spec.maxDcVoltage = coercePositiveNumber(value) ?? undefined
          break
        case 'mppt_min_voltage':
        case 'mppt_min':
          spec.mpptMinVoltage = coercePositiveNumber(value) ?? undefined
          break
        case 'mppt_max_voltage':
        case 'mppt_max':
          spec.mpptMaxVoltage = coercePositiveNumber(value) ?? undefined
          break
        case 'mppt_count':
        case 'mppts':
          spec.mpptCount = coercePositiveNumber(value) ?? undefined
          break
        default:
          break
      }
    }

    return Object.keys(spec).length > 1 ? spec : { rawNotes }
  }
}

export function estimateDailyUsageKwh(monthlyKwh: number) {
  return roundCurrency(monthlyKwh / 30)
}

export function estimateTargetSolarKwp(monthlyKwh: number) {
  return roundCurrency(monthlyKwh / (PSH_GAUTENG * 30 * SYSTEM_EFFICIENCY))
}

export function estimateMinimumBatteryKwh(inverterKw: number) {
  return roundCurrency(Math.max(0, inverterKw) * MIN_BATTERY_KWH_PER_INVERTER_KW)
}

export function getInverterQuantity(input: Pick<CalculatorInput, 'inverterQuantity'>) {
  return Math.max(1, Math.round(input.inverterQuantity ?? 1))
}

export function estimateTargetInverterKw(monthlyKwh: number, essentialLoadKw: number, lockedSolarKwp?: number | null) {
  const solarKw = lockedSolarKwp && lockedSolarKwp > 0
    ? lockedSolarKwp / MAX_RECOMMENDED_DC_AC_RATIO
    : estimateTargetSolarKwp(monthlyKwh)
  return Math.max(Math.ceil(solarKw), Math.ceil(essentialLoadKw))
}

function getRestrictedCompatibleBatteryBrands(inverter: EquipmentCatalogItem) {
  const spec = parseInverterSizingSpec(inverter.notes)
  if (spec?.batteryBrands?.length) return spec.batteryBrands.map(normalizeBrand)

  if (inverterBrandKey(inverter) === 'sigenergy') return ['sigenergy']

  return null
}

/**
 * The brand ecosystem an inverter belongs to, normalised. Sigenergy / SigenStor
 * units collapse to a single 'sigenergy' key no matter how the row spells them.
 */
function inverterBrandKey(inverter: EquipmentCatalogItem) {
  const inverterBrand = normalizeBrand(inverter.brand)
  const inverterSku = normalizeBrand(inverter.sku)
  const inverterDescription = normalizeBrand(inverter.description)

  if (
    inverterBrand.includes('sigenergy') ||
    inverterSku.includes('sig-inv') ||
    inverterDescription.includes('sigenstor') ||
    inverterDescription.includes('sigenergy')
  ) {
    return 'sigenergy'
  }

  return inverterBrand
}

/**
 * Batteries locked to one inverter ecosystem (proprietary stack architecture,
 * not a generic 48V LV pack). A proprietary battery may ONLY pair with an inverter
 * of the same brand — SigenStor / SigenStack batteries need a Sigenergy inverter.
 * Returns the required inverter brand key, or null for open batteries.
 */
function getBatteryProprietaryBrand(battery: EquipmentCatalogItem) {
  const batteryBrand = normalizeBrand(battery.brand)
  const batteryDescription = normalizeBrand(battery.description)
  const batterySku = normalizeBrand(battery.sku)

  if (
    batteryBrand.includes('sigenergy') ||
    batteryDescription.includes('sigenstor') ||
    batteryDescription.includes('sigenstack') ||
    batterySku.includes('sig-bat')
  ) {
    return 'sigenergy'
  }

  return null
}

export function isBatteryCompatibleWithInverter(inverter: EquipmentCatalogItem, battery: EquipmentCatalogItem) {
  // Reciprocal lock: a proprietary battery (SigenStor / SigenStack) only pairs
  // with an inverter of its own brand. This must hold no matter which side
  // declares the restriction — a Sigenergy battery on a non-Sigenergy inverter
  // is just as invalid as the other-brand battery on a Sigenergy inverter.
  const batteryProprietaryBrand = getBatteryProprietaryBrand(battery)
  if (batteryProprietaryBrand && inverterBrandKey(inverter) !== batteryProprietaryBrand) {
    return false
  }

  const restrictedBrands = getRestrictedCompatibleBatteryBrands(inverter)
  if (!restrictedBrands) return true

  const batteryBrand = normalizeBrand(battery.brand)
  const batteryDescription = normalizeBrand(battery.description)
  const batterySku = normalizeBrand(battery.sku)

  if (batteryDescription.includes('sigenstack') || batterySku.includes('sig-bat-12k')) {
    return false
  }

  return restrictedBrands.some((brand) => batteryBrand.includes(brand))
}

export function describeCompatibleBatteryBrands(inverter: EquipmentCatalogItem) {
  const restrictedBrands = getRestrictedCompatibleBatteryBrands(inverter)
  if (!restrictedBrands?.length) return 'Most 48V-compatible batteries in the catalog'
  return restrictedBrands.map((brand) => brand.charAt(0).toUpperCase() + brand.slice(1)).join(', ')
}

export type CompatLevel = 'ok' | 'warn' | 'block'
export interface CompatResult { level: CompatLevel; reason: string }

function parseNotesObject(notes: string | null | undefined): Record<string, unknown> | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function parseDeviceProtocols(notes: string | null | undefined): string[] {
  const obj = parseNotesObject(notes)
  const p = obj?.protocols
  if (Array.isArray(p)) return p.map((x) => String(x).toLowerCase())
  if (typeof p === 'string') return [p.toLowerCase()]
  return []
}

/**
 * Full battery ↔ inverter compatibility verdict for the equipment selector.
 *   block = cannot be used (hard) · warn = usable but flagged (soft danger mark) · ok
 * Factors: grid-tie/no-battery inverter, brand/proprietary lock (Sigenergy),
 * LV/HV voltage class, and comms/BMS protocol (warn). The last two are hooks that
 * activate automatically once grid-tie inverters / `protocols` notes exist.
 */
export function evaluateBatteryForInverter(
  inverter: EquipmentCatalogItem | null,
  battery: EquipmentCatalogItem,
): CompatResult {
  if (!inverter) return { level: 'ok', reason: '' }

  // BLOCK — inverter doesn't take batteries at all (grid-tie / pure string inverter)
  const inverterNotes = parseNotesObject(inverter.notes)
  const noBatterySupport =
    inverterNotes?.battery_support === false ||
    /grid[\s-]?tie/i.test(`${inverter.description} ${inverter.sku}`)
  if (noBatterySupport) {
    return { level: 'block', reason: `${inverter.description} is grid-tie / PV-only — it can't take batteries.` }
  }

  // BLOCK — proprietary battery locked to its own inverter ecosystem.
  // (SigenStor / SigenStack batteries only pair with a Sigenergy inverter — this
  // is the reciprocal of the inverter-side rule below, and is phrased from the
  // battery's side so the reason makes sense under a non-Sigenergy inverter.)
  const batteryProprietaryBrand = getBatteryProprietaryBrand(battery)
  if (batteryProprietaryBrand && inverterBrandKey(inverter) !== batteryProprietaryBrand) {
    const brandLabel = batteryProprietaryBrand.charAt(0).toUpperCase() + batteryProprietaryBrand.slice(1)
    return { level: 'block', reason: `${battery.brand} batteries only pair with a ${brandLabel} inverter — not ${inverter.brand}.` }
  }

  // BLOCK — brand / proprietary restriction (e.g. Sigenergy only pairs with Sigenergy)
  if (!isBatteryCompatibleWithInverter(inverter, battery)) {
    return { level: 'block', reason: `${inverter.brand} only works with ${describeCompatibleBatteryBrands(inverter)} batteries.` }
  }

  // BLOCK — LV/HV voltage-class mismatch (never mix)
  const inverterClass = parseInverterSizingSpec(inverter.notes)?.batteryClass ?? null
  const batteryClass = parseBatteryClass(battery)
  if (
    inverterClass && batteryClass &&
    inverterClass !== 'PROPRIETARY' && batteryClass !== 'PROPRIETARY' &&
    inverterClass !== batteryClass
  ) {
    return { level: 'block', reason: `${batteryClass} battery can't pair with an ${inverterClass}-battery inverter — never mix voltage classes.` }
  }

  // WARN — comms / BMS protocol mismatch (still selectable, flagged with a danger mark)
  const inverterProtocols = parseDeviceProtocols(inverter.notes)
  const batteryProtocols = parseDeviceProtocols(battery.notes)
  if (
    inverterProtocols.length && batteryProtocols.length &&
    !inverterProtocols.some((p) => batteryProtocols.includes(p))
  ) {
    return { level: 'warn', reason: `Comms mismatch: ${battery.brand} uses ${batteryProtocols.join('/')}, ${inverter.brand} expects ${inverterProtocols.join('/')} — verify BMS compatibility before install.` }
  }

  return { level: 'ok', reason: '' }
}

export function getInverterMaxPvKwp(inverter: EquipmentCatalogItem) {
  const spec = parseInverterSizingSpec(inverter.notes)
  if (spec?.maxPvKwp) return spec.maxPvKwp
  const inverterKw = (inverter.watts_ac ?? 0) / 1000
  return inverterKw > 0 ? roundCurrency(inverterKw * MAX_RECOMMENDED_DC_AC_RATIO) : null
}

export function getMaxPanelCountForInverter(inverter: EquipmentCatalogItem, panel: EquipmentCatalogItem) {
  const panelWatts = panel.watts_dc ?? 0
  if (panelWatts <= 0) return null

  const spec = parseInverterSizingSpec(inverter.notes)
  if (spec?.maxPanels) return Math.floor(spec.maxPanels)

  const maxPvKwp = getInverterMaxPvKwp(inverter)
  if (!maxPvKwp) return null

  return Math.max(1, Math.floor((maxPvKwp * 1000) / panelWatts))
}

export interface StringVerdict {
  level: 'pass' | 'warn' | 'block'
  summary: string
  notes: string[]
}

/**
 * Verify a chosen panel + count against the selected inverter's string limits:
 * cold-Voc vs max DC input, PV oversizing (max panel count), and Isc per MPPT.
 * Returns the recommended series×parallel layout + a pass/warn/block verdict.
 * Reuses the same physics as the Settings → Rules String Designer.
 */
export function verifyPanelString(
  inverter: EquipmentCatalogItem | null,
  panel: EquipmentCatalogItem | null,
  panelCount: number,
): StringVerdict | null {
  if (!inverter || !panel || panelCount <= 0) return null

  const spec = parseInverterSizingSpec(inverter.notes)
  const layout = computeStringLayout({ panelCount, panel, spec })
  const notes: string[] = []
  let level: 'pass' | 'warn' | 'block' = 'pass'

  // Honest summary: only equal-length strings can be written as "N × M". When the
  // count doesn't divide evenly, spell out the real split rather than a product
  // that overstates the panel total (e.g. "5×9" for 41 panels).
  const seriesLabel = layout.evenStrings
    ? `${layout.panelsPerString} in series`
    : `${layout.panelsPerStringMin}–${layout.panelsPerString} in series`
  const summary =
    `${layout.stringCount} string${layout.stringCount > 1 ? 's' : ''} × ${seriesLabel}` +
    (layout.parallelStringsPerMppt > 1 ? ` · ${layout.parallelStringsPerMppt} parallel per MPPT` : '')

  // Uneven strings: equal-length strings per MPPT are preferred, so flag the real
  // distribution. longStrings carry one extra panel each.
  if (!layout.evenStrings) {
    if (level === 'pass') level = 'warn'
    const longStrings = panelCount - layout.panelsPerStringMin * layout.stringCount
    const shortStrings = layout.stringCount - longStrings
    const split = [
      longStrings > 0 ? `${longStrings}×${layout.panelsPerString}` : null,
      shortStrings > 0 ? `${shortStrings}×${layout.panelsPerStringMin}` : null,
    ].filter(Boolean).join(' + ')
    notes.push(`${panelCount} panels don't split into equal strings — ${split}. Equal-length strings per MPPT track better; adjust the count or rebalance across MPPTs.`)
  }

  // Upper limit — cold Voc + edge-of-cloud overshoot vs inverter max DC input
  if (layout.stringVocDesignV != null && spec?.maxDcVoltage) {
    if (layout.stringVocDesignV > spec.maxDcVoltage) {
      level = 'block'
      notes.push(`Cold string Voc ≈ ${layout.stringVocColdV}V rises to ≈ ${layout.stringVocDesignV}V with the edge-of-cloud margin — over the inverter's ${spec.maxDcVoltage}V max DC input. Shorten the string.`)
    } else {
      notes.push(`Cold string Voc ≈ ${layout.stringVocColdV}V (≈ ${layout.stringVocDesignV}V with edge-of-cloud margin) — within the ${spec.maxDcVoltage}V limit.`)
    }
    if (layout.maxSeriesAllowed != null) {
      notes.push(`Max ${layout.maxSeriesAllowed} panels per string before the ${spec.maxDcVoltage}V limit (cold Voc ×${EDGE_OF_CLOUD_FACTOR} edge-of-cloud).`)
    }
  } else {
    notes.push(`Add "max_dc_voltage" to ${inverter.brand}'s notes for full string-voltage validation.`)
  }

  // Lower limit — hot Vmp of the shortest string vs the inverter's MPPT minimum.
  // A string below the MPPT window can't be tracked (a single-panel string is the
  // classic trap: well inside the 500 V ceiling, but far below the floor).
  if (spec?.mpptMinVoltage && layout.stringVmpHotV != null) {
    if (layout.stringVmpHotV < spec.mpptMinVoltage) {
      level = 'block'
      const which = layout.evenStrings ? '' : ` (shortest string, ${layout.panelsPerStringMin} panel${layout.panelsPerStringMin > 1 ? 's' : ''})`
      notes.push(`Hot string Vmp ≈ ${layout.stringVmpHotV}V${which} is below the ${spec.mpptMinVoltage}V MPPT minimum — the inverter won't track this string. Add more panels in series.`)
    } else {
      notes.push(`Hot string Vmp ≈ ${layout.stringVmpHotV}V — above the ${spec.mpptMinVoltage}V MPPT minimum.`)
    }
  } else if (!spec?.mpptMinVoltage) {
    notes.push(`Add "mppt_min_voltage" to ${inverter.brand}'s notes to validate the lower (MPPT-minimum) limit.`)
  }

  // PV oversizing — max panel count for this inverter
  const maxPanels = getMaxPanelCountForInverter(inverter, panel)
  if (maxPanels != null) {
    if (panelCount > maxPanels) {
      level = 'block'
      notes.push(`${panelCount} panels exceeds this inverter's max of ${maxPanels} (PV limit).`)
    } else {
      notes.push(`${panelCount} of max ${maxPanels} panels for this inverter.`)
    }
  }

  // Short-circuit current per MPPT
  if (panel.isc_amps && spec?.maxIscPerMpptA) {
    const perStringIsc = panel.isc_amps * layout.parallelStringsPerMppt
    if (perStringIsc > spec.maxIscPerMpptA) {
      if (level !== 'block') level = 'warn'
      notes.push(`≈ ${perStringIsc.toFixed(1)}A into one MPPT exceeds its ${spec.maxIscPerMpptA}A rating — reduce parallel strings.`)
    }
  }

  if (layout.assumed && level === 'pass') {
    level = 'warn'
    notes.push('Inverter string spec not in catalog — layout is an estimate, verify on site.')
  }

  return { level, summary, notes }
}

export function buildSizingSnapshot(input: {
  monthlyKwh: number
  essentialLoadKw: number
  batteryHours?: number
  lockedPanelCount?: number | null
  inverterQuantity?: number | null
  batteryQuantityOverride?: number | null
  panelCountOverride?: number | null
  targetInverterKwOverride?: number | null
  minimumBatteryKwhOverride?: number | null
  inverter?: EquipmentCatalogItem | null
  battery?: EquipmentCatalogItem | null
  panel?: EquipmentCatalogItem | null
}) {
  const dailyUsageKwh = estimateDailyUsageKwh(input.monthlyKwh)
  const targetSolarKwp = estimateTargetSolarKwp(input.monthlyKwh)
  const inverterQuantity = Math.max(1, Math.round(input.inverterQuantity ?? 1))
  const targetInverterKw = input.targetInverterKwOverride && input.targetInverterKwOverride > 0
    ? input.targetInverterKwOverride
    : estimateTargetInverterKw(input.monthlyKwh, input.essentialLoadKw)
  const minimumBatteryKwh = input.minimumBatteryKwhOverride && input.minimumBatteryKwhOverride > 0
    ? input.minimumBatteryKwhOverride
    : estimateMinimumBatteryKwh(targetInverterKw * inverterQuantity)
  const targetPanelCount = input.panelCountOverride && input.panelCountOverride > 0
    ? Math.round(input.panelCountOverride)
    : input.lockedPanelCount && input.lockedPanelCount > 0
      ? input.lockedPanelCount
    : input.panel?.watts_dc
      ? Math.max(1, Math.ceil((targetSolarKwp * 1000) / input.panel.watts_dc))
      : 0

  const selectedBatteryCount = input.inverter && input.battery
    ? getBatteryCount({
        quoteNumber: '',
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        siteAddress: '',
        municipality: 'Eskom',
        gridSupply: '',
        storeys: '',
        monthlyKwh: input.monthlyKwh,
        batteryHours: input.batteryHours ?? 4,
        essentialLoadKw: input.essentialLoadKw,
        lockedPanelCount: input.lockedPanelCount,
        inverterQuantity,
        batteryQuantityOverride: input.batteryQuantityOverride ?? null,
        panelCountOverride: input.panelCountOverride ?? null,
        targetInverterKwOverride: input.targetInverterKwOverride ?? null,
        minimumBatteryKwhOverride: input.minimumBatteryKwhOverride ?? null,
        equipment: {
          inverter: input.inverter,
          battery: input.battery,
          panel: input.panel ?? {
            id: '',
            category: 'panel',
            brand: '',
            sku: '',
            description: '',
            watts_ac: null,
            watts_dc: null,
            kwh: null,
            phase: 'any',
            cost_rands: 0,
            isc_amps: null,
            voc_volts: null,
            active: true,
            sort_order: 0,
            notes: null,
          },
        },
      })
    : null

  const selectedBatteryBankKwh = selectedBatteryCount && input.battery?.kwh
    ? roundCurrency(selectedBatteryCount * input.battery.kwh)
    : null
  const maxPanelCountOnSelectedInverter = input.inverter && input.panel
    ? (getMaxPanelCountForInverter(input.inverter, input.panel) ?? 0) * inverterQuantity
    : null
  const maxPvKwpOnSelectedInverter = input.inverter
    ? roundCurrency((getInverterMaxPvKwp(input.inverter) ?? 0) * inverterQuantity)
    : null
  const spec = input.inverter ? parseInverterSizingSpec(input.inverter.notes) : null
  const targetDailySolarOutputKwh = input.panel?.watts_dc
    ? roundCurrency((targetPanelCount * input.panel.watts_dc * PSH_GAUTENG * SYSTEM_EFFICIENCY) / 1000)
    : null

  return {
    dailyUsageKwh,
    targetSolarKwp,
    targetInverterKw,
    minimumBatteryKwh,
    targetPanelCount,
    inverterQuantity,
    selectedBatteryCount,
    selectedBatteryBankKwh,
    maxPanelCountOnSelectedInverter,
    maxPvKwpOnSelectedInverter,
    targetDailySolarOutputKwh,
    stringSummary: spec ? summarizeStringSetup(spec) : null,
  } satisfies SizingSnapshot
}

function addBomItem(
  items: SupplierBomItem[],
  section: string,
  sku: string,
  description: string,
  quantity: number,
  unitSellRands: number,
  // No default on purpose: the implied cost (sell ÷ markup) must use the
  // markup in effect — buildBreakdown's pushBom wrapper supplies it.
  unitCostRands: number,
) {
  items.push({
    section,
    sku,
    description,
    quantity,
    unitCostRands: roundCurrency(unitCostRands),
    unitSellRands: roundCurrency(unitSellRands),
    lineCostRands: roundCurrency(unitCostRands * quantity),
    lineSellRands: roundCurrency(unitSellRands * quantity),
  })
}

export function getTariffRateForMunicipality(
  municipality: string,
  tariffs: Record<string, number> = TARIFF_BY_MUNICIPALITY,
) {
  return tariffs[municipality] ?? tariffs.Eskom ?? TARIFF_BY_MUNICIPALITY.Eskom
}

function getPanelCount(input: CalculatorInput) {
  if (input.panelCountOverride && input.panelCountOverride > 0) {
    return Math.max(1, Math.round(input.panelCountOverride))
  }

  if (input.lockedPanelCount && input.lockedPanelCount > 0) {
    return input.lockedPanelCount
  }

  const panelWatts = input.equipment.panel.watts_dc ?? 0
  const rawPanels = estimateTargetSolarKwp(input.monthlyKwh) * (1000 / Math.max(panelWatts, 1))
  return Math.max(1, Math.ceil(rawPanels))
}

function getBatteryCount(input: CalculatorInput) {
  if (input.batteryQuantityOverride && input.batteryQuantityOverride > 0) {
    return Math.max(1, Math.round(input.batteryQuantityOverride))
  }

  const batteryKwh = input.equipment.battery.kwh ?? 0
  const inverterKw = ((input.equipment.inverter.watts_ac ?? 0) / 1000) * getInverterQuantity(input)
  const minimumBackupBankKwh = input.essentialLoadKw * input.batteryHours
  const minimumInverterBankKwh = input.minimumBatteryKwhOverride && input.minimumBatteryKwhOverride > 0
    ? input.minimumBatteryKwhOverride
    : estimateMinimumBatteryKwh(inverterKw)
  const requiredBatteryKwh = Math.max(minimumBackupBankKwh, minimumInverterBankKwh)
  return Math.max(1, Math.ceil(requiredBatteryKwh / Math.max(batteryKwh, 0.1)))
}

// RULE-SZ-04: storey access premium — scaffolding/boom time on multi-storey roofs
export function getStoreysPremium(storeys: string, premium2 = 2000, premium3 = 5000) {
  const trimmed = (storeys ?? '').trim()
  if (trimmed.startsWith('3')) return premium3
  if (trimmed.startsWith('2')) return premium2
  return 0
}

// Matthew's confirmed rule: ≤3kW → 2, 4–5kW → 4, 6–10kW → 6, 11kW+ → 6
// (final count always confirmed on site by soil resistivity test)
function getEarthingSpikeCount(inverterKw: number) {
  if (inverterKw <= 3) return 2
  if (inverterKw <= 5) return 4
  return 6
}

function getConsumablesBase(panelCount: number) {
  if (panelCount <= 8) return 850
  if (panelCount <= 14) return 1200
  return 1800
}

// RULE-CON-01/03: conduit in 4m lengths (round up), couplings = lengths − 1,
// saddles = ceil(m/1.25), anchors = saddles × 2. Glands are itemized separately
// (RULE-CON-04) so the BOM and compliance check can see them.
function getConduitSellTotal(routeMetres: number) {
  const lengths = Math.max(1, Math.ceil(routeMetres / 4))
  const couplings = Math.max(0, lengths - 1)
  const saddles = Math.max(2, Math.ceil(routeMetres / 1.25))
  const anchors = saddles * 2

  return roundCurrency(
    lengths * CONDUIT_LENGTH_SELL_RANDS +
      couplings * CONDUIT_COUPLING_SELL_RANDS +
      saddles * CONDUIT_SADDLE_SELL_RANDS +
      anchors * CONDUIT_ANCHOR_SELL_RANDS,
  )
}

function getBatteryAccessories(brand: string, gatewayByBrand: Record<string, GatewayConfig | null>) {
  const direct = gatewayByBrand[brand]
  if (direct) return direct

  const normalized = normalizeBrand(brand)
  const match = Object.entries(gatewayByBrand).find(([key]) => normalized.includes(normalizeBrand(key)))
  return match?.[1] ?? null
}

function getDcBreakerStandard(amps: number) {
  const standards = [10, 16, 20, 25, 32, 40]
  return standards.find((candidate) => amps <= candidate) ?? 40
}

function getMonthlyConsumptionSeries(monthlyKwh: number, advancedMonthlyKwh?: Array<number | null>) {
  if (advancedMonthlyKwh?.some((value) => typeof value === 'number' && Number.isFinite(value))) {
    return advancedMonthlyKwh.map((value) => roundCurrency(value ?? monthlyKwh)).slice(0, 12)
  }
  return Array.from({ length: 12 }, () => roundCurrency(monthlyKwh))
}

function buildMonthlyGenTable(monthlyKwh: number, solarGenMonthly: number, tariffRate: number, advancedMonthlyKwh?: Array<number | null>) {
  const consumptionSeries = getMonthlyConsumptionSeries(monthlyKwh, advancedMonthlyKwh)
  const solarTotalFactor = MONTHLY_SOLAR_FACTORS.reduce((sum, factor) => sum + factor, 0)

  return MONTH_LABELS.map((month, index) => {
    const solarGen = roundCurrency((solarGenMonthly * 12 * MONTHLY_SOLAR_FACTORS[index]) / solarTotalFactor)
    const consumption = roundCurrency(consumptionSeries[index] ?? monthlyKwh)
    const offset = Math.min(solarGen, consumption)
    const imported = roundCurrency(Math.max(0, consumption - offset))
    const billBefore = roundCurrency(consumption * tariffRate)
    const billAfter = roundCurrency(imported * tariffRate)
    const saving = roundCurrency(billBefore - billAfter)

    return {
      month,
      solarGenKwh: roundCurrency(solarGen),
      consumptionKwh: roundCurrency(consumption),
      importedKwh: imported,
      energyFromSolarPct: Math.round((offset / Math.max(consumption, 1)) * 100),
      billBefore: formatRands(billBefore),
      billAfter: formatRands(billAfter),
      saving: formatRands(saving),
    }
  })
}

function buildTwentyYearTable(annualConsumptionKwh: number, annualSolarGenKwh: number, tariffRate: number) {
  let cumulativeImpact = 0
  const rows: TwentyYearRow[] = []

  for (let year = 1; year <= 20; year += 1) {
    const degradedSolar = annualSolarGenKwh * Math.pow(0.995, year - 1)
    const escalatedTariff = tariffRate * Math.pow(1.12, year - 1)
    const billBefore = annualConsumptionKwh * escalatedTariff
    const imported = Math.max(0, annualConsumptionKwh - Math.min(annualConsumptionKwh, degradedSolar))
    const billAfter = imported * escalatedTariff
    const annualSaving = billBefore - billAfter

    cumulativeImpact += annualSaving

    rows.push({
      year: `Year ${year}`,
      consumptionKwh: formatPlain(annualConsumptionKwh, 0),
      solarGenKwh: formatPlain(degradedSolar, 0),
      billBefore: formatRands(billBefore),
      billAfter: formatRands(billAfter),
      annualSaving: formatRands(annualSaving),
      cumulativeImpact: formatRands(cumulativeImpact),
    })
  }

  return rows
}

function getPaybackMonthsEscalated(total: number, annualConsumptionKwh: number, annualSolarGenKwh: number, tariffRate: number) {
  let cumulative = 0

  for (let month = 1; month <= 20 * 12; month += 1) {
    const yearIndex = Math.floor((month - 1) / 12)
    const degradedSolar = (annualSolarGenKwh / 12) * Math.pow(0.995, yearIndex)
    const escalatedTariff = tariffRate * Math.pow(1.12, yearIndex)
    const monthlyConsumption = annualConsumptionKwh / 12
    const imported = Math.max(0, monthlyConsumption - Math.min(monthlyConsumption, degradedSolar))
    const saving = (monthlyConsumption - imported) * escalatedTariff
    cumulative += saving
    if (cumulative >= total) return month
  }

  return 240
}

function buildBreakdown(input: CalculatorInput): Breakdown {
  const warnings: string[] = []
  const supplierBom: SupplierBomItem[] = []
  const pricing: PricingSettings = { ...DEFAULT_PRICING, ...(input.pricing ?? {}) }
  const derived = getDerivedPrices(pricing.markup)
  // Local wrapper so the implied internal cost (sell ÷ markup) always uses the
  // markup actually in effect for this quote.
  const pushBom = (
    section: string, sku: string, description: string, quantity: number,
    unitSellRands: number, unitCostRands: number = unitSellRands / pricing.markup,
  ) => addBomItem(supplierBom, section, sku, description, quantity, unitSellRands, unitCostRands)
  const tariffRate = input.tariffRate ?? getTariffRateForMunicipality(input.municipality, pricing.tariffs)
  // Cable lengths come from the measured routes drawn in the Roof Design tab.
  // The longest DC run is the voltage-drop worst case; totals drive quantities.
  // With no measured routes we fall back to a conservative 15m default.
  const measured = input.cableRoutes &&
    (input.cableRoutes.dcRunsM.length > 0 || input.cableRoutes.acM > 0 || input.cableRoutes.earthM > 0)
    ? input.cableRoutes
    : null
  const routeMetres = measured?.dcRunsM.length
    ? Math.max(...measured.dcRunsM)
    : 15

  if (!measured) {
    warnings.push('Cable lengths are estimates — draw the runs in the Roof Design tab for measured quantities.')
  }

  const dcCableM = measured?.dcRunsM.length
    ? Math.ceil(measured.dcRunsM.reduce((sum, m) => sum + m, 0))
    : routeMetres
  const acCableM = measured && measured.acM > 0 ? Math.ceil(measured.acM) : routeMetres
  const earthCableM = measured && measured.earthM > 0 ? Math.ceil(measured.earthM) : routeMetres
  const measuredTag = measured ? ' (measured)' : ''

  const panel = input.equipment.panel
  const inverter = input.equipment.inverter
  const battery = input.equipment.battery
  const panelCount = getPanelCount(input)
  const batteryCount = getBatteryCount(input)
  const inverterCount = getInverterQuantity(input)
  const inverterWatts = inverter.watts_ac ?? 0
  const inverterKw = (inverterWatts / 1000) * inverterCount
  const panelWatts = panel.watts_dc ?? 0
  const totalKwp = (panelCount * panelWatts) / 1000
  const monthlyGenerationKwh = roundCurrency(totalKwp * PSH_GAUTENG * 30 * SYSTEM_EFFICIENCY)
  const annualSolarGenerationKwh = roundCurrency(monthlyGenerationKwh * 12)
  const annualConsumptionKwh = roundCurrency(input.monthlyKwh * 12)
  const usableOffsetKwhMonthly = Math.min(input.monthlyKwh, monthlyGenerationKwh)
  const monthlySavingRands = roundCurrency(usableOffsetKwhMonthly * tariffRate)
  const annualSavingRands = roundCurrency(monthlySavingRands * 12)
  const offsetPercent = clamp((usableOffsetKwhMonthly / Math.max(input.monthlyKwh, 1)) * 100, 0, 100)

  const dcAcRatio = totalKwp / Math.max(inverterKw, 0.1)
  if (dcAcRatio < 1 || dcAcRatio > MAX_RECOMMENDED_DC_AC_RATIO) {
    warnings.push(`DC:AC ratio is ${dcAcRatio.toFixed(2)}. Review panel/inverter sizing.`)
  }

  const inverterMaxPanelCount = getMaxPanelCountForInverter(inverter, panel)
  if (inverterMaxPanelCount && panelCount > inverterMaxPanelCount) {
    warnings.push(
      `${inverter.description} is carrying ${panelCount} panels, but the configured PV ceiling is about ${inverterMaxPanelCount} panels for ${panel.description}.`,
    )
  }

  // String layout from panel Voc + inverter electrical spec (physics in compliance.ts)
  const sizingSpec = parseInverterSizingSpec(inverter.notes)
  const stringLayout = computeStringLayout({ panelCount, panel, spec: sizingSpec })

  const minimumBatteryBankKwh = estimateMinimumBatteryKwh(inverterKw)
  const selectedBatteryBankKwh = roundCurrency((battery.kwh ?? 0) * batteryCount)
  if (selectedBatteryBankKwh < minimumBatteryBankKwh) {
    warnings.push(
      `Battery bank is ${selectedBatteryBankKwh.toFixed(2)}kWh. Target at least ${minimumBatteryBankKwh.toFixed(2)}kWh for a ${inverterKw.toFixed(1)}kW inverter.`,
    )
  }

  const panelSell = roundCurrency(panel.cost_rands * pricing.markup)
  const inverterSell = roundCurrency(inverter.cost_rands * pricing.markup)
  const batterySell = roundCurrency(battery.cost_rands * pricing.markup)
  const panelSellTotal = roundCurrency(panelCount * panelSell)
  const mountingSellTotal = roundCurrency(panelCount * 250)
  const panelMountingSubtotalRands = roundCurrency(panelSellTotal + mountingSellTotal)

  pushBom('Panels & Mounting', panel.sku, `${panel.description} star deposit item`, panelCount, panelSell, panel.cost_rands)
  pushBom('Panels & Mounting', 'MOUNT-STD', 'Mounting kit and rails', panelCount, 250)

  // RULE-MC4-01: pairs by string count (2 per string) + 10% spare — never visual estimates
  const mc4PairCount = Math.max(2, stringLayout.stringCount * 2 + Math.ceil(stringLayout.stringCount * 2 * 0.1))
  const cablesSellTotal = roundCurrency(
    dcCableM * CABLE_4MM_SELL_PER_M * 2 +
      earthCableM * EARTH_FLEX_SELL_PER_M +
      acCableM * FLEX_16MM_SELL_PER_M +
      mc4PairCount * MC4_PAIR_SELL_RANDS,
  )
  pushBom('Cables & Connectors', 'CAB-PV-004-BK', `4mm solar cable black${measuredTag}`, dcCableM, CABLE_4MM_SELL_PER_M, 13.74)
  pushBom('Cables & Connectors', 'CAB-PV-004-RD', `4mm solar cable red${measuredTag}`, dcCableM, CABLE_4MM_SELL_PER_M, 13.74)
  pushBom('Cables & Connectors', 'FPW6.0GRN-YELL', `Earth flex cable${measuredTag}`, earthCableM, EARTH_FLEX_SELL_PER_M, 20.18)
  pushBom('Cables & Connectors', 'FPW16.0BLACK', `16mm flex cable${measuredTag}`, acCableM, FLEX_16MM_SELL_PER_M, 52.53)
  pushBom('Cables & Connectors', 'MC4-PAIR', 'MC4 connector pair', mc4PairCount, MC4_PAIR_SELL_RANDS, 17)

  const estimatedIsc = panel.isc_amps ?? roundCurrency(panelWatts / 40)
  if (panel.isc_amps == null) {
    warnings.push(`Panel Isc was missing, so the calculator estimated ${estimatedIsc.toFixed(2)}A from watts/40.`)
  }

  // RULE-STR-01: breaker per string at Isc × 1.25. SANS 10142-1 §7.12.4: DC
  // isolation + SPD on every install, even single strings. String fuses only
  // when parallel strings share an MPPT (gPV, both poles).
  const dcBreakerStandard = getDcBreakerStandard(estimatedIsc * 1.25)
  const dcBreakerSell = DC_BREAKER_SELL_BY_STANDARD[dcBreakerStandard]
  const stringFuseCount = stringLayout.parallelStringsPerMppt > 1 ? stringLayout.stringCount * 2 : 0
  const dcProtectionSubtotalRands = roundCurrency(
    dcBreakerSell * stringLayout.stringCount +
      DC_SPD_SELL_RANDS +
      DC_COMBINER_ENCLOSURE_SELL_RANDS +
      stringFuseCount * derived.pvStringFuseSell,
  )
  const dcCombinerConfig = `${stringLayout.stringCount}-in, ${stringLayout.stringCount}-out — ${dcBreakerStandard}A breaker per string + SPD`
  pushBom('DC Protection', `DC-MCB-${dcBreakerStandard}`, `PV DC breaker ${dcBreakerStandard}A (per string)`, stringLayout.stringCount, dcBreakerSell)
  pushBom('DC Protection', 'DC-SPD', 'PV surge protection device', 1, DC_SPD_SELL_RANDS, 1001.54)
  pushBom('DC Protection', 'DC-COMB', 'DC combiner enclosure', 1, DC_COMBINER_ENCLOSURE_SELL_RANDS)
  if (stringFuseCount > 0) {
    pushBom('DC Protection', 'GPV-FUSE', 'gPV string fuse + holder (both poles, paralleled strings)', stringFuseCount, derived.pvStringFuseSell)
    warnings.push('gPV string fuses priced at market estimate — confirm with supplier before ordering (RULE-PRC-03).')
  }

  // RULE-INV-01/02/03/04: every battery system needs a monitoring device per
  // inverter, BMS comms cable, DC fuse/disconnect, and properly sized DC cables.
  // Brands with a configured gateway kit (Sigenergy) use it; everything else
  // gets the generic ancillary set so these items are never silently omitted.
  const accessories =
    getBatteryAccessories(inverter.brand, derived.gatewayByBrand) ??
    getBatteryAccessories(battery.brand, derived.gatewayByBrand)
  const genericBatteryAncillariesSell = roundCurrency(
    derived.batteryCommsCableSell * inverterCount +
      BATTERY_FUSE_DISCONNECT_SELL_RANDS * inverterCount +
      derived.batteryCableSetSell * batteryCount,
  )
  const batteryAccessoriesSellTotal = accessories
    ? roundCurrency(
        (
          accessories.gatewaySellRands +
          accessories.commsSellRands +
          accessories.fuseHolderSellRands +
          accessories.cableSellRands +
          accessories.lugSellRands
        ) * inverterCount,
      )
    : genericBatteryAncillariesSell
  const inverterSellTotal = roundCurrency(inverterCount * inverterSell)
  const batterySellTotal = roundCurrency(batteryCount * batterySell)
  const inverterBatterySubtotalRands = roundCurrency(inverterSellTotal + batterySellTotal + batteryAccessoriesSellTotal)

  pushBom('Inverter & Battery System', inverter.sku, `${inverter.description} star deposit item`, inverterCount, inverterSell, inverter.cost_rands)
  pushBom('Inverter & Battery System', battery.sku, `${battery.description} star deposit item`, batteryCount, batterySell, battery.cost_rands)
  if (accessories) {
    pushBom('Inverter & Battery System', 'GATEWAY', 'Gateway and monitoring', inverterCount, accessories.gatewaySellRands)
    pushBom('Inverter & Battery System', 'COMMS', 'Communication module', inverterCount, accessories.commsSellRands)
    pushBom('Inverter & Battery System', 'FUSE', 'Battery fuse holder', inverterCount, accessories.fuseHolderSellRands)
    pushBom('Inverter & Battery System', 'BAT-CABLE', 'Battery cable set and lugs', inverterCount, roundCurrency(accessories.cableSellRands + accessories.lugSellRands))
  } else {
    pushBom('Inverter & Battery System', 'BAT-COMMS', 'Battery BMS communication cable (CAN/RS485)', inverterCount, derived.batteryCommsCableSell)
    pushBom('Inverter & Battery System', '143018', 'KELEC NH00 battery fuse holder disconnect 2P 160A', inverterCount, BATTERY_FUSE_DISCONNECT_SELL_RANDS, 901.6)
    pushBom('Inverter & Battery System', 'BAT-CABLE-50', 'Battery cable set 50mm² flex (4m) + lugs', batteryCount, derived.batteryCableSetSell)
    warnings.push('Battery comms cable and 50mm² cable set priced at market estimate — confirm with supplier before ordering (RULE-PRC-03). Check whether the inverter ships with a built-in monitoring dongle; add a gateway line if not.')
  }

  const acDbSubtotalRands = derived.acDbBundleSell
  for (const component of derived.acDbComponents) {
    pushBom('AC & DB Protection', component.sku, component.description, 1, component.sellRands, component.costRands)
  }

  const earthingSpikeCount = getEarthingSpikeCount(inverterKw)
  const earthMutiCount = earthingSpikeCount
  const earthingWireMetres = earthingSpikeCount * 5
  const earthingSubtotalRands = roundCurrency(
    earthingSpikeCount * EARTH_ROD_SELL_RANDS +
      earthingSpikeCount * EARTH_TIP_SELL_RANDS +
      earthingSpikeCount * EARTH_COUPLING_SELL_RANDS +
      earthingSpikeCount * EARTH_CLAMP_SELL_RANDS +
      earthMutiCount * EARTH_MUTI_SELL_RANDS +
      earthingWireMetres * BARE_EARTH_WIRE_SELL_PER_M,
  )
  pushBom('Earthing System', 'ER1615', 'Earth rods', earthingSpikeCount, EARTH_ROD_SELL_RANDS, 193.2)
  pushBom('Earthing System', 'ERA02', 'Earth rod driving tips', earthingSpikeCount, EARTH_TIP_SELL_RANDS, 71.76)
  pushBom('Earthing System', 'ERA03', 'Earth rod couplings', earthingSpikeCount, EARTH_COUPLING_SELL_RANDS, 119.6)
  pushBom('Earthing System', 'ERA04', 'Earth rod clamps', earthingSpikeCount, EARTH_CLAMP_SELL_RANDS, 29.44)
  pushBom('Earthing System', 'EM25KG', 'Earthmuti bucket', earthMutiCount, EARTH_MUTI_SELL_RANDS, 368)
  pushBom('Earthing System', 'BCEW16.0MM', 'Bare copper earth wire', earthingWireMetres, BARE_EARTH_WIRE_SELL_PER_M, 47.18)

  const conduitSellTotal = getConduitSellTotal(routeMetres)
  // RULE-CON-04: minimum 2 glands per DB (entry + exit) — IP rating is void without them
  const dbGlandCount = 2
  const consumablesBase = roundCurrency(getConsumablesBase(panelCount) * pricing.markup)
  const consumablesSubtotalRands = roundCurrency(consumablesBase + conduitSellTotal + dbGlandCount * CONDUIT_GLAND_SELL_RANDS + pricing.cocRands)
  pushBom('Consumables & Compliance', 'CONS-STD', 'Consumables allowance', 1, consumablesBase)
  pushBom('Consumables & Compliance', 'CONDUIT', 'Conduit and routing accessories', 1, conduitSellTotal)
  pushBom('Consumables & Compliance', 'PMGB25-18', 'Nylon cable gland 25mm IP68 (DB entry/exit)', dbGlandCount, CONDUIT_GLAND_SELL_RANDS, 7.27)
  pushBom('Consumables & Compliance', 'COC', 'Certificate of Compliance', 1, pricing.cocRands, pricing.cocRands)

  const storeysPremium = getStoreysPremium(input.storeys, pricing.storeyPremium2, pricing.storeyPremium3)
  const labourBaseRands = roundCurrency(
    (inverterWatts * inverterCount) * pricing.labourInverterPerW +
      panelCount * panelWatts * pricing.labourPanelPerW,
  )
  const labourSubtotalRands = roundCurrency(labourBaseRands + storeysPremium)
  pushBom('Labour', 'LABOUR', 'Installation labour and commissioning', 1, labourBaseRands, labourBaseRands)
  if (storeysPremium > 0) {
    pushBom('Labour', 'LABOUR-ACCESS', `${input.storeys}-storey roof access premium (scaffolding/boom time) — RULE-SZ-04`, 1, storeysPremium, storeysPremium)
  }

  // ── EV Charger (optional add-on) ───────────────────────────────────────────
  const evSize = parseEvChargerSize(input.evCharger)
  let evChargerSubtotalRands = 0
  let evChargerSizeKw = ''
  let evChargerUnitSellRands = 0

  if (evSize && derived.evChargerSpecs[evSize]) {
    // RULE-EV-01 (BLOCKER class): an EV circuit may never be quoted without
    // Type B earth leakage, its own input DB, surge protection, correctly sized
    // cable, and warning labels — SANS 10142-1 §6.16.8 / §6.7.5.
    const spec = derived.evChargerSpecs[evSize]
    evChargerUnitSellRands = spec.chargerSellRands
    const evCableSell = roundCurrency(spec.cableSellPerM * EV_CHARGER_CABLE_ROUTE_M)
    evChargerSubtotalRands = roundCurrency(
      evChargerUnitSellRands + evCableSell + spec.mcbSellRands + EV_CONSUMABLES_SELL_RANDS + spec.labourSellRands +
        derived.evTypeBElcbSell + EV_INPUT_DB_SELL_RANDS + EV_SPD_SELL_RANDS + derived.evWarningLabelsSell +
        2 * derived.swaGlandSell,
    )
    evChargerSizeKw = evSize

    pushBom('EV Charger', `EV-${evSize}`, `${evSize} Type 2 EV Wallbox — deposit item`, 1, evChargerUnitSellRands, spec.chargerCostRands)
    pushBom('EV Charger', 'EV-CABLE-SWA', `6mm² 3-core SWA armoured cable — ${EV_CHARGER_CABLE_ROUTE_M}m run`, EV_CHARGER_CABLE_ROUTE_M, spec.cableSellPerM)
    pushBom('EV Charger', 'CW20-SWA', 'SWA compression gland 20mm (armour earthed at entry)', 2, derived.swaGlandSell)
    pushBom('EV Charger', 'EX9LB63-1PN-63-30B', 'Noark Type B ELCB 63A 30mA (DC-sensitive — EV requirement)', 1, derived.evTypeBElcbSell)
    pushBom('EV Charger', 'DB-SH6PN', 'Chint 6-way EV input DB IP66', 1, EV_INPUT_DB_SELL_RANDS, 307.51)
    pushBom('EV Charger', 'NU6-IIG-2P-40KA-275V', 'EV circuit AC SPD Type 2, 2P 40kA', 1, EV_SPD_SELL_RANDS, 484.29)
    pushBom('EV Charger', 'EV-MCB', 'Dedicated EV circuit MCB', 1, spec.mcbSellRands)
    pushBom('EV Charger', 'EV-LABELS', 'EV circuit warning labels', 1, derived.evWarningLabelsSell)
    pushBom('EV Charger', 'EV-CONS', 'EV installation consumables and conduit', 1, EV_CONSUMABLES_SELL_RANDS)
    pushBom('EV Charger', 'EV-LABOUR', 'EV charger installation and commissioning labour', 1, spec.labourSellRands, spec.labourSellRands)
    warnings.push('Type B ELCB, SWA glands, and EV labels priced at market estimate — confirm with supplier before ordering (RULE-PRC-03).')
  }

  const depositItems: QuoteData['depositItems'] = [
    { name: 'Solar Panels', amountRands: panelSellTotal },
    { name: 'Inverter', amountRands: inverterSellTotal },
    { name: 'Battery', amountRands: batterySellTotal },
    { name: 'Mounting', amountRands: mountingSellTotal },
    ...(evSize ? [{ name: `${evSize} EV Charger`, amountRands: evChargerUnitSellRands }] : []),
  ]

  const materialsLabourSubtotal = roundCurrency(
    panelMountingSubtotalRands +
      cablesSellTotal +
      dcProtectionSubtotalRands +
      inverterBatterySubtotalRands +
      acDbSubtotalRands +
      earthingSubtotalRands +
      consumablesSubtotalRands +
      labourSubtotalRands +
      evChargerSubtotalRands,
  )

  const quoteTotalRands = materialsLabourSubtotal
  const paybackMonths = quoteTotalRands / Math.max(monthlySavingRands, 1)
  const paybackMonthsEscalated = getPaybackMonthsEscalated(quoteTotalRands, annualConsumptionKwh, annualSolarGenerationKwh, tariffRate)
  const twentyYearTable = buildTwentyYearTable(annualConsumptionKwh, annualSolarGenerationKwh, tariffRate)
  const lifetimeBillSavings = twentyYearTable.reduce((sum, row) => sum + Number(row.annualSaving.replace(/[^0-9.-]/g, '')), 0)
  const cumulativeImpact20Y = Number(twentyYearTable[twentyYearTable.length - 1]?.cumulativeImpact.replace(/[^0-9.-]/g, '') ?? 0)
  const estimatedNetSavings = roundCurrency(cumulativeImpact20Y - quoteTotalRands)
  const npv = roundCurrency(
    twentyYearTable.reduce((sum, row, index) => {
      const annualSaving = Number(row.annualSaving.replace(/[^0-9.-]/g, ''))
      return sum + annualSaving / Math.pow(1.1, index + 1)
    }, -quoteTotalRands),
  )
  const roiPct = roundCurrency((estimatedNetSavings / Math.max(quoteTotalRands, 1)) * 100)

  // Independent verification of the final BOM — SANS 10142-1 + design rules.
  // Blockers are also surfaced as calculation warnings so they cannot be missed.
  const complianceChecks = runComplianceChecks({
    bom: supplierBom,
    layout: stringLayout,
    spec: sizingSpec,
    panel,
    inverter,
    battery,
    inverterCount,
    batteryCount,
    panelCount,
    evChargerKw: evChargerSizeKw,
    routeMetres,
    gridSupply: input.gridSupply,
  })
  for (const check of complianceChecks) {
    if (check.status === 'blocker') {
      warnings.push(`COMPLIANCE BLOCKER — ${check.title} (${check.reference}): ${check.detail}`)
    }
  }

  return {
    panelCount,
    batteryCount,
    panelSellTotal,
    mountingSellTotal,
    panelMountingSubtotalRands,
    cablesSellTotal,
    dcProtectionSubtotalRands,
    inverterSellTotal,
    batterySellTotal,
    batteryAccessoriesSellTotal,
    inverterBatterySubtotalRands,
    acDbSubtotalRands,
    earthingSpikeCount,
    earthingSubtotalRands,
    consumablesSubtotalRands,
    labourSubtotalRands,
    monthlyGenerationKwh,
    annualSolarGenerationKwh,
    annualConsumptionKwh,
    annualSavingRands,
    monthlySavingRands,
    offsetPercent,
    depositItems,
    quoteTotalRands,
    paybackMonths,
    paybackMonthsEscalated,
    warnings,
    supplierBom,
    complianceChecks,
    stringLayout,
    dcCombinerConfig,
    monthlyGenTable: buildMonthlyGenTable(input.monthlyKwh, monthlyGenerationKwh, tariffRate, input.advancedMonthlyKwh),
    twentyYearTable,
    lifetimeBillSavings: roundCurrency(lifetimeBillSavings),
    estimatedNetSavings,
    cumulativeImpact20Y,
    npv,
    roiPct,
    evChargerSubtotalRands,
    evChargerSizeKw,
    evChargerUnitSellRands,
  }
}

export function calculateQuote(input: CalculatorInput): QuoteData {
  const breakdown = buildBreakdown(input)
  const tariffRate = input.tariffRate ?? getTariffRateForMunicipality(
    input.municipality,
    { ...DEFAULT_PRICING.tariffs, ...(input.pricing?.tariffs ?? {}) },
  )
  const today = new Date()
  const expires = new Date(today)
  expires.setDate(today.getDate() + 7)
  const totalKwp = (breakdown.panelCount * (input.equipment.panel.watts_dc ?? 0)) / 1000
  const depositTotalRands = roundCurrency(breakdown.depositItems.reduce((sum, item) => sum + item.amountRands, 0))
  const balanceTotal = roundCurrency(breakdown.quoteTotalRands - depositTotalRands)
  const issueDate = today.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
  const expiryDate = expires.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })

  const data: QuoteData & { calculationWarnings?: string[] } = {
    quoteNumber: input.quoteNumber,
    dateIssued: issueDate,
    dateExpires: expiryDate,
    customerName: input.customerName,
    municipality: input.municipality,
    customerPhone: input.customerPhone || 'TBC',
    customerEmail: input.customerEmail || 'TBC',
    siteAddress: input.siteAddress || 'TBC',
    monthlyUsageKwh: formatPlain(input.monthlyKwh, 0),
    systemType: `${input.gridSupply} hybrid solar with battery backup`,
    inverterModel: input.equipment.inverter.description,
    inverterKw: formatPlain((input.equipment.inverter.watts_ac ?? 0) / 1000, 1),
    batteryModel: input.equipment.battery.description,
    batteryKwh: formatPlain(input.equipment.battery.kwh ?? 0, 2).replace(/\.00$/, ''),
    panelCount: String(breakdown.panelCount),
    panelModel: input.equipment.panel.description,
    totalKwp: formatPlain(totalKwp, 2),
    monthlyGenKwh: formatPlain(breakdown.monthlyGenerationKwh, 0),
    panelCost: formatRands(breakdown.panelSellTotal),
    panelMountingConsumables: formatRands(breakdown.mountingSellTotal),
    panelMountingSubtotal: formatRands(breakdown.panelMountingSubtotalRands),
    cablesCost: formatRands(breakdown.cablesSellTotal),
    cablesSubtotal: formatRands(breakdown.cablesSellTotal),
    dcCombinerConfig: breakdown.dcCombinerConfig,
    dcCombinerCost: formatRands(breakdown.dcProtectionSubtotalRands),
    dcProtectionSubtotal: formatRands(breakdown.dcProtectionSubtotalRands),
    inverterQty: String(getInverterQuantity(input)),
    inverterCost: formatRands(breakdown.inverterSellTotal),
    batteryQty: String(breakdown.batteryCount),
    batteryCost: formatRands(breakdown.batterySellTotal),
    batteryAccessoriesCost: formatRands(breakdown.batteryAccessoriesSellTotal),
    inverterBatterySubtotal: formatRands(breakdown.inverterBatterySubtotalRands),
    acDbCost: formatRands(breakdown.acDbSubtotalRands),
    acDbSubtotal: formatRands(breakdown.acDbSubtotalRands),
    earthingSpikeCount: String(breakdown.earthingSpikeCount),
    earthingCost: formatRands(breakdown.earthingSubtotalRands),
    earthingSubtotal: formatRands(breakdown.earthingSubtotalRands),
    consumablesCost: formatRands(breakdown.consumablesSubtotalRands),
    consumablesSubtotal: formatRands(breakdown.consumablesSubtotalRands),
    labourCost: formatRands(breakdown.labourSubtotalRands),
    labourSubtotal: formatRands(breakdown.labourSubtotalRands),
    materialsLabourSubtotal: formatRands(breakdown.quoteTotalRands),
    quoteTotal: formatRands(breakdown.quoteTotalRands),
    depositTotal: formatRands(depositTotalRands),
    balanceTotal: formatRands(balanceTotal),
    quoteTotalRands: breakdown.quoteTotalRands,
    depositTotalRands,
    annualOffsetPercent: formatPercent(breakdown.offsetPercent, 0),
    monthlySavingR: formatMoneyShort(breakdown.monthlySavingRands),
    tariffRate: `R${tariffRate.toFixed(2)}`,
    annualSavingR: formatMoneyShort(breakdown.annualSavingRands),
    paybackMonths: String(Math.round(breakdown.paybackMonths)),
    paybackYears: (breakdown.paybackMonths / 12).toFixed(1),
    paybackMonthsEscalated: String(Math.round(breakdown.paybackMonthsEscalated)),
    depositItems: breakdown.depositItems,
    supplierBom: breakdown.supplierBom,
    monthlyGenTable: breakdown.monthlyGenTable,
    annualSolarGenKwh: formatPlain(breakdown.annualSolarGenerationKwh, 0),
    annualConsumptionKwh: formatPlain(breakdown.annualConsumptionKwh, 0),
    annualGridOffsetPct: formatPercent(breakdown.offsetPercent, 0),
    lifetimeBillSavings: formatRands(breakdown.lifetimeBillSavings),
    netSystemCost: formatRands(breakdown.quoteTotalRands),
    estimatedNetSavings: formatRands(breakdown.estimatedNetSavings),
    npv: formatRands(breakdown.npv),
    roi: formatPercent(breakdown.roiPct, 0),
    annualReturnRate: formatPercent(breakdown.roiPct / 20, 1),
    twentyYearTable: breakdown.twentyYearTable,
    sizingInputs: {
      inverterQty: getInverterQuantity(input),
      batteryQty: breakdown.batteryCount,
      targetInverterKw: input.targetInverterKwOverride && input.targetInverterKwOverride > 0
        ? input.targetInverterKwOverride
        : estimateTargetInverterKw(input.monthlyKwh, input.essentialLoadKw, totalKwp),
      minimumBatteryKwh: input.minimumBatteryKwhOverride && input.minimumBatteryKwhOverride > 0
        ? input.minimumBatteryKwhOverride
        : estimateMinimumBatteryKwh(((input.equipment.inverter.watts_ac ?? 0) / 1000) * getInverterQuantity(input)),
      targetPanelCount: breakdown.panelCount,
    },
    calculationWarnings: breakdown.warnings,
    complianceChecks: breakdown.complianceChecks,
    evChargerKw: breakdown.evChargerSizeKw || undefined,
    evChargerCost: breakdown.evChargerSubtotalRands > 0 ? formatRands(breakdown.evChargerSubtotalRands) : undefined,
    evChargerSubtotal: breakdown.evChargerSubtotalRands > 0 ? formatRands(breakdown.evChargerSubtotalRands) : undefined,
  }

  return data
}

export function buildComparisonTable(options: OptionQuoteData[]): ComparisonRow[] {
  const premium = options.find((option) => option.tier === 'premium')
  const recommended = options.find((option) => option.tier === 'recommended')
  const budget = options.find((option) => option.tier === 'budget')

  if (!premium || !recommended || !budget) return []

  return [
    { label: 'Inverter', premium: premium.inverterModel, recommended: recommended.inverterModel, budget: budget.inverterModel },
    { label: 'Battery', premium: premium.batteryModel, recommended: recommended.batteryModel, budget: budget.batteryModel },
    { label: 'Panels', premium: `${premium.panelCount} x ${premium.panelModel}`, recommended: `${recommended.panelCount} x ${recommended.panelModel}`, budget: `${budget.panelCount} x ${budget.panelModel}` },
    { label: 'Quote Total', premium: premium.quoteTotal, recommended: recommended.quoteTotal, budget: budget.quoteTotal },
    { label: 'Deposit', premium: premium.depositTotal, recommended: recommended.depositTotal, budget: budget.depositTotal },
    { label: 'Monthly Saving', premium: premium.monthlySavingR, recommended: recommended.monthlySavingR, budget: budget.monthlySavingR },
    { label: 'Payback', premium: `${premium.paybackMonths} months`, recommended: `${recommended.paybackMonths} months`, budget: `${budget.paybackMonths} months` },
  ]
}

export function buildMultiOptionQuoteData(options: OptionQuoteData[]): MultiOptionQuoteData {
  const recommended = options.find((option) => option.tier === 'recommended') ?? options[0]

  return {
    type: 'multi-option',
    quoteNumber: recommended.quoteNumber,
    dateIssued: recommended.dateIssued,
    dateExpires: recommended.dateExpires,
    customerName: recommended.customerName,
    municipality: recommended.municipality,
    customerPhone: recommended.customerPhone,
    customerEmail: recommended.customerEmail,
    siteAddress: recommended.siteAddress,
    monthlyUsageKwh: recommended.monthlyUsageKwh,
    comparisonTable: buildComparisonTable(options),
    options,
  }
}
