import { NextResponse } from 'next/server'
import { calculateQuote, isBatteryCompatibleWithInverter, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import {
  buildCalculatorInput,
  fetchMeasuredRoutes,
  fetchSurvey,
  requireAdmin,
} from './helpers'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = await req.json()
  const surveyId = String(body.surveyId ?? '')
  const inverterId = String(body.inverterId ?? '')
  const batteryId = String(body.batteryId ?? '')
  const panelId = String(body.panelId ?? '')

  if (!surveyId || !inverterId || !batteryId || !panelId) {
    return new Response('Missing required calculator inputs', { status: 400 })
  }

  const { data: survey, error: surveyError } = await fetchSurvey(auth.supabase, surveyId)
  if (surveyError || !survey) {
    return new Response(surveyError?.message ?? 'Quote request not found', { status: 404 })
  }

  const { data: equipmentRows, error: equipmentError } = await auth.supabase
    .from('equipment_catalog')
    .select('*')
    .in('id', [inverterId, batteryId, panelId])

  if (equipmentError) {
    return new Response(equipmentError.message, { status: 400 })
  }

  const items = (equipmentRows ?? []) as EquipmentCatalogItem[]
  const inverter = items.find((item) => item.id === inverterId)
  const battery = items.find((item) => item.id === batteryId)
  const panel = items.find((item) => item.id === panelId)

  if (!inverter || !battery || !panel) {
    return new Response('Could not find the selected equipment', { status: 400 })
  }

  if (!isBatteryCompatibleWithInverter(inverter, battery)) {
    return new Response(`${battery.description} is not compatible with ${inverter.description}`, { status: 400 })
  }

  const measuredRoutes = await fetchMeasuredRoutes(auth.supabase, surveyId)

  const quoteData = calculateQuote(
    buildCalculatorInput(
      survey,
      { inverter, battery, panel },
      {
        quoteNumber: String(body.quoteNumber ?? survey.quote_number ?? ''),
        cableRouteM: Number(body.cableRouteM ?? survey.cable_route_m ?? 15),
        cableRoutes: measuredRoutes,
        tariffRate: body.tariffRate != null ? Number(body.tariffRate) : undefined,
        tier: body.tier ? String(body.tier) as 'premium' | 'recommended' | 'budget' : undefined,
        tierLabel: body.tierLabel ? String(body.tierLabel) : undefined,
        inverterQuantity: Number(body.inverterQuantity ?? 1),
        batteryQuantityOverride: body.batteryQuantityOverride != null ? Number(body.batteryQuantityOverride) : null,
        panelCountOverride: body.panelCountOverride != null ? Number(body.panelCountOverride) : null,
        targetInverterKwOverride: body.targetInverterKwOverride != null ? Number(body.targetInverterKwOverride) : null,
        minimumBatteryKwhOverride: body.minimumBatteryKwhOverride != null ? Number(body.minimumBatteryKwhOverride) : null,
      },
    ),
  )

  return NextResponse.json({ quoteData })
}
