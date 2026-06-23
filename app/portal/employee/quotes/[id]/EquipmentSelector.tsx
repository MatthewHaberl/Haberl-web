'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { buildQuoteWorkbook } from '@/lib/solar/export-quote-workbook'
import {
  extractQuoteJson,
  isMultiOption,
  renderCustomerQuote,
  renderQuote,
  type AnyQuoteData,
  type MultiOptionQuoteData,
  type QuoteData,
} from '@/lib/solar/render-quote'
import {
  DEFAULT_PRICING,
  estimateTargetInverterKw,
  evaluateBatteryForInverter,
  getMaxPanelCountForInverter,
  getStoreysPremium,
  getTariffRateForMunicipality,
  isBatteryCompatibleWithInverter,
  mapSettingsToPricing,
  verifyPanelString,
  type EquipmentCatalogItem,
  type EquipmentCatalogPhase,
  type PricingSettings,
  type QuoteTierConfig,
} from '@/lib/solar/quote-calculator'
import { DepositSelector } from './DepositSelector'
import { CompatSelect } from '@/components/ui/CompatSelect'
import { AlertTriangle, Check, Download, Eye, EyeOff, Loader2, Lock, LockOpen, Save, WandSparkles } from 'lucide-react'

type QuoteVersion = 'simplified' | 'detailed'

interface Props {
  requestId: string
  request: Record<string, unknown>
  existingQuote: string | null
  existingHtml: string | null
  existingDepositItems: string[]
  existingQuoteNumber: string | null
  existingQuoteVersion: QuoteVersion
  nextQuoteNumber: string
  onQuoteDataChange?: (data: AnyQuoteData | null) => void
}

function formatRands(value: number) {
  return `R${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function isSpecificBrand(value: unknown) {
  if (typeof value !== 'string') return false
  const normalized = value.toLowerCase()
  return normalized.trim().length > 0 &&
    !normalized.includes('no preference') &&
    !normalized.includes('ai will recommend')
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : ''
}

function normalizeBrand(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function coerceNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function brandMatchesPreference(itemBrand: string, preferredBrand: string | null) {
  if (!preferredBrand) return true
  const item = normalizeBrand(itemBrand)
  const preferred = normalizeBrand(preferredBrand)
  return item === preferred || item.includes(preferred) || preferred.includes(item)
}

function getPhase(gridSupply: unknown): EquipmentCatalogPhase {
  return String(gridSupply ?? '').toLowerCase().includes('three') ? 'three' : 'single'
}

function getDepositSource(quoteData: AnyQuoteData | null) {
  if (!quoteData) return null
  if (!isMultiOption(quoteData)) return quoteData as QuoteData
  const multi = quoteData as MultiOptionQuoteData
  return multi.options.find((option) => option.tier === 'recommended') ?? multi.options[0]
}

function getSingleQuoteData(quoteData: AnyQuoteData | null) {
  if (!quoteData || isMultiOption(quoteData)) return null
  return quoteData as QuoteData
}

function readSavedSizingValue(value: unknown, fallback: number) {
  return Math.max(0, coerceNumber(value, fallback))
}

function parseExistingQuote(existingQuote: string | null, existingHtml: string | null, existingQuoteVersion: QuoteVersion) {
  const parsed = existingQuote ? extractQuoteJson(existingQuote) : null

  if (!parsed) {
    return {
      quoteData: null as AnyQuoteData | null,
      detailedHtml: existingQuoteVersion === 'detailed' ? (existingHtml ?? '') : '',
      customerHtml: existingQuoteVersion === 'simplified' ? (existingHtml ?? '') : '',
      defaultDepositItems: [] as string[],
    }
  }

  const depositSource = getDepositSource(parsed)
  return {
    quoteData: parsed,
    detailedHtml: renderQuote(parsed),
    customerHtml: renderCustomerQuote(parsed),
    defaultDepositItems: depositSource?.depositItems.map((item) => item.name) ?? [],
  }
}

function openHtmlPreview(html: string) {
  const preview = window.open('', '_blank')
  if (!preview) return
  preview.document.write(html)
  preview.document.close()
}

function formatCatalogError(message: string) {
  if (message.includes('public.equipment_catalog')) {
    return 'Quote calculator setup is incomplete: Supabase table public.equipment_catalog is missing. Run migrations 006-008 and seed the catalog, then refresh.'
  }

  if (message.includes('public.quote_tier_configs')) {
    return 'Quote calculator setup is incomplete: Supabase table public.quote_tier_configs is missing. Run migrations 007-008, then refresh.'
  }

  return message
}

function pickClosestInverter(items: EquipmentCatalogItem[], targetKw: number) {
  if (!items.length) return null

  return [...items].sort((left, right) => {
    const leftKw = (left.watts_ac ?? 0) / 1000
    const rightKw = (right.watts_ac ?? 0) / 1000
    const leftShortfall = leftKw < targetKw ? targetKw - leftKw : 0
    const rightShortfall = rightKw < targetKw ? targetKw - rightKw : 0

    if (leftShortfall !== rightShortfall) return leftShortfall - rightShortfall

    const leftOversize = leftKw >= targetKw ? leftKw - targetKw : 99
    const rightOversize = rightKw >= targetKw ? rightKw - targetKw : 99
    if (leftOversize !== rightOversize) return leftOversize - rightOversize

    return left.sort_order - right.sort_order
  })[0] ?? null
}

export function EquipmentSelector({
  requestId,
  request,
  existingQuote,
  existingHtml,
  existingDepositItems,
  existingQuoteNumber,
  existingQuoteVersion,
  nextQuoteNumber,
  onQuoteDataChange,
}: Props) {
  const initialParsed = parseExistingQuote(existingQuote, existingHtml, existingQuoteVersion)
  const initialSingleQuote = getSingleQuoteData(initialParsed.quoteData)
  const initialSizingInputs = initialSingleQuote?.sizingInputs
  const supabase = createClient()

  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([])
  const [tierConfigs, setTierConfigs] = useState<QuoteTierConfig[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [inverterId, setInverterId] = useState<string>(toOptionalString(request.selected_inverter_id))
  const [batteryId, setBatteryId] = useState<string>(toOptionalString(request.selected_battery_id))
  const [panelId, setPanelId] = useState<string>(toOptionalString(request.selected_panel_id))
  // DC cable run input removed from the UI; value still flows from the saved request
  // (default 15m) into the §5.3.2 voltage-drop check, DC-cable BOM quantity, and save.
  const cableRouteM = String(request.cable_route_m ?? 15)
  const [tariffRate, setTariffRate] = useState<string>(
    request.tariff_rate != null
      ? String(request.tariff_rate)
      : request.municipality ? String(getTariffRateForMunicipality(String(request.municipality))) : '2.65',
  )
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(!!existingHtml || !!existingQuote)
  const [saveError, setSaveError] = useState('')
  const [calcError, setCalcError] = useState('')
  const [quoteData, setQuoteData] = useState<AnyQuoteData | null>(initialParsed.quoteData)
  const [detailedHtml, setDetailedHtml] = useState(initialParsed.detailedHtml)
  const [customerHtml, setCustomerHtml] = useState(initialParsed.customerHtml)
  const [quoteVersion, setQuoteVersion] = useState<QuoteVersion>(existingQuoteVersion ?? 'simplified')
  const [showPreview, setShowPreview] = useState(!!initialParsed.detailedHtml || !!initialParsed.customerHtml)
  const [depositSelected, setDepositSelected] = useState<string[]>(
    existingDepositItems.length ? existingDepositItems : initialParsed.defaultDepositItems,
  )
  const [quoteNumber, setQuoteNumber] = useState(existingQuoteNumber ?? nextQuoteNumber)
  // Design lock — freezes the BOM snapshot that procurement buys against
  const [lockedAt, setLockedAt] = useState<string | null>(toOptionalString(request.design_locked_at) || null)
  const [locking, setLocking] = useState(false)
  const [lockError, setLockError] = useState('')
  // Company pricing (markup % etc. from settings) — display + saved premium
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING)

  useEffect(() => {
    let active = true
    async function loadPricing() {
      const { data } = await supabase
        .from('company_settings')
        .select('markup_pct, coc_fee_rands, labour_inverter_per_w, labour_panel_per_w, storey_premium_2, storey_premium_3, tariffs')
        .eq('id', true)
        .maybeSingle()
      if (active && data) setPricing(mapSettingsToPricing(data))
    }
    void loadPricing()
    return () => { active = false }
  }, [supabase])

  const phase = getPhase(request.grid_supply)
  const lockedDesignKwp = coerceNumber(request.design_kwp, 0) || null
  const monthlyKwh = coerceNumber(request.monthly_kwh, 0)
  const essentialLoadKw = coerceNumber(request.essential_load, 0)
  const lockedPanelCount = coerceNumber(request.design_panel_count, 0) || null
  const autoTargetKw = estimateTargetInverterKw(
    monthlyKwh,
    essentialLoadKw,
    lockedDesignKwp,
  )
  const [inverterQuantity, setInverterQuantity] = useState<string>(String(Math.max(1, coerceNumber(initialSizingInputs?.inverterQty, 1) || 1)))
  const [batteryQuantity, setBatteryQuantity] = useState<string>(String(Math.max(1, coerceNumber(initialSizingInputs?.batteryQty ?? request.selected_battery_qty, 1) || 1)))
  const [targetInverterKwInput] = useState<string>(String(readSavedSizingValue(initialSizingInputs?.targetInverterKw, autoTargetKw)))
  const [minimumBatteryKwhInput] = useState<string>(String(readSavedSizingValue(initialSizingInputs?.minimumBatteryKwh, autoTargetKw * 2)))
  const initialPanelTarget = Math.max(
    0,
    Math.round(readSavedSizingValue(initialSizingInputs?.targetPanelCount ?? initialSingleQuote?.panelCount, lockedPanelCount ?? 0)),
  )
  const [targetPanelCountInput, setTargetPanelCountInput] = useState<string>(
    initialPanelTarget > 0 ? String(initialPanelTarget) : '',
  )
  const targetKw = Math.max(1, Math.round(coerceNumber(targetInverterKwInput, autoTargetKw) || autoTargetKw))
  const inverterQuantityValue = Math.max(1, Math.round(coerceNumber(inverterQuantity, 1) || 1))
  const batteryQuantityValue = Math.max(1, Math.round(coerceNumber(batteryQuantity, 1) || 1))
  const minimumBatteryKwhValue = Math.max(0, coerceNumber(minimumBatteryKwhInput, targetKw * 2) || targetKw * 2)
  const targetPanelCountOverride = Math.max(0, Math.round(coerceNumber(targetPanelCountInput, lockedPanelCount ?? 0) || 0))
  const hasSpecificPreferences = isSpecificBrand(request.inverter_brand) || isSpecificBrand(request.battery_brand) || isSpecificBrand(request.panel_brand)
  const hasPersistedSelection = Boolean(
    toOptionalString(request.selected_inverter_id) ||
      toOptionalString(request.selected_battery_id) ||
      toOptionalString(request.selected_panel_id),
  )

  useEffect(() => {
    onQuoteDataChange?.(quoteData)
  }, [onQuoteDataChange, quoteData])

  useEffect(() => {
    let active = true

    async function loadCatalog() {
      setLoadingCatalog(true)
      setCatalogError('')

      const [{ data: equipmentRows, error: equipmentError }, { data: configRows, error: configError }] = await Promise.all([
        supabase.from('equipment_catalog').select('*').eq('active', true).order('sort_order').order('brand').order('description'),
        supabase.from('quote_tier_configs').select('*').eq('active', true).order('sort_order'),
      ])

      if (!active) return

      if (equipmentError || configError) {
        setCatalogError(formatCatalogError(equipmentError?.message ?? configError?.message ?? 'Could not load catalog'))
        setLoadingCatalog(false)
        return
      }

      const loadedCatalog = (equipmentRows ?? []) as EquipmentCatalogItem[]
      const loadedConfigs = (configRows ?? []) as QuoteTierConfig[]

      if (loadedCatalog.length === 0) {
        setCatalogError('Quote calculator setup is incomplete: equipment_catalog exists but has no rows yet. Seed the catalog, then refresh.')
        setLoadingCatalog(false)
        return
      }

      setCatalog(loadedCatalog)
      setTierConfigs(loadedConfigs)
      setLoadingCatalog(false)

      if (hasPersistedSelection) return

      const recommendedConfig =
        loadedConfigs.find((config) =>
          config.active &&
          config.tier === 'recommended' &&
          config.phase === phase &&
          targetKw >= config.min_inverter_kw &&
          targetKw <= config.max_inverter_kw,
        ) ??
        loadedConfigs.find((config) =>
          config.active &&
          config.tier === 'recommended' &&
          config.phase === 'any' &&
          targetKw >= config.min_inverter_kw &&
          targetKw <= config.max_inverter_kw,
        )

      if (recommendedConfig && !hasSpecificPreferences) {
        setInverterId(recommendedConfig.inverter_id)
        setBatteryId(recommendedConfig.battery_id)
        setPanelId(recommendedConfig.panel_id)
        return
      }

      if (!hasSpecificPreferences) {
        const fallbackPanel = loadedCatalog.find((item) => item.category === 'panel' && item.active) ?? null
        const fallbackInverter = pickClosestInverter(
          loadedCatalog.filter((item) =>
            item.category === 'inverter' &&
            item.active &&
            (item.phase === phase || item.phase === 'any'),
          ),
          targetKw,
        )
        const fallbackBattery = loadedCatalog.find((item) =>
          item.category === 'battery' &&
          item.active &&
          (!fallbackInverter || isBatteryCompatibleWithInverter(fallbackInverter, item)),
        ) ?? null

        if (fallbackInverter) setInverterId(fallbackInverter.id)
        if (fallbackBattery) setBatteryId(fallbackBattery.id)
        if (fallbackPanel) setPanelId(fallbackPanel.id)
      }

    }

    void loadCatalog()
    return () => { active = false }
  }, [hasPersistedSelection, hasSpecificPreferences, phase, supabase, targetKw])

  const preferredInverterBrand = isSpecificBrand(request.inverter_brand) ? String(request.inverter_brand) : null
  const preferredBatteryBrand = isSpecificBrand(request.battery_brand) ? String(request.battery_brand) : null
  const preferredPanelBrand = isSpecificBrand(request.panel_brand) ? String(request.panel_brand) : null

  const inverterBrandInCatalog = !preferredInverterBrand || catalog.some((item) => item.category === 'inverter' && item.active && brandMatchesPreference(item.brand, preferredInverterBrand))
  const batteryBrandInCatalog = !preferredBatteryBrand || catalog.some((item) => item.category === 'battery' && item.active && brandMatchesPreference(item.brand, preferredBatteryBrand))
  const panelBrandInCatalog = !preferredPanelBrand || catalog.some((item) => item.category === 'panel' && item.active && brandMatchesPreference(item.brand, preferredPanelBrand))

  const inverterOptions = useMemo(() => {
    const filtered = catalog.filter((item) =>
      item.category === 'inverter' &&
      item.active &&
      (item.phase === phase || item.phase === 'any') &&
      brandMatchesPreference(item.brand, preferredInverterBrand),
    )
    if (filtered.length > 0) return filtered
    // Brand not in catalog — show all phase-compatible inverters
    return catalog.filter((item) =>
      item.category === 'inverter' &&
      item.active &&
      (item.phase === phase || item.phase === 'any'),
    )
  }, [catalog, phase, preferredInverterBrand])

  const panelOptions = useMemo(() => {
    const filtered = catalog.filter((item) =>
      item.category === 'panel' &&
      item.active &&
      brandMatchesPreference(item.brand, preferredPanelBrand),
    )
    if (filtered.length > 0) return filtered
    return catalog.filter((item) => item.category === 'panel' && item.active)
  }, [catalog, preferredPanelBrand])

  const fallbackInverter = useMemo(
    () => pickClosestInverter(inverterOptions, targetKw),
    [inverterOptions, targetKw],
  )
  const effectiveInverterId = inverterOptions.some((item) => item.id === inverterId)
    ? inverterId
    : (fallbackInverter?.id ?? inverterOptions[0]?.id ?? '')
  const selectedInverter = inverterOptions.find((item) => item.id === effectiveInverterId) ?? catalog.find((item) => item.id === effectiveInverterId) ?? null
  // All phase/brand-appropriate batteries, each with a compatibility verdict.
  // Incompatible ones stay VISIBLE (shown disabled/struck in the picker), not hidden.
  const batteryCandidates = useMemo(() => {
    const all = catalog.filter((item) => item.category === 'battery' && item.active)
    const branded = preferredBatteryBrand
      ? all.filter((item) => brandMatchesPreference(item.brand, preferredBatteryBrand))
      : all
    const list = branded.length > 0 ? branded : all
    return list.map((item) => ({ item, compat: evaluateBatteryForInverter(selectedInverter, item) }))
  }, [catalog, preferredBatteryBrand, selectedInverter])
  const selectableBatteries = batteryCandidates.filter((c) => c.compat.level !== 'block')
  const effectiveBatteryId = selectableBatteries.some((c) => c.item.id === batteryId)
    ? batteryId
    : (selectableBatteries[0]?.item.id ?? '')
  const effectivePanelId = panelOptions.some((item) => item.id === panelId) ? panelId : (panelOptions[0]?.id ?? '')
  const selectedBattery = batteryCandidates.find((c) => c.item.id === effectiveBatteryId)?.item ?? null
  const selectedPanel = panelOptions.find((item) => item.id === effectivePanelId) ?? catalog.find((item) => item.id === effectivePanelId) ?? null
  const stringVerdict = verifyPanelString(selectedInverter, selectedPanel, targetPanelCountOverride)
  const previewHtml = quoteVersion === 'detailed' ? detailedHtml : customerHtml
  const depositSource = getDepositSource(quoteData)
  const hasRecommendedMulti = tierConfigs.some((config) => config.tier === 'recommended' && (config.phase === phase || config.phase === 'any'))

  async function calculateSingle() {
    if (!selectedInverter || !selectedBattery || !selectedPanel) {
      setCalcError('Select an inverter, battery, and panel first.')
      return
    }

    setCalculating(true)
    setCalcError('')
    setSaved(false)

    try {
      const response = await fetch('/api/calculate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyId: requestId,
          inverterId: selectedInverter.id,
          batteryId: selectedBattery.id,
          panelId: selectedPanel.id,
          inverterQuantity: inverterQuantityValue,
          batteryQuantityOverride: batteryQuantityValue,
          panelCountOverride: targetPanelCountOverride || null,
          targetInverterKwOverride: targetKw,
          minimumBatteryKwhOverride: minimumBatteryKwhValue,
          cableRouteM: Number(cableRouteM || 0),
          tariffRate: Number(tariffRate || 0),
          quoteNumber,
          tier: 'recommended',
          tierLabel: 'Recommended',
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text() || `HTTP ${response.status}`)
      }

      const payload = await response.json()
      const nextQuoteData = payload.quoteData as AnyQuoteData
      setQuoteData(nextQuoteData)
      setDetailedHtml(renderQuote(nextQuoteData))
      setCustomerHtml(renderCustomerQuote(nextQuoteData))
      const nextDepositItems = getDepositSource(nextQuoteData)?.depositItems.map((item) => item.name) ?? []
      setDepositSelected(nextDepositItems)
      setShowPreview(true)
    } catch (error) {
      setCalcError(error instanceof Error ? error.message : 'Calculation failed')
    } finally {
      setCalculating(false)
    }
  }

  async function calculateThreeTier() {
    setCalculating(true)
    setCalcError('')
    setSaved(false)

    try {
      const response = await fetch('/api/calculate-quote/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyId: requestId,
          inverterQuantity: inverterQuantityValue,
          batteryQuantityOverride: batteryQuantityValue,
          panelCountOverride: targetPanelCountOverride || null,
          targetInverterKwOverride: targetKw,
          minimumBatteryKwhOverride: minimumBatteryKwhValue,
          cableRouteM: Number(cableRouteM || 0),
          tariffRate: Number(tariffRate || 0),
          quoteNumber,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text() || `HTTP ${response.status}`)
      }

      const payload = await response.json()
      const nextQuoteData = payload.quoteData as AnyQuoteData
      setQuoteData(nextQuoteData)
      setDetailedHtml(renderQuote(nextQuoteData))
      setCustomerHtml(renderCustomerQuote(nextQuoteData))
      const nextDepositItems = getDepositSource(nextQuoteData)?.depositItems.map((item) => item.name) ?? []
      setDepositSelected(nextDepositItems)
      setShowPreview(true)
    } catch (error) {
      setCalcError(error instanceof Error ? error.message : '3-tier calculation failed')
    } finally {
      setCalculating(false)
    }
  }

  async function handleSave() {
    if (!quoteData || !previewHtml) return

    setSaving(true)
    setSaveError('')

    try {
      // First save with the auto-suggested number → consume it atomically from
      // the sequence so two open quotes can never collide. A custom typed
      // number is respected as-is; an already-saved number never changes.
      let finalQuoteNumber = quoteNumber
      if (!existingQuoteNumber && quoteNumber === nextQuoteNumber) {
        const { data: issued } = await supabase.rpc('next_quote_number')
        if (typeof issued === 'string' && issued) {
          finalQuoteNumber = issued
          setQuoteNumber(issued)
        }
      }

      const depositQuote = getDepositSource(quoteData)
      const depositAmountCents = depositQuote?.depositItems?.length
        ? Math.round(
            depositQuote.depositItems
              .filter((item) => depositSelected.includes(item.name))
              .reduce((sum, item) => sum + item.amountRands, 0) * 100,
          )
        : null

      const totalAmountCents = depositQuote?.quoteTotalRands
        ? Math.round(depositQuote.quoteTotalRands * 100)
        : null

      const { error } = await supabase
        .from('quote_requests')
        .update({
          quote_html: previewHtml || null,
          quote_number: finalQuoteNumber || null,
          quote_version: quoteVersion,
          generated_quote: JSON.stringify(quoteData, null, 2),
          generated_at: new Date().toISOString(),
          status: 'generated',
          deposit_items: depositSelected,
          deposit_amount: depositAmountCents,
          total_amount: totalAmountCents,
          generation_method: 'calculator',
          selected_inverter_id: selectedInverter?.id ?? null,
          selected_battery_id: selectedBattery?.id ?? null,
          selected_panel_id: selectedPanel?.id ?? null,
          selected_battery_qty: depositQuote ? Number(isMultiOption(quoteData) ? getDepositSource(quoteData)?.batteryQty ?? null : (quoteData as QuoteData).batteryQty) : null,
          selected_panel_qty: depositQuote ? Number(isMultiOption(quoteData) ? getDepositSource(quoteData)?.panelCount ?? null : (quoteData as QuoteData).panelCount) : null,
          cable_route_m: Number(cableRouteM || 0),
          tariff_rate: tariffRate ? Number(tariffRate) : null,
          storeys_premium_rands: getStoreysPremium(String(request.storeys ?? ''), pricing.storeyPremium2, pricing.storeyPremium3),
        })
        .eq('id', requestId)

      if (error) throw error
      setSaved(true)

      // Silently sync used equipment to the shop products table (inactive until manually activated)
      const catalogIds = [selectedInverter?.id, selectedBattery?.id, selectedPanel?.id].filter(Boolean)
      if (catalogIds.length) {
        fetch('/api/sync-to-shop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ catalogIds }),
        }).catch(() => {/* non-critical */})
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Lock the design: snapshot the saved quote JSON so procurement buys
  // against exactly this BOM, even if the quote is recalculated later.
  async function handleLockToggle() {
    setLockError('')
    if (lockedAt) {
      if (!window.confirm('Unlock the design? Procurement will follow the live quote again.')) return
      setLocking(true)
      const { error } = await supabase
        .from('quote_requests')
        .update({ design_locked_at: null, design_locked_by: null, bom_snapshot: null })
        .eq('id', requestId)
      if (error) setLockError(error.message)
      else setLockedAt(null)
      setLocking(false)
      return
    }
    if (!quoteData || !saved) {
      setLockError('Save the quote first — the lock freezes the saved version.')
      return
    }
    if (!window.confirm('Lock the design for procurement? The current BOM is frozen — survey or quote changes after this will warn until you re-lock.')) return
    setLocking(true)
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('quote_requests')
      .update({ design_locked_at: now, design_locked_by: user?.id ?? null, bom_snapshot: quoteData })
      .eq('id', requestId)
    if (error) setLockError(error.message)
    else setLockedAt(now)
    setLocking(false)
  }

  function handleDownloadWorkbook() {
    if (!quoteData) return

    const workbook = buildQuoteWorkbook(quoteData)
    const blob = new Blob([workbook.bytes.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = workbook.filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function optionLabel(item: EquipmentCatalogItem) {
    return `${item.description} - ${formatRands(item.cost_rands * pricing.markup)}`
  }

  if (loadingCatalog) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading equipment catalog...
      </div>
    )
  }

  if (catalogError) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {catalogError}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-foreground">Quote #</label>
        <input
          type="text"
          value={quoteNumber}
          onChange={(event) => {
            setQuoteNumber(event.target.value)
            setSaved(false)
          }}
          className="h-8 w-40 rounded border border-border bg-background px-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Inverter — selection + quantity together */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Inverter</span>
            <select
              value={effectiveInverterId}
              onChange={(event) => {
                setInverterId(event.target.value)
                setSaved(false)
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            >
              {inverterOptions.map((item) => (
                <option key={item.id} value={item.id}>{optionLabel(item)}</option>
              ))}
            </select>
            {preferredInverterBrand && (
              <span className={`text-xs ${inverterBrandInCatalog ? 'text-muted-foreground' : 'text-amber-600'}`}>
                {inverterBrandInCatalog ? `Filtered to ${preferredInverterBrand}` : `${preferredInverterBrand} not in catalog — showing all`}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Quantity</span>
            <input
              type="number"
              min="1"
              step="1"
              value={inverterQuantity}
              onChange={(event) => {
                setInverterQuantity(event.target.value)
                setSaved(false)
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">Parallel inverters — set 1 or more.</span>
          </label>
        </div>

        {/* Battery — selection + quantity together */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Battery</span>
            <CompatSelect
              value={effectiveBatteryId}
              onChange={(id) => { setBatteryId(id); setSaved(false) }}
              options={batteryCandidates.map((c) => ({
                id: c.item.id,
                label: optionLabel(c.item),
                level: c.compat.level,
                reason: c.compat.reason || undefined,
              }))}
              placeholder="Select a battery"
            />
            {preferredBatteryBrand && (
              <span className={`text-xs ${batteryBrandInCatalog ? 'text-muted-foreground' : 'text-amber-600'}`}>
                {batteryBrandInCatalog ? `Filtered to ${preferredBatteryBrand}` : `${preferredBatteryBrand} not in catalog — showing all`}
              </span>
            )}
            {!preferredBatteryBrand && selectedInverter && (
              <span className="text-xs text-muted-foreground">
                Incompatible batteries are shown greyed-out with the reason.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Quantity</span>
            <input
              type="number"
              min="1"
              step="1"
              value={batteryQuantity}
              onChange={(event) => {
                setBatteryQuantity(event.target.value)
                setSaved(false)
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">Battery modules — set 1 or more.</span>
          </label>
        </div>

        {/* Panel — selection + panel count together */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Panel</span>
            <select
              value={effectivePanelId}
              onChange={(event) => {
                setPanelId(event.target.value)
                setSaved(false)
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            >
              {panelOptions.map((item) => (
                <option key={item.id} value={item.id}>{optionLabel(item)}</option>
              ))}
            </select>
            {preferredPanelBrand && (
              <span className={`text-xs ${panelBrandInCatalog ? 'text-muted-foreground' : 'text-amber-600'}`}>
                {panelBrandInCatalog ? `Filtered to ${preferredPanelBrand}` : `${preferredPanelBrand} not in catalog — showing all`}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Panel count</span>
            <input
              type="number"
              min="0"
              step="1"
              value={targetPanelCountInput}
              placeholder={selectedInverter && selectedPanel ? String(getMaxPanelCountForInverter(selectedInverter, selectedPanel) ?? '') : ''}
              onChange={(event) => {
                setTargetPanelCountInput(event.target.value)
                setSaved(false)
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">Leave blank to auto-size from usage.</span>
          </label>
        </div>
      </div>

      {/* String design — verifies the panel count (set next to the panel above) against the inverter */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">String design</p>
        <p className="text-xs text-muted-foreground mt-1">
          The panel count set next to the panel above is verified against the inverter&apos;s string limits.
        </p>
        <div className="mt-3">
          {stringVerdict ? (
            <div className={`rounded-md border p-3 text-sm ${
              stringVerdict.level === 'block'
                ? 'border-destructive/40 bg-destructive/5 text-destructive'
                : stringVerdict.level === 'warn'
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-success/40 bg-success/5 text-success'
            }`}>
              <p className="font-medium">
                {stringVerdict.level === 'block' ? '⛔' : stringVerdict.level === 'warn' ? '⚠' : '✓'} {stringVerdict.summary}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {stringVerdict.notes.map((note, i) => <li key={i}>{note}</li>)}
              </ul>
            </div>
          ) : (
            <div className="flex items-center text-xs text-muted-foreground">
              Enter a panel count above (with an inverter + panel selected) to verify the string.
            </div>
          )}
        </div>
      </div>

      {/* Energy — tariff is specific to this job and can be adjusted any time */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Energy</p>
        <p className="text-xs text-muted-foreground mt-1">
          Tariff used for the savings calculation — specific to this job, adjust any time.
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Tariff rate (R/kWh)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tariffRate}
              onChange={(event) => {
                setTariffRate(event.target.value)
                setSaved(false)
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              Defaulted from {String(request.municipality ?? 'Eskom')}.
            </span>
          </label>
        </div>
      </div>

      {(() => {
        const evCharger = toOptionalString(request.ev_charger)
        if (!evCharger || evCharger === 'No') return null
        const cableDesc = evCharger.includes('7kW')
          ? '10m 6mm² cable, 32A DP MCB'
          : evCharger.includes('11kW')
            ? '10m 6mm² 3-phase cable, 20A TP MCB'
            : '10m 10mm² 3-phase cable, 32A TP MCB'
        return (
          <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
            <span className="font-medium text-accent">EV Charger</span>
            <span className="text-muted-foreground">
              {evCharger} — charger unit, {cableDesc}, and installation will be added automatically.
            </span>
          </div>
        )
      })()}

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="accent" onClick={calculateSingle} disabled={calculating || !selectedInverter || !selectedBattery || !selectedPanel}>
          {calculating
            ? <><Loader2 className="h-4 w-4 animate-spin" />Calculating...</>
            : <><WandSparkles className="h-4 w-4" />Calculate</>}
        </Button>
        {!hasSpecificPreferences && hasRecommendedMulti && (
          <Button variant="outline" onClick={calculateThreeTier} disabled={calculating}>
            3-tier quote
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          Logic target: about {targetKw}kW {phase}-phase
        </span>
      </div>

      {calcError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{calcError}</p>
      )}

      {/* Price staleness: supplier costs older than 60 days deserve a check */}
      {(() => {
        const STALE_MS = 60 * 86_400_000
        const stale = [selectedInverter, selectedBattery, selectedPanel]
          .filter((item): item is EquipmentCatalogItem => !!item)
          .filter((item) => item.price_updated_at && Date.now() - new Date(item.price_updated_at).getTime() > STALE_MS)
        if (stale.length === 0) return null
        return (
          <p className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Price check recommended — last confirmed over 60 days ago:{' '}
              {stale.map((item) => `${item.description} (${new Date(item.price_updated_at!).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })})`).join(', ')}.
              Update costs in Settings → Catalog before sending.
            </span>
          </p>
        )
      })()}

      {/* SANS 10142-1 / design-rule verdict for the calculated quote — full detail in the BOM tab */}
      {depositSource?.complianceChecks?.length ? (() => {
        const blockers = depositSource.complianceChecks!.filter((c) => c.status === 'blocker')
        const complianceWarnings = depositSource.complianceChecks!.filter((c) => c.status === 'warning')
        if (blockers.length === 0 && complianceWarnings.length === 0) {
          return (
            <p className="rounded-md bg-success/10 border border-success/30 px-3 py-2 text-xs text-success">
              SANS 10142-1 &amp; design-rule checks passing ({depositSource.complianceChecks!.length} checks). Full detail in the BOM tab.
            </p>
          )
        }
        return (
          <div className={`rounded-md px-3 py-2 text-xs border ${blockers.length ? 'bg-destructive/10 border-destructive/40' : 'bg-warning/10 border-warning/40'}`}>
            <p className="font-semibold mb-1">
              {blockers.length > 0
                ? `${blockers.length} compliance blocker${blockers.length === 1 ? '' : 's'} — resolve before sending`
                : `${complianceWarnings.length} compliance warning${complianceWarnings.length === 1 ? '' : 's'}`}
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              {[...blockers, ...complianceWarnings].slice(0, 4).map((check) => (
                <li key={check.id}>{check.title} ({check.reference})</li>
              ))}
            </ul>
            <p className="mt-1 text-muted-foreground">Full detail in the BOM tab.</p>
          </div>
        )
      })() : null}

      {previewHtml && (
        <>
          <div className="border-t border-border" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-foreground">Review quote</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose which version should be saved into the customer portal.
                </p>
              </div>
              <Button variant="outline" size="sm" type="button" onClick={() => setShowPreview((state) => !state)}>
                {showPreview
                  ? <><EyeOff className="h-3.5 w-3.5" />Hide preview</>
                  : <><Eye className="h-3.5 w-3.5" />Show preview</>}
              </Button>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">Customer-facing version</p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant={quoteVersion === 'simplified' ? 'accent' : 'outline'}
                  onClick={() => {
                    setQuoteVersion('simplified')
                    setSaved(false)
                  }}
                >
                  Simplified
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={quoteVersion === 'detailed' ? 'accent' : 'outline'}
                  onClick={() => {
                    setQuoteVersion('detailed')
                    setSaved(false)
                  }}
                >
                  Detailed
                </Button>
              </div>
            </div>

            {showPreview && (
              <iframe
                srcDoc={previewHtml}
                title={`${quoteVersion} quote preview`}
                className="w-full rounded-lg border border-border"
                style={{ height: '700px' }}
                sandbox="allow-same-origin"
              />
            )}

            {depositSource?.depositItems?.length ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-foreground">
                  Deposit items{quoteData && isMultiOption(quoteData) ? ' (from Recommended option)' : ''}
                </p>
                <p className="text-xs text-muted-foreground">Choose which items require an upfront deposit.</p>
                <DepositSelector
                  items={depositSource.depositItems}
                  selected={depositSelected}
                  quoteTotalRands={depositSource.quoteTotalRands}
                  onChange={(value) => {
                    setDepositSelected(value)
                    setSaved(false)
                  }}
                />
              </div>
            ) : null}
          </div>
        </>
      )}

      {quoteData && (
        <>
          <div className="border-t border-border" />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="default" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</>
                  : <><Save className="h-4 w-4" />Save Quote</>}
              </Button>
              {saved && !saveError && (
                <span className="flex items-center gap-1.5 text-sm text-success">
                  <Check className="h-4 w-4" /> Saved
                </span>
              )}
              <Button variant="outline" size="sm" type="button" onClick={handleDownloadWorkbook}>
                <Download className="h-4 w-4" /> Export supplier BOM (.xlsx)
              </Button>
              {detailedHtml && (
                <Button variant="outline" size="sm" type="button" onClick={() => openHtmlPreview(detailedHtml)}>
                  Open detailed BOM
                </Button>
              )}
              {customerHtml && (
                <Button variant="outline" size="sm" type="button" onClick={() => openHtmlPreview(customerHtml)}>
                  Open simplified
                </Button>
              )}
            </div>
            {saveError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{saveError}</p>
            )}

            {/* Design lock — order once against a frozen BOM */}
            <div className={`flex items-center gap-3 flex-wrap rounded-md border px-3 py-2 ${
              lockedAt ? 'border-success/40 bg-success/5' : 'border-border bg-muted/30'
            }`}>
              {lockedAt ? (
                <span className="flex items-center gap-1.5 text-xs text-success font-medium">
                  <Lock className="h-3.5 w-3.5" />
                  Design locked {new Date(lockedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} — the job BOM uses this frozen snapshot
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Happy with the design? Lock it so procurement buys exactly this BOM.
                </span>
              )}
              {lockedAt && !saved && (
                <span className="flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> Quote changed after locking — re-lock to update the snapshot
                </span>
              )}
              <Button
                variant={lockedAt ? 'ghost' : 'outline'}
                size="sm"
                type="button"
                onClick={handleLockToggle}
                disabled={locking || (!lockedAt && !saved)}
                className="ml-auto"
                title={!lockedAt && !saved ? 'Save the quote first' : undefined}
              >
                {locking
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : lockedAt
                    ? <><LockOpen className="h-3.5 w-3.5" /> Unlock</>
                    : <><Lock className="h-3.5 w-3.5" /> Lock design</>}
              </Button>
            </div>
            {lockedAt && !saved && (
              <p className="text-[11px] text-muted-foreground -mt-1">
                Re-lock = unlock, save, lock again. Until then procurement still uses the old snapshot.
              </p>
            )}
            {lockError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{lockError}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
