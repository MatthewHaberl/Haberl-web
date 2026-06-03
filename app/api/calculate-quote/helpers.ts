import { createClient } from '@/lib/supabase/server'
import {
  calculateQuote,
  estimateTargetInverterKw,
  getTariffRateForMunicipality,
  type CalculatorInput,
  type EquipmentCatalogItem,
  type EquipmentCatalogPhase,
  type QuoteTier,
  type QuoteTierConfig,
} from '@/lib/solar/quote-calculator'

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: new Response('Unauthorized', { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: new Response('Forbidden - only admins can calculate quotes', { status: 403 }) }
  }

  return { supabase, user }
}

export function coerceNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function coerceText(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

export function getPhaseFromGridSupply(gridSupply: string): EquipmentCatalogPhase {
  return gridSupply.toLowerCase().includes('three') ? 'three' : 'single'
}

export function getAdvancedMonthlyKwh(request: Record<string, unknown>) {
  return MONTH_KEYS.map((month) => {
    const raw = request[`monthly_kwh_${month}`]
    if (raw == null || raw === '') return null
    return coerceNumber(raw, 0)
  })
}

export function buildCalculatorInput(
  request: Record<string, unknown>,
  equipment: {
    inverter: EquipmentCatalogItem
    battery: EquipmentCatalogItem
    panel: EquipmentCatalogItem
  },
  options: {
    quoteNumber: string
    cableRouteM: number
    tariffRate?: number
    tier?: QuoteTier
    tierLabel?: string
    inverterQuantity?: number
    batteryQuantityOverride?: number | null
    panelCountOverride?: number | null
    targetInverterKwOverride?: number | null
    minimumBatteryKwhOverride?: number | null
  },
) {
  const advancedMonthlyKwh = request.usage_mode === 'advanced'
    ? getAdvancedMonthlyKwh(request)
    : undefined

  const input: CalculatorInput = {
    quoteNumber: options.quoteNumber,
    tier: options.tier,
    tierLabel: options.tierLabel,
    customerName: coerceText(request.customer_name, 'Unknown'),
    customerPhone: coerceText(request.customer_phone, 'TBC'),
    customerEmail: coerceText(request.customer_email, 'TBC'),
    siteAddress: coerceText(request.address, 'TBC'),
    municipality: coerceText(request.municipality, 'Eskom'),
    gridSupply: coerceText(request.grid_supply, 'Single Phase'),
    storeys: coerceText(request.storeys, '1'),
    monthlyKwh: coerceNumber(request.monthly_kwh, 0),
    advancedMonthlyKwh,
    batteryHours: coerceNumber(request.battery_hours, 4),
    essentialLoadKw: coerceNumber(request.essential_load, 0),
    tariffRate: options.tariffRate ?? getTariffRateForMunicipality(String(request.municipality ?? 'Eskom')),
    cableRouteMetres: options.cableRouteM,
    lockedPanelCount: coerceNumber(request.design_panel_count, 0) || null,
    inverterQuantity: options.inverterQuantity ?? 1,
    batteryQuantityOverride: options.batteryQuantityOverride ?? null,
    panelCountOverride: options.panelCountOverride ?? null,
    targetInverterKwOverride: options.targetInverterKwOverride ?? null,
    minimumBatteryKwhOverride: options.minimumBatteryKwhOverride ?? null,
    equipment,
  }

  return input
}

export function calculateTargetInverterKw(request: Record<string, unknown>) {
  return estimateTargetInverterKw(
    coerceNumber(request.monthly_kwh, 0),
    coerceNumber(request.essential_load, 0),
    coerceNumber(request.design_kwp, 0) || null,
  )
}

export function findRecommendedTierConfig(configs: QuoteTierConfig[], targetKw: number, phase: EquipmentCatalogPhase) {
  const exactMatch = configs.find(
    (config) =>
      config.active &&
      config.tier === 'recommended' &&
      config.phase === phase &&
      targetKw >= config.min_inverter_kw &&
      targetKw <= config.max_inverter_kw,
  )
  if (exactMatch) return exactMatch

  return configs.find(
    (config) =>
      config.active &&
      config.tier === 'recommended' &&
      config.phase === 'any' &&
      targetKw >= config.min_inverter_kw &&
      targetKw <= config.max_inverter_kw,
  ) ?? null
}

export function mapEquipmentRows(rows: EquipmentCatalogItem[]) {
  return new Map(rows.map((row) => [row.id, row]))
}

export async function fetchSurvey(
  supabase: Awaited<ReturnType<typeof createClient>>,
  surveyId: string,
){
  return supabase
    .from('quote_requests')
    .select('*')
    .eq('id', surveyId)
    .single()
}

export function serializeGeneratedQuote(input: unknown) {
  return JSON.stringify(input, null, 2)
}

export function calculateOptionQuote(
  request: Record<string, unknown>,
  equipment: {
    inverter: EquipmentCatalogItem
    battery: EquipmentCatalogItem
    panel: EquipmentCatalogItem
  },
  options: {
    quoteNumber: string
    cableRouteM: number
    tariffRate?: number
    tier: QuoteTier
    tierLabel: string
    inverterQuantity?: number
    batteryQuantityOverride?: number | null
    panelCountOverride?: number | null
    targetInverterKwOverride?: number | null
    minimumBatteryKwhOverride?: number | null
  },
) {
  return calculateQuote(buildCalculatorInput(request, equipment, options))
}
