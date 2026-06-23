import { NextResponse } from 'next/server'
import {
  buildMultiOptionQuoteData,
  calculateQuote,
  isBatteryCompatibleWithInverter,
  type EquipmentCatalogItem,
  type QuoteTierConfig,
} from '@/lib/solar/quote-calculator'
import {
  buildCalculatorInput,
  calculateTargetInverterKw,
  fetchMeasuredRoutes,
  fetchPricing,
  fetchSurvey,
  getPhaseFromGridSupply,
  mapEquipmentRows,
  requireAdmin,
} from '../helpers'

export const runtime = 'nodejs'

const TIER_LABELS = {
  premium: 'Premium',
  recommended: 'Recommended',
  budget: 'Budget',
} as const

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = await req.json()
  const surveyId = String(body.surveyId ?? '')
  if (!surveyId) {
    return new Response('surveyId is required', { status: 400 })
  }

  const { data: survey, error: surveyError } = await fetchSurvey(auth.supabase, surveyId)
  if (surveyError || !survey) {
    return new Response(surveyError?.message ?? 'Quote request not found', { status: 404 })
  }

  const targetKw = body.targetInverterKwOverride != null
    ? Number(body.targetInverterKwOverride)
    : calculateTargetInverterKw(survey)
  const phase = getPhaseFromGridSupply(String(survey.grid_supply ?? 'Single Phase'))

  const { data: configRows, error: configError } = await auth.supabase
    .from('quote_tier_configs')
    .select('*')
    .lte('min_inverter_kw', targetKw)
    .gte('max_inverter_kw', targetKw)
    .eq('active', true)
    .or(`phase.eq.${phase},phase.eq.any`)
    .order('sort_order')

  if (configError) {
    return new Response(configError.message, { status: 400 })
  }

  const configs = (configRows ?? []) as QuoteTierConfig[]
  const tierConfigs = ['premium', 'recommended', 'budget'].map((tier) =>
    configs.find((config) => config.tier === tier && config.phase === phase)
      ?? configs.find((config) => config.tier === tier && config.phase === 'any'),
  )

  if (tierConfigs.some((config) => !config)) {
    return new Response(`No tier configuration found for a ${targetKw}kW ${phase}-phase system`, { status: 400 })
  }

  const equipmentIds = Array.from(
    new Set(
      tierConfigs.flatMap((config) => [config!.inverter_id, config!.battery_id, config!.panel_id]),
    ),
  )

  const { data: equipmentRows, error: equipmentError } = await auth.supabase
    .from('equipment_catalog')
    .select('*')
    .in('id', equipmentIds)

  if (equipmentError) {
    return new Response(equipmentError.message, { status: 400 })
  }

  const equipmentMap = mapEquipmentRows((equipmentRows ?? []) as EquipmentCatalogItem[])
  const [measuredRoutes, pricing] = await Promise.all([
    fetchMeasuredRoutes(auth.supabase, surveyId),
    fetchPricing(auth.supabase),
  ])

  const options = tierConfigs.map((config) => {
    const inverter = equipmentMap.get(config!.inverter_id)
    const battery = equipmentMap.get(config!.battery_id)
    const panel = equipmentMap.get(config!.panel_id)

    if (!inverter || !battery || !panel) {
      throw new Error(`Missing equipment for tier config ${config!.tier}`)
    }

    if (!isBatteryCompatibleWithInverter(inverter, battery)) {
      throw new Error(`${battery.description} is not compatible with ${inverter.description}`)
    }

    const quote = calculateQuote(
      buildCalculatorInput(
        survey,
        { inverter, battery, panel },
        {
          quoteNumber: String(body.quoteNumber ?? survey.quote_number ?? ''),
          cableRoutes: measuredRoutes,
          pricing,
          tariffRate: body.tariffRate != null ? Number(body.tariffRate) : undefined,
          tier: config!.tier,
          tierLabel: TIER_LABELS[config!.tier],
          inverterQuantity: Number(body.inverterQuantity ?? 1),
          batteryQuantityOverride: body.batteryQuantityOverride != null ? Number(body.batteryQuantityOverride) : null,
          panelCountOverride: body.panelCountOverride != null ? Number(body.panelCountOverride) : null,
          targetInverterKwOverride: body.targetInverterKwOverride != null ? Number(body.targetInverterKwOverride) : null,
          minimumBatteryKwhOverride: body.minimumBatteryKwhOverride != null ? Number(body.minimumBatteryKwhOverride) : null,
        },
      ),
    )

    return {
      ...quote,
      tier: config!.tier,
      tierLabel: TIER_LABELS[config!.tier],
      recommended: config!.tier === 'recommended',
    }
  })

  return NextResponse.json({ quoteData: buildMultiOptionQuoteData(options) })
}
