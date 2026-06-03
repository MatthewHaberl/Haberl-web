import type {
  ComparisonRow,
  MonthlyGenRow,
  MultiOptionQuoteData,
  OptionQuoteData,
  QuoteData,
  SupplierBomItem,
  TwentyYearRow,
} from './render-quote'

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

type GatewayConfig = {
  gatewaySellRands: number
  commsSellRands: number
  fuseHolderSellRands: number
  cableSellRands: number
  lugSellRands: number
}

const SIGENERGY_GATEWAY: GatewayConfig = {
  gatewaySellRands: roundCurrency(6980.5 * MARKUP),
  commsSellRands: roundCurrency(2104.5 * MARKUP),
  fuseHolderSellRands: roundCurrency(901.6 * MARKUP),
  cableSellRands: roundCurrency((278.71 * MARKUP) * 4),
  lugSellRands: roundCurrency((16.92 * MARKUP) * 4),
}

export const GATEWAY_BY_BRAND: Record<string, GatewayConfig | null> = {
  Sigenergy: SIGENERGY_GATEWAY,
  SigenStor: SIGENERGY_GATEWAY,
  'Sigenergy/SigenStor': SIGENERGY_GATEWAY,
}

const DC_BREAKER_SELL_BY_STANDARD: Record<number, number> = {
  10: 362.25,
  16: 402.5,
  20: 402.5,
  25: 414,
  32: 425.5,
  40: 425.5,
}

const AC_DB_BUNDLE_SELL_RANDS = roundCurrency(
  539.12 + 182.53 + 556.93 + 990.4 + 112.7 + 112.7 + 60.31 + 236.53 + 2200,
)
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
  rawNotes?: string
}

export interface SizingSnapshot {
  dailyUsageKwh: number
  targetSolarKwp: number
  targetInverterKw: number
  minimumBatteryKwh: number
  targetPanelCount: number
  selectedBatteryCount: number | null
  selectedBatteryBankKwh: number | null
  maxPanelCountOnSelectedInverter: number | null
  maxPvKwpOnSelectedInverter: number | null
  stringSummary: string | null
  batteryCompatibilitySummary: string | null
}

export type EquipmentCatalogCategory = 'inverter' | 'battery' | 'panel' | 'other'
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
  cableRouteMetres: number
  lockedPanelCount?: number | null
  equipment: {
    inverter: EquipmentCatalogItem
    battery: EquipmentCatalogItem
    panel: EquipmentCatalogItem
  }
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
  dcCombinerConfig: string
  monthlyGenTable: MonthlyGenRow[]
  twentyYearTable: TwentyYearRow[]
  lifetimeBillSavings: number
  estimatedNetSavings: number
  cumulativeImpact20Y: number
  npv: number
  roiPct: number
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

export function estimateTargetInverterKw(monthlyKwh: number, essentialLoadKw: number, lockedSolarKwp?: number | null) {
  const solarKw = lockedSolarKwp && lockedSolarKwp > 0
    ? lockedSolarKwp / MAX_RECOMMENDED_DC_AC_RATIO
    : estimateTargetSolarKwp(monthlyKwh)
  return Math.max(Math.ceil(solarKw), Math.ceil(essentialLoadKw))
}

function getRestrictedCompatibleBatteryBrands(inverter: EquipmentCatalogItem) {
  const spec = parseInverterSizingSpec(inverter.notes)
  if (spec?.batteryBrands?.length) return spec.batteryBrands.map(normalizeBrand)

  const inverterBrand = normalizeBrand(inverter.brand)
  const inverterSku = normalizeBrand(inverter.sku)
  const inverterDescription = normalizeBrand(inverter.description)

  if (
    inverterBrand.includes('sigenergy') ||
    inverterSku.includes('sig-inv') ||
    inverterDescription.includes('sigenstor') ||
    inverterDescription.includes('sigenergy')
  ) {
    return ['sigenergy']
  }

  return null
}

export function isBatteryCompatibleWithInverter(inverter: EquipmentCatalogItem, battery: EquipmentCatalogItem) {
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

export function buildSizingSnapshot(input: {
  monthlyKwh: number
  essentialLoadKw: number
  batteryHours?: number
  lockedPanelCount?: number | null
  inverter?: EquipmentCatalogItem | null
  battery?: EquipmentCatalogItem | null
  panel?: EquipmentCatalogItem | null
}) {
  const dailyUsageKwh = estimateDailyUsageKwh(input.monthlyKwh)
  const targetSolarKwp = estimateTargetSolarKwp(input.monthlyKwh)
  const targetInverterKw = estimateTargetInverterKw(input.monthlyKwh, input.essentialLoadKw)
  const minimumBatteryKwh = estimateMinimumBatteryKwh(targetInverterKw)
  const targetPanelCount = input.lockedPanelCount && input.lockedPanelCount > 0
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
        cableRouteMetres: 15,
        lockedPanelCount: input.lockedPanelCount,
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
    ? getMaxPanelCountForInverter(input.inverter, input.panel)
    : null
  const maxPvKwpOnSelectedInverter = input.inverter ? getInverterMaxPvKwp(input.inverter) : null
  const spec = input.inverter ? parseInverterSizingSpec(input.inverter.notes) : null

  return {
    dailyUsageKwh,
    targetSolarKwp,
    targetInverterKw,
    minimumBatteryKwh,
    targetPanelCount,
    selectedBatteryCount,
    selectedBatteryBankKwh,
    maxPanelCountOnSelectedInverter,
    maxPvKwpOnSelectedInverter,
    stringSummary: spec ? summarizeStringSetup(spec) : null,
    batteryCompatibilitySummary: input.inverter ? describeCompatibleBatteryBrands(input.inverter) : null,
  } satisfies SizingSnapshot
}

function addBomItem(
  items: SupplierBomItem[],
  section: string,
  sku: string,
  description: string,
  quantity: number,
  unitSellRands: number,
  unitCostRands = unitSellRands / MARKUP,
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

export function getTariffRateForMunicipality(municipality: string) {
  return TARIFF_BY_MUNICIPALITY[municipality] ?? TARIFF_BY_MUNICIPALITY.Eskom
}

function getPanelCount(input: CalculatorInput) {
  if (input.lockedPanelCount && input.lockedPanelCount > 0) {
    return input.lockedPanelCount
  }

  const panelWatts = input.equipment.panel.watts_dc ?? 0
  const rawPanels = estimateTargetSolarKwp(input.monthlyKwh) * (1000 / Math.max(panelWatts, 1))
  return Math.max(1, Math.ceil(rawPanels))
}

function getBatteryCount(input: CalculatorInput) {
  const batteryKwh = input.equipment.battery.kwh ?? 0
  const inverterKw = (input.equipment.inverter.watts_ac ?? 0) / 1000
  const minimumBackupBankKwh = input.essentialLoadKw * input.batteryHours
  const minimumInverterBankKwh = estimateMinimumBatteryKwh(inverterKw)
  const requiredBatteryKwh = Math.max(minimumBackupBankKwh, minimumInverterBankKwh)
  return Math.max(1, Math.ceil(requiredBatteryKwh / Math.max(batteryKwh, 0.1)))
}

function getStoreysPremium(storeys: string) {
  void storeys
  return 0
}

function getEarthingSpikeCount(inverterKw: number) {
  if (inverterKw <= 3) return 2
  if (inverterKw <= 5) return 4
  if (inverterKw <= 10) return 6
  return 8
}

function getConsumablesBase(panelCount: number) {
  if (panelCount <= 8) return 850
  if (panelCount <= 14) return 1200
  return 1800
}

function getConduitSellTotal(routeMetres: number) {
  const lengths = Math.max(1, Math.ceil(routeMetres / 4))
  const couplings = Math.max(0, lengths - 1)
  const saddles = Math.max(2, Math.ceil(routeMetres / 1.25))
  const anchors = saddles * 2
  const glands = 2

  return roundCurrency(
    lengths * CONDUIT_LENGTH_SELL_RANDS +
      couplings * CONDUIT_COUPLING_SELL_RANDS +
      saddles * CONDUIT_SADDLE_SELL_RANDS +
      anchors * CONDUIT_ANCHOR_SELL_RANDS +
      glands * CONDUIT_GLAND_SELL_RANDS,
  )
}

function getBatteryAccessories(brand: string) {
  const direct = GATEWAY_BY_BRAND[brand]
  if (direct) return direct

  const normalized = normalizeBrand(brand)
  const match = Object.entries(GATEWAY_BY_BRAND).find(([key]) => normalized.includes(normalizeBrand(key)))
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
  const tariffRate = input.tariffRate ?? getTariffRateForMunicipality(input.municipality)
  const routeMetres = input.cableRouteMetres > 0 ? input.cableRouteMetres : 15

  if (input.cableRouteMetres === 0) {
    warnings.push('Cable route was left at 0m, so the calculator used the 15m default.')
  }

  const panel = input.equipment.panel
  const inverter = input.equipment.inverter
  const battery = input.equipment.battery
  const panelCount = getPanelCount(input)
  const batteryCount = getBatteryCount(input)
  const inverterWatts = inverter.watts_ac ?? 0
  const inverterKw = inverterWatts / 1000
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

  const minimumBatteryBankKwh = estimateMinimumBatteryKwh(inverterKw)
  const selectedBatteryBankKwh = roundCurrency((battery.kwh ?? 0) * batteryCount)
  if (selectedBatteryBankKwh < minimumBatteryBankKwh) {
    warnings.push(
      `Battery bank is ${selectedBatteryBankKwh.toFixed(2)}kWh. Target at least ${minimumBatteryBankKwh.toFixed(2)}kWh for a ${inverterKw.toFixed(1)}kW inverter.`,
    )
  }

  const panelSell = roundCurrency(panel.cost_rands * MARKUP)
  const inverterSell = roundCurrency(inverter.cost_rands * MARKUP)
  const batterySell = roundCurrency(battery.cost_rands * MARKUP)
  const panelSellTotal = roundCurrency(panelCount * panelSell)
  const mountingSellTotal = roundCurrency(panelCount * 250)
  const panelMountingSubtotalRands = roundCurrency(panelSellTotal + mountingSellTotal)

  addBomItem(supplierBom, 'Panels & Mounting', panel.sku, `${panel.description} star deposit item`, panelCount, panelSell, panel.cost_rands)
  addBomItem(supplierBom, 'Panels & Mounting', 'MOUNT-STD', 'Mounting kit and rails', panelCount, 250, 250 / MARKUP)

  const mc4PairCount = Math.max(2, Math.ceil(panelCount / 7))
  const cablesSellTotal = roundCurrency(
    routeMetres * CABLE_4MM_SELL_PER_M * 2 +
      routeMetres * EARTH_FLEX_SELL_PER_M +
      routeMetres * FLEX_16MM_SELL_PER_M +
      mc4PairCount * MC4_PAIR_SELL_RANDS,
  )
  addBomItem(supplierBom, 'Cables & Connectors', 'CAB-PV-004-BK', '4mm solar cable black', routeMetres, CABLE_4MM_SELL_PER_M, 13.74)
  addBomItem(supplierBom, 'Cables & Connectors', 'CAB-PV-004-RD', '4mm solar cable red', routeMetres, CABLE_4MM_SELL_PER_M, 13.74)
  addBomItem(supplierBom, 'Cables & Connectors', 'FPW6.0GRN-YELL', 'Earth flex cable', routeMetres, EARTH_FLEX_SELL_PER_M, 20.18)
  addBomItem(supplierBom, 'Cables & Connectors', 'FPW16.0BLACK', '16mm flex cable', routeMetres, FLEX_16MM_SELL_PER_M, 52.53)
  addBomItem(supplierBom, 'Cables & Connectors', 'MC4-PAIR', 'MC4 connector pair', mc4PairCount, MC4_PAIR_SELL_RANDS, 17)

  const estimatedIsc = panel.isc_amps ?? roundCurrency(panelWatts / 40)
  if (panel.isc_amps == null) {
    warnings.push(`Panel Isc was missing, so the calculator estimated ${estimatedIsc.toFixed(2)}A from watts/40.`)
  }

  const dcBreakerStandard = getDcBreakerStandard(estimatedIsc * 1.25)
  const dcBreakerSell = DC_BREAKER_SELL_BY_STANDARD[dcBreakerStandard]
  const dcProtectionSubtotalRands = roundCurrency(dcBreakerSell + DC_SPD_SELL_RANDS + DC_COMBINER_ENCLOSURE_SELL_RANDS)
  const dcCombinerConfig = `${dcBreakerStandard}A DC breaker + SPD`
  addBomItem(supplierBom, 'DC Protection', `DC-MCB-${dcBreakerStandard}`, `PV DC breaker ${dcBreakerStandard}A`, 1, dcBreakerSell, dcBreakerSell / MARKUP)
  addBomItem(supplierBom, 'DC Protection', 'DC-SPD', 'PV surge protection device', 1, DC_SPD_SELL_RANDS, 1001.54)
  addBomItem(supplierBom, 'DC Protection', 'DC-COMB', 'DC combiner enclosure', 1, DC_COMBINER_ENCLOSURE_SELL_RANDS, DC_COMBINER_ENCLOSURE_SELL_RANDS / MARKUP)

  const accessories = getBatteryAccessories(inverter.brand) ?? getBatteryAccessories(battery.brand)
  const batteryAccessoriesSellTotal = accessories
    ? roundCurrency(
        accessories.gatewaySellRands +
          accessories.commsSellRands +
          accessories.fuseHolderSellRands +
          accessories.cableSellRands +
          accessories.lugSellRands,
      )
    : 0
  const inverterSellTotal = inverterSell
  const batterySellTotal = roundCurrency(batteryCount * batterySell)
  const inverterBatterySubtotalRands = roundCurrency(inverterSellTotal + batterySellTotal + batteryAccessoriesSellTotal)

  addBomItem(supplierBom, 'Inverter & Battery System', inverter.sku, `${inverter.description} star deposit item`, 1, inverterSell, inverter.cost_rands)
  addBomItem(supplierBom, 'Inverter & Battery System', battery.sku, `${battery.description} star deposit item`, batteryCount, batterySell, battery.cost_rands)
  if (accessories) {
    addBomItem(supplierBom, 'Inverter & Battery System', 'GATEWAY', 'Gateway and monitoring', 1, accessories.gatewaySellRands)
    addBomItem(supplierBom, 'Inverter & Battery System', 'COMMS', 'Communication module', 1, accessories.commsSellRands)
    addBomItem(supplierBom, 'Inverter & Battery System', 'FUSE', 'Battery fuse holder', 1, accessories.fuseHolderSellRands)
    addBomItem(supplierBom, 'Inverter & Battery System', 'BAT-CABLE', 'Battery cable set and lugs', 1, roundCurrency(accessories.cableSellRands + accessories.lugSellRands))
  }

  const acDbSubtotalRands = AC_DB_BUNDLE_SELL_RANDS
  addBomItem(supplierBom, 'AC & DB Protection', 'AC-DB-BUNDLE', 'AC protection and essential loads DB bundle', 1, AC_DB_BUNDLE_SELL_RANDS)

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
  addBomItem(supplierBom, 'Earthing System', 'ER1615', 'Earth rods', earthingSpikeCount, EARTH_ROD_SELL_RANDS, 193.2)
  addBomItem(supplierBom, 'Earthing System', 'ERA02', 'Earth rod driving tips', earthingSpikeCount, EARTH_TIP_SELL_RANDS, 71.76)
  addBomItem(supplierBom, 'Earthing System', 'ERA03', 'Earth rod couplings', earthingSpikeCount, EARTH_COUPLING_SELL_RANDS, 119.6)
  addBomItem(supplierBom, 'Earthing System', 'ERA04', 'Earth rod clamps', earthingSpikeCount, EARTH_CLAMP_SELL_RANDS, 29.44)
  addBomItem(supplierBom, 'Earthing System', 'EM25KG', 'Earthmuti bucket', earthMutiCount, EARTH_MUTI_SELL_RANDS, 368)
  addBomItem(supplierBom, 'Earthing System', 'BCEW16.0MM', 'Bare copper earth wire', earthingWireMetres, BARE_EARTH_WIRE_SELL_PER_M, 47.18)

  const conduitSellTotal = getConduitSellTotal(routeMetres)
  const consumablesBase = roundCurrency(getConsumablesBase(panelCount) * MARKUP)
  const consumablesSubtotalRands = roundCurrency(consumablesBase + conduitSellTotal + COC_RANDS)
  addBomItem(supplierBom, 'Consumables & Compliance', 'CONS-STD', 'Consumables allowance', 1, consumablesBase, consumablesBase / MARKUP)
  addBomItem(supplierBom, 'Consumables & Compliance', 'CONDUIT', 'Conduit and routing accessories', 1, conduitSellTotal, conduitSellTotal / MARKUP)
  addBomItem(supplierBom, 'Consumables & Compliance', 'COC', 'Certificate of Compliance', 1, COC_RANDS, COC_RANDS)

  const storeysPremium = getStoreysPremium(input.storeys)
  const labourSubtotalRands = roundCurrency(
    inverterWatts * 0.25 +
      panelCount * panelWatts * 0.75 +
      storeysPremium,
  )
  addBomItem(supplierBom, 'Labour', 'LABOUR', 'Installation labour and commissioning', 1, labourSubtotalRands, labourSubtotalRands)

  const depositItems: QuoteData['depositItems'] = [
    { name: 'Solar Panels', amountRands: panelSellTotal },
    { name: 'Inverter', amountRands: inverterSellTotal },
    { name: 'Battery', amountRands: batterySellTotal },
    { name: 'Mounting', amountRands: mountingSellTotal },
  ]

  const materialsLabourSubtotal = roundCurrency(
    panelMountingSubtotalRands +
      cablesSellTotal +
      dcProtectionSubtotalRands +
      inverterBatterySubtotalRands +
      acDbSubtotalRands +
      earthingSubtotalRands +
      consumablesSubtotalRands +
      labourSubtotalRands,
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
    dcCombinerConfig,
    monthlyGenTable: buildMonthlyGenTable(input.monthlyKwh, monthlyGenerationKwh, tariffRate, input.advancedMonthlyKwh),
    twentyYearTable,
    lifetimeBillSavings: roundCurrency(lifetimeBillSavings),
    estimatedNetSavings,
    cumulativeImpact20Y,
    npv,
    roiPct,
  }
}

export function calculateQuote(input: CalculatorInput): QuoteData {
  const breakdown = buildBreakdown(input)
  const tariffRate = input.tariffRate ?? getTariffRateForMunicipality(input.municipality)
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
    inverterQty: '1',
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
    calculationWarnings: breakdown.warnings,
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
