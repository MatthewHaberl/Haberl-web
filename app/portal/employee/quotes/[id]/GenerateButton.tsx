'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { buildQuoteWorkbook } from '@/lib/solar/export-quote-workbook'
import {
  extractQuoteJson,
  renderQuote,
  renderCustomerQuote,
  isMultiOption,
  type QuoteData,
  type MultiOptionQuoteData,
  type AnyQuoteData,
} from '@/lib/solar/render-quote'
import { DepositSelector } from './DepositSelector'
import { Loader2, Zap, Check, Save, Eye, EyeOff, Bot, Download } from 'lucide-react'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function buildPrompt(request: Record<string, unknown>, nextQuoteNumber: string, includeCompetitive: boolean): string {
  const today = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
  const isAmendment = request.is_amendment as boolean

  const usageBlock = (() => {
    if (request.usage_mode === 'advanced') {
      const rows = MONTHS
        .map((month, index) => request[`monthly_kwh_${month}`] ? `  - ${MONTH_LABELS[index]}: ${request[`monthly_kwh_${month}`]} kWh` : null)
        .filter(Boolean)
        .join('\n')
      const average = request.monthly_kwh ? `\n  - Average: ${request.monthly_kwh} kWh/month` : ''
      return `Monthly breakdown:\n${rows}${average}`
    }

    return `Average monthly usage: ${request.monthly_kwh || 'TBC'} kWh`
  })()

  const photosBlock = (() => {
    const urls = request.photo_urls as string[] | undefined
    if (!urls?.length) return ''
    return `\n\n## SITE PHOTOS\n${urls.map((url, index) => `  Photo ${index + 1}: ${url}`).join('\n')}`
  })()

  const amendmentBlock = isAmendment ? `
## EXISTING SYSTEM (Amendment job)
- Current inverter: ${request.existing_inverter || 'TBC'}
- Current batteries: ${request.existing_batteries || 'TBC'}
- Current panels: ${request.existing_panels || 'TBC'}
- Current monthly usage: ${request.existing_monthly_usage || 'TBC'} kWh
- Current monthly generation: ${request.existing_monthly_gen || 'TBC'} kWh
- Current monthly saving: R${request.existing_monthly_saving || 'TBC'}
- Scope of amendment: ${request.amendment_scope || 'TBC'}

Quote ONLY the new/replacement components. Clearly list what is being retained vs replaced.
` : ''

  const roofDesignBlock = (() => {
    const panelCount = request.design_panel_count as number | undefined
    const kwp = request.design_kwp as number | undefined
    const confirmedAt = request.design_confirmed_at as string | undefined
    if (!panelCount || !kwp || !confirmedAt) return ''

    const segments = request.design_segments as Array<{ azimuth: number; pitch: number; panelCount: number }> | undefined
    const segmentLines = segments?.length
      ? segments.map((segment) => `  - ${segment.panelCount} panels on roof face: azimuth ${segment.azimuth} deg, pitch ${segment.pitch} deg`).join('\n')
      : ''

    return `
## CONFIRMED ROOF DESIGN (use these values exactly - do not resize)
- ${panelCount} x panels = ${kwp} kWp total
${segmentLines}
-> Select inverter and battery to match ${kwp} kWp. Do NOT resize the system based on energy usage - the technician has confirmed this layout fits the physical roof.
`
  })()

  const hasSpecificEquipment = !!(request.inverter_brand || request.battery_brand || request.panel_brand)

  let outputInstruction = ''

  if (!hasSpecificEquipment) {
    outputInstruction = `Generate the default three-option proposal (Premium / Recommended / Budget).
Output a single JSON object in a \`\`\`json code block using the multi-option format:
{ "type": "multi-option", "quoteNumber": "...", "dateIssued": "...", "dateExpires": "...", "customerName": "...", "municipality": "...", "customerPhone": "...", "customerEmail": "...", "siteAddress": "...", "monthlyUsageKwh": "...", "comparisonTable": [...], "options": [{ "tier": "premium", "tierLabel": "Premium", "supplierBom": [...], ... }, { "tier": "recommended", "tierLabel": "Recommended", "recommended": true, "supplierBom": [...], ... }, { "tier": "budget", "tierLabel": "Budget", "supplierBom": [...], ... }] }
Each option carries all QuoteData fields. No other text.`
  } else if (includeCompetitive) {
    outputInstruction = `The customer has specified equipment preferences. Generate a three-option proposal where:
- Recommended: Use the customer's preferred brands exactly.
- Premium: Best premium alternative from your catalogue.
- Budget: Most cost-effective alternative from your catalogue.
Output a single JSON object in a \`\`\`json code block using the multi-option format:
{ "type": "multi-option", "quoteNumber": "...", "dateIssued": "...", "dateExpires": "...", "customerName": "...", "municipality": "...", "customerPhone": "...", "customerEmail": "...", "siteAddress": "...", "monthlyUsageKwh": "...", "comparisonTable": [...], "options": [{ "tier": "premium", "tierLabel": "Premium", "supplierBom": [...], ... }, { "tier": "recommended", "tierLabel": "Recommended", "recommended": true, "supplierBom": [...], ... }, { "tier": "budget", "tierLabel": "Budget", "supplierBom": [...], ... }] }
Each option carries all QuoteData fields. No other text.`
  } else {
    outputInstruction = `The customer has specified equipment preferences - generate a single-option quote matching those preferences exactly.
Output a single JSON object in a \`\`\`json code block using the single-option format (camelCase fields: quoteNumber, customerName, inverterModel, panelCost, depositItems, supplierBom, monthlyGenTable, twentyYearTable, etc.). No other text.`
  }

  return `Today's date: ${today}
Use quote number: ${nextQuoteNumber}
${roofDesignBlock}
Please generate a complete solar ${isAmendment ? 'amendment/upgrade' : 'installation'} quote based on the following site survey:
${amendmentBlock}
## CUSTOMER DETAILS
- Name: ${request.customer_name || 'Unknown'}
- Phone: ${request.customer_phone || 'TBC'}
- Email: ${request.customer_email || 'TBC'}
- Address: ${request.address || 'TBC'}
- Municipality: ${request.municipality || 'TBC'}

## SITE INFORMATION
- Site number: ${request.site_number || 1}
- Grid supply: ${request.grid_supply || 'Single Phase'}
- Roof type: ${request.roof_type || 'TBC'}
- Number of storeys: ${request.storeys || '1'}

## ENERGY USAGE
${usageBlock}

## SYSTEM REQUIREMENTS
- System type: ${request.system_type || 'Hybrid'}
- Battery backup: ${request.battery_hours || 'AI will determine'}
- Essential load during backup: ${request.essential_load || 'TBC'} kW
- Target off-grid percentage: ${request.target_offgrid_pct != null ? `${request.target_offgrid_pct}%` : '100% (full backup)'}
- EV charger required: ${request.ev_charger || 'No'}

## EQUIPMENT PREFERENCES
- Inverter brand: ${request.inverter_brand || 'No preference - AI will recommend'}
- Battery brand: ${request.battery_brand || 'No preference - AI will recommend'}
- Panel brand: ${request.panel_brand || 'No preference - AI will recommend'}

## ADDITIONAL NOTES
${request.notes || 'None'}
${photosBlock}

---

${outputInstruction}`
}

function getDepositSource(quoteData: AnyQuoteData | null) {
  if (!quoteData) return null
  if (!isMultiOption(quoteData)) return quoteData as QuoteData
  const multiQuote = quoteData as MultiOptionQuoteData
  return multiQuote.options.find((option) => option.tier === 'recommended') ?? multiQuote.options[0]
}

function parseQuoteText(text: string) {
  if (!text.trim()) {
    return {
      quoteData: null,
      parseError: '',
      detailedHtml: '',
      customerHtml: '',
      defaultDepositItems: [] as string[],
      parsedQuoteNumber: null as string | null,
    }
  }

  const parsed = extractQuoteJson(text)
  if (!parsed) {
    return {
      quoteData: null,
      parseError: 'Could not parse as JSON - paste the full ```json block from Claude.',
      detailedHtml: '',
      customerHtml: '',
      defaultDepositItems: [] as string[],
      parsedQuoteNumber: null as string | null,
    }
  }

  try {
    const detailedHtml = renderQuote(parsed)
    const customerHtml = renderCustomerQuote(parsed)
    const depositSource = getDepositSource(parsed)

    return {
      quoteData: parsed,
      parseError: '',
      detailedHtml,
      customerHtml,
      defaultDepositItems: depositSource?.depositItems.map((item) => item.name) ?? [],
      parsedQuoteNumber: parsed.quoteNumber ?? null,
    }
  } catch (error) {
    return {
      quoteData: null,
      parseError: `Render error: ${error instanceof Error ? error.message : String(error)}`,
      detailedHtml: '',
      customerHtml: '',
      defaultDepositItems: [] as string[],
      parsedQuoteNumber: null as string | null,
    }
  }
}

function openHtmlPreview(html: string) {
  const preview = window.open('', '_blank')
  if (!preview) return
  preview.document.write(html)
  preview.document.close()
}

interface Props {
  requestId: string
  request: Record<string, unknown>
  existingQuote: string | null
  existingHtml: string | null
  existingDepositItems: string[]
  existingQuoteNumber: string | null
  existingQuoteVersion: 'simplified' | 'detailed'
  nextQuoteNumber: string
  onQuoteDataChange?: (data: AnyQuoteData | null) => void
}

export function GenerateButton({
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
  const initialParsed = parseQuoteText(existingQuote ?? '')

  const [pasted, setPasted] = useState(existingQuote ?? '')
  const [quoteData, setQuoteData] = useState<AnyQuoteData | null>(initialParsed.quoteData)
  const [parseError, setParseError] = useState(initialParsed.parseError)
  const [detailedHtml, setDetailedHtml] = useState(
    initialParsed.detailedHtml || (existingQuoteVersion === 'detailed' ? (existingHtml ?? '') : ''),
  )
  const [customerHtml, setCustomerHtml] = useState(
    initialParsed.customerHtml || (existingQuoteVersion === 'simplified' ? (existingHtml ?? '') : ''),
  )
  const [showPreview, setShowPreview] = useState(!!existingHtml)
  const [depositSelected, setDepositSelected] = useState<string[]>(
    existingDepositItems.length ? existingDepositItems : initialParsed.defaultDepositItems,
  )
  const [quoteNumber, setQuoteNumber] = useState(existingQuoteNumber ?? initialParsed.parsedQuoteNumber ?? nextQuoteNumber)
  const [quoteVersion, setQuoteVersion] = useState<'simplified' | 'detailed'>(existingQuoteVersion ?? 'simplified')
  const hasSpecificEquipment = !!(request.inverter_brand || request.battery_brand || request.panel_brand)
  const [includeCompetitive, setIncludeCompetitive] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(!!existingHtml || !!existingQuote)
  const [saveError, setSaveError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const previewHtml = quoteVersion === 'detailed' ? detailedHtml : customerHtml

  const tryParse = useCallback((text: string) => {
    const parsed = parseQuoteText(text)
    setQuoteData(parsed.quoteData)
    setParseError(parsed.parseError)
    setDetailedHtml(parsed.detailedHtml)
    setCustomerHtml(parsed.customerHtml)

    if (parsed.defaultDepositItems.length && !depositSelected.length) {
      setDepositSelected(parsed.defaultDepositItems)
    }

    if (parsed.parsedQuoteNumber && !existingQuoteNumber) {
      setQuoteNumber(parsed.parsedQuoteNumber)
    }
  }, [depositSelected.length, existingQuoteNumber])

  function handlePasteChange(text: string) {
    setPasted(text)
    setSaved(false)
    tryParse(text)
  }

  useEffect(() => {
    onQuoteDataChange?.(quoteData)
  }, [onQuoteDataChange, quoteData])

  async function handleAutoGenerate() {
    setGenerating(true)
    setGenError('')
    setPasted('')
    setSaved(false)
    setQuoteData(null)
    setDetailedHtml('')
    setCustomerHtml('')
    onQuoteDataChange?.(null)

    try {
      const response = await fetch('/api/generate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, next_quote_number: quoteNumber, include_competitive: includeCompetitive }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setPasted(accumulated)
      }
    } catch (error) {
      setGenError(error instanceof Error ? error.message : 'Auto-generate failed. Check ANTHROPIC_API_KEY in .env.local.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(buildPrompt(request, quoteNumber, includeCompetitive))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleSave() {
    if (!pasted.trim() && !previewHtml) return

    setSaving(true)
    setSaveError('')

    try {
      const supabase = createClient()
      const depositSource = getDepositSource(quoteData)

      const depositAmountCents = depositSource?.depositItems?.length
        ? Math.round(
            depositSource.depositItems
              .filter((item) => depositSelected.includes(item.name))
              .reduce((sum, item) => sum + item.amountRands, 0) * 100,
          )
        : null

      const totalAmountCents = depositSource?.quoteTotalRands
        ? Math.round(depositSource.quoteTotalRands * 100)
        : null

      const htmlToSave = quoteVersion === 'detailed' ? detailedHtml : customerHtml

      const { error } = await supabase
        .from('quote_requests')
        .update({
          quote_html: htmlToSave || null,
          quote_number: quoteNumber || null,
          quote_version: quoteVersion,
          deposit_items: depositSelected,
          deposit_amount: depositAmountCents,
          total_amount: totalAmountCents,
          generated_quote: pasted.trim() || null,
          generated_at: new Date().toISOString(),
          status: 'generated',
        })
        .eq('id', requestId)

      if (error) throw error
      setSaved(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Save failed - please try again')
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

  const hasOutput = !!previewHtml || !!pasted.trim()
  const depositSource = getDepositSource(quoteData)

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
          className="h-7 w-36 rounded border border-border bg-background px-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        />

        <Button
          variant="accent"
          onClick={handleAutoGenerate}
          disabled={generating}
          className="ml-auto"
          title="Calls the Anthropic API directly - requires ANTHROPIC_API_KEY in .env.local"
        >
          {generating
            ? <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
            : <><Bot className="h-4 w-4" />Auto-generate</>}
        </Button>

        <Button variant="outline" onClick={handleCopyPrompt} title="Copy prompt to paste into Claude manually">
          {copied
            ? <><Check className="h-4 w-4" />Copied!</>
            : <><Zap className="h-4 w-4" />Copy Prompt</>}
        </Button>
      </div>

      {hasSpecificEquipment && (
        <label className="flex items-center gap-2.5 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={includeCompetitive}
            onChange={(event) => setIncludeCompetitive(event.target.checked)}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          <span className="text-sm text-foreground">Include competitive quotes</span>
          <span className="text-xs text-muted-foreground">
            (customer brand stays Recommended, AI picks Premium and Budget)
          </span>
        </label>
      )}

      {genError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
          {genError}
        </p>
      )}

      <div className="border-t border-border" />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          {generating ? 'Streaming response...' : 'JSON output'}
        </p>
        {!generating && (
          <p className="text-sm text-muted-foreground">
            Auto-generate fills this automatically. Or paste the <code className="text-xs bg-muted px-1 py-0.5 rounded">```json</code> block from Claude manually.
          </p>
        )}
        <textarea
          value={pasted}
          onChange={(event) => handlePasteChange(event.target.value)}
          placeholder="Paste Claude's JSON output here..."
          rows={pasted ? 10 : 5}
          className="flex w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
        />
        {parseError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{parseError}</p>
        )}
        {quoteData && !parseError && (
          <p className="text-xs text-success flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            JSON parsed - {quoteData.quoteNumber}{isMultiOption(quoteData) ? ' · 3-option proposal' : ` · ${(quoteData as QuoteData).quoteTotal}`}
          </p>
        )}
      </div>

      {previewHtml && (
        <>
          <div className="border-t border-border" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-foreground">Step 3 - Review quote</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose which version should be saved into the customer portal.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setShowPreview((state) => !state)}
              >
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
              <p className="text-xs text-muted-foreground">
                Simplified is the default customer summary. Detailed keeps the BOM-heavy version visible in the portal.
              </p>
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

      {hasOutput && (
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
                <span className="text-sm text-success flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> Saved
                </span>
              )}
              {quoteData && (
                <Button variant="outline" size="sm" type="button" onClick={handleDownloadWorkbook}>
                  <Download className="h-4 w-4" /> Export supplier BOM (.xlsx)
                </Button>
              )}
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
              <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{saveError}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
