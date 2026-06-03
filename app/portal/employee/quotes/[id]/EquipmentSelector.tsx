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
  estimateTargetInverterKw,
  getTariffRateForMunicipality,
  MARKUP,
  type EquipmentCatalogItem,
  type EquipmentCatalogPhase,
  type QuoteTierConfig,
} from '@/lib/solar/quote-calculator'
import { DepositSelector } from './DepositSelector'
import { AlertTriangle, Check, Download, Eye, EyeOff, Loader2, Save, WandSparkles } from 'lucide-react'

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

function getStoreysPremium(storeys: unknown) {
  void storeys
  return 0
}

function formatCatalogError(message: string) {
  if (message.includes('public.equipment_catalog')) {
    return 'Quote calculator setup is incomplete: Supabase table public.equipment_catalog is missing. Run migrations 006-008 and seed the catalog, then refresh. You can still use AI Override below.'
  }

  if (message.includes('public.quote_tier_configs')) {
    return 'Quote calculator setup is incomplete: Supabase table public.quote_tier_configs is missing. Run migrations 007-008, then refresh.'
  }

  return message
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
  const supabase = createClient()

  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([])
  const [tierConfigs, setTierConfigs] = useState<QuoteTierConfig[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [inverterId, setInverterId] = useState<string>(toOptionalString(request.selected_inverter_id))
  const [batteryId, setBatteryId] = useState<string>(toOptionalString(request.selected_battery_id))
  const [panelId, setPanelId] = useState<string>(toOptionalString(request.selected_panel_id))
  const [cableRouteM, setCableRouteM] = useState<string>(String(request.cable_route_m ?? 15))
  const [tariffRate, setTariffRate] = useState<string>(
    request.municipality ? String(getTariffRateForMunicipality(String(request.municipality))) : '2.65',
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

  const phase = getPhase(request.grid_supply)
  const targetKw = estimateTargetInverterKw(
    Number(request.monthly_kwh ?? 0),
    Number(request.essential_load ?? 0),
  )
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

    }

    void loadCatalog()
    return () => { active = false }
  }, [hasPersistedSelection, hasSpecificPreferences, phase, supabase, targetKw])

  const preferredInverterBrand = isSpecificBrand(request.inverter_brand) ? String(request.inverter_brand) : null
  const preferredBatteryBrand = isSpecificBrand(request.battery_brand) ? String(request.battery_brand) : null
  const preferredPanelBrand = isSpecificBrand(request.panel_brand) ? String(request.panel_brand) : null

  const inverterOptions = useMemo(
    () => catalog.filter((item) =>
      item.category === 'inverter' &&
      item.active &&
      (item.phase === phase || item.phase === 'any') &&
      brandMatchesPreference(item.brand, preferredInverterBrand),
    ),
    [catalog, phase, preferredInverterBrand],
  )

  const batteryOptions = useMemo(
    () => catalog.filter((item) =>
      item.category === 'battery' &&
      item.active &&
      brandMatchesPreference(item.brand, preferredBatteryBrand),
    ),
    [catalog, preferredBatteryBrand],
  )

  const panelOptions = useMemo(
    () => catalog.filter((item) =>
      item.category === 'panel' &&
      item.active &&
      brandMatchesPreference(item.brand, preferredPanelBrand),
    ),
    [catalog, preferredPanelBrand],
  )

  const effectiveInverterId = inverterOptions.some((item) => item.id === inverterId) ? inverterId : (inverterOptions[0]?.id ?? '')
  const effectiveBatteryId = batteryOptions.some((item) => item.id === batteryId) ? batteryId : (batteryOptions[0]?.id ?? '')
  const effectivePanelId = panelOptions.some((item) => item.id === panelId) ? panelId : (panelOptions[0]?.id ?? '')

  const selectedInverter = inverterOptions.find((item) => item.id === effectiveInverterId) ?? catalog.find((item) => item.id === effectiveInverterId) ?? null
  const selectedBattery = batteryOptions.find((item) => item.id === effectiveBatteryId) ?? catalog.find((item) => item.id === effectiveBatteryId) ?? null
  const selectedPanel = panelOptions.find((item) => item.id === effectivePanelId) ?? catalog.find((item) => item.id === effectivePanelId) ?? null
  const previewHtml = quoteVersion === 'detailed' ? detailedHtml : customerHtml
  const depositSource = getDepositSource(quoteData)
  const defaultWarning = Number(cableRouteM || 0) === 15
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
          quote_number: quoteNumber || null,
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
          storeys_premium_rands: getStoreysPremium(request.storeys),
        })
        .eq('id', requestId)

      if (error) throw error
      setSaved(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
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
    return `${item.description} - ${formatRands(item.cost_rands * MARKUP)}`
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
          {preferredInverterBrand && <span className="text-xs text-muted-foreground">Filtered to {preferredInverterBrand}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Battery</span>
          <select
            value={effectiveBatteryId}
            onChange={(event) => {
              setBatteryId(event.target.value)
              setSaved(false)
            }}
            className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          >
            {batteryOptions.map((item) => (
              <option key={item.id} value={item.id}>{optionLabel(item)}</option>
            ))}
          </select>
          {preferredBatteryBrand && <span className="text-xs text-muted-foreground">Filtered to {preferredBatteryBrand}</span>}
        </label>

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
          {preferredPanelBrand && <span className="text-xs text-muted-foreground">Filtered to {preferredPanelBrand}</span>}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Cable route (m)</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={cableRouteM}
            onChange={(event) => {
              setCableRouteM(event.target.value)
              setSaved(false)
            }}
            className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          />
          {defaultWarning && (
            <span className="flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Still on the default 15m route. Update if the site needs more.
            </span>
          )}
        </label>

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
          Target bracket: about {targetKw}kW {phase}-phase
        </span>
      </div>

      {calcError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{calcError}</p>
      )}

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
          </div>
        </>
      )}
    </div>
  )
}
