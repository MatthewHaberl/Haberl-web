'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { extractQuoteJson, renderQuote, renderCustomerQuote, isMultiOption, type QuoteData, type MultiOptionQuoteData, type AnyQuoteData } from '@/lib/solar/render-quote'
import { DepositSelector } from './DepositSelector'
import { Loader2, Zap, Copy, Check, Save, Eye, EyeOff, Bot } from 'lucide-react'

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Prompt builder ─────────────────────────────────────────────────────────────
function buildPrompt(r: Record<string, unknown>, nextQuoteNumber: string, includeCompetitive: boolean): string {
  const today = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
  const isAmendment = r.is_amendment as boolean

  const usageBlock = (() => {
    if (r.usage_mode === 'advanced') {
      const rows = MONTHS
        .map((m, i) => r[`monthly_kwh_${m}`] ? `  - ${MONTH_LABELS[i]}: ${r[`monthly_kwh_${m}`]} kWh` : null)
        .filter(Boolean).join('\n')
      const avg = r.monthly_kwh ? `\n  - Average: ${r.monthly_kwh} kWh/month` : ''
      return `Monthly breakdown:\n${rows}${avg}`
    }
    return `Average monthly usage: ${r.monthly_kwh || 'TBC'} kWh`
  })()

  const photosBlock = (() => {
    const urls = r.photo_urls as string[] | undefined
    if (!urls?.length) return ''
    return `\n\n## SITE PHOTOS\n${urls.map((u, i) => `  Photo ${i + 1}: ${u}`).join('\n')}`
  })()

  const amendmentBlock = isAmendment ? `
## EXISTING SYSTEM (Amendment job)
- Current inverter: ${r.existing_inverter || 'TBC'}
- Current batteries: ${r.existing_batteries || 'TBC'}
- Current panels: ${r.existing_panels || 'TBC'}
- Current monthly usage: ${r.existing_monthly_usage || 'TBC'} kWh
- Current monthly generation: ${r.existing_monthly_gen || 'TBC'} kWh
- Current monthly saving: R${r.existing_monthly_saving || 'TBC'}
- Scope of amendment: ${r.amendment_scope || 'TBC'}

Quote ONLY the new/replacement components. Clearly list what is being retained vs replaced.
` : ''

  // Confirmed roof design — overrides Claude's own system sizing
  const roofDesignBlock = (() => {
    const panelCount = r.design_panel_count as number | undefined
    const kwp = r.design_kwp as number | undefined
    const confirmedAt = r.design_confirmed_at as string | undefined
    if (!panelCount || !kwp || !confirmedAt) return ''

    const segs = r.design_segments as Array<{ azimuth: number; pitch: number; panelCount: number }> | undefined
    const segLines = segs?.length
      ? segs.map(s => `  - ${s.panelCount} panels on roof face: azimuth ${s.azimuth}°, pitch ${s.pitch}°`).join('\n')
      : ''

    return `
## CONFIRMED ROOF DESIGN (use these values exactly — do not resize)
- ${panelCount} × panels = ${kwp} kWp total
${segLines}
→ Select inverter and battery to match ${kwp} kWp. Do NOT resize the system based on energy usage — the technician has confirmed this layout fits the physical roof.
`
  })()

  const hasSpecificEquipment = !!(r.inverter_brand || r.battery_brand || r.panel_brand)

  let outputInstruction: string
  if (!hasSpecificEquipment) {
    // No brand preference — default 3-tier
    outputInstruction = `Generate the DEFAULT THREE-OPTION proposal (Premium ★★★ / Recommended ★★☆ / Budget ★☆☆).
Output a single JSON object in a \`\`\`json code block using the multi-option format:
{ "type": "multi-option", "quoteNumber": "...", "dateIssued": "...", "dateExpires": "...", "customerName": "...", "municipality": "...", "customerPhone": "...", "customerEmail": "...", "siteAddress": "...", "monthlyUsageKwh": "...", "comparisonTable": [...], "options": [{ "tier": "premium", "tierLabel": "★★★ Premium", ... }, { "tier": "recommended", "tierLabel": "★★☆ Recommended", "recommended": true, ... }, { "tier": "budget", "tierLabel": "★☆☆ Budget", ... }] }
Each option carries all QuoteData fields. No other text.`
  } else if (includeCompetitive) {
    // Brand specified + competitive quotes requested — anchor Recommended to their brand
    outputInstruction = `The customer has specified equipment preferences. Generate a THREE-OPTION proposal where:
- Recommended (★★☆): Use the customer's preferred brands exactly.
- Premium (★★★): Best premium alternative from your catalogue (ignore their brand preference for this tier).
- Budget (★☆☆): Most cost-effective alternative from your catalogue (ignore their brand preference for this tier).
Output a single JSON object in a \`\`\`json code block using the multi-option format:
{ "type": "multi-option", "quoteNumber": "...", "dateIssued": "...", "dateExpires": "...", "customerName": "...", "municipality": "...", "customerPhone": "...", "customerEmail": "...", "siteAddress": "...", "monthlyUsageKwh": "...", "comparisonTable": [...], "options": [{ "tier": "premium", "tierLabel": "★★★ Premium", ... }, { "tier": "recommended", "tierLabel": "★★☆ Recommended", "recommended": true, ... }, { "tier": "budget", "tierLabel": "★☆☆ Budget", ... }] }
Each option carries all QuoteData fields. No other text.`
  } else {
    // Brand specified, single option
    outputInstruction = `The customer has specified equipment preferences — generate a SINGLE-OPTION quote matching those preferences exactly.
Output a single JSON object in a \`\`\`json code block using the single-option format (camelCase fields: quoteNumber, customerName, inverterModel, panelCost, depositItems, monthlyGenTable, twentyYearTable, etc.). No other text.`
  }

  return `Today's date: ${today}
Use quote number: ${nextQuoteNumber}
${roofDesignBlock}
Please generate a complete solar ${isAmendment ? 'amendment/upgrade' : 'installation'} quote based on the following site survey:
${amendmentBlock}
## CUSTOMER DETAILS
- Name: ${r.customer_name || 'Unknown'}
- Phone: ${r.customer_phone || 'TBC'}
- Email: ${r.customer_email || 'TBC'}
- Address: ${r.address || 'TBC'}
- Municipality: ${r.municipality || 'TBC'}

## SITE INFORMATION
- Grid supply: ${r.grid_supply || 'Single Phase'}
- Roof type: ${r.roof_type || 'TBC'}
- Number of storeys: ${r.storeys || '1'}

## ENERGY USAGE
${usageBlock}

## SYSTEM REQUIREMENTS
- System type: ${r.system_type || 'Hybrid'}
- Battery backup: ${r.battery_hours || 'AI will determine'}
- Essential load during backup: ${r.essential_load || 'TBC'} kW
- Target off-grid percentage: ${r.target_offgrid_pct != null ? `${r.target_offgrid_pct}%` : '100% (full backup)'}
- EV charger required: ${r.ev_charger || 'No'}

## EQUIPMENT PREFERENCES
- Inverter brand: ${r.inverter_brand || 'No preference — AI will recommend'}
- Battery brand: ${r.battery_brand || 'No preference — AI will recommend'}
- Panel brand: ${r.panel_brand || 'No preference — AI will recommend'}

## ADDITIONAL NOTES
${r.notes || 'None'}
${photosBlock}

---

${outputInstruction}`
}

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  requestId: string
  request: Record<string, unknown>
  existingQuote: string | null
  existingHtml: string | null
  existingDepositItems: string[]
  existingQuoteNumber: string | null
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
  nextQuoteNumber,
  onQuoteDataChange,
}: Props) {
  // Raw paste state
  const [pasted,    setPasted]    = useState(existingQuote ?? '')

  // Parsed JSON state
  const [quoteData, setQuoteData] = useState<AnyQuoteData | null>(null)
  const [parseError,setParseError]= useState('')

  // Rendered HTML
  const [renderedHtml, setRenderedHtml] = useState<string>(existingHtml ?? '')
  const [showPreview,  setShowPreview]  = useState(!!existingHtml)

  // Deposit items
  const [depositSelected, setDepositSelected] = useState<string[]>(existingDepositItems)

  // Quote number (editable)
  const [quoteNumber, setQuoteNumber] = useState(existingQuoteNumber ?? nextQuoteNumber)

  // Competitive quotes toggle (only relevant when a brand preference is set)
  const hasSpecificEquipment = !!(request.inverter_brand || request.battery_brand || request.panel_brand)
  const [includeCompetitive, setIncludeCompetitive] = useState(false)

  // UI state
  const [copied,     setCopied]     = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(!!existingHtml || !!existingQuote)
  const [saveError,  setSaveError]  = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError]   = useState('')
  // ── Parse JSON from pasted text ──────────────────────────────────────────────
  const tryParse = useCallback((text: string) => {
    if (!text.trim()) { setQuoteData(null); setParseError(''); setRenderedHtml(''); onQuoteDataChange?.(null); return }
    const parsed = extractQuoteJson(text)
    if (parsed) {
      setQuoteData(parsed)
      onQuoteDataChange?.(parsed)
      setParseError('')
      try {
        setRenderedHtml(renderQuote(parsed))
      } catch (err) {
        setParseError(`Render error: ${err instanceof Error ? err.message : String(err)}`)
        setRenderedHtml('')
        return
      }
      // For multi-option: use recommended option's deposit items as default
      const depositSrc = isMultiOption(parsed)
        ? (parsed as MultiOptionQuoteData).options.find(o => o.tier === 'recommended') ?? (parsed as MultiOptionQuoteData).options[0]
        : parsed as QuoteData
      if (depositSrc?.depositItems?.length && !depositSelected.length) {
        setDepositSelected(depositSrc.depositItems.map((i) => i.name))
      }
      if (parsed.quoteNumber && !existingQuoteNumber) {
        setQuoteNumber(parsed.quoteNumber)
      }
    } else {
      setQuoteData(null)
      setParseError('Could not parse as JSON — paste the full ```json block from Claude.')
      setRenderedHtml('')
    }
  }, [depositSelected.length, existingQuoteNumber])

  function handlePasteChange(text: string) {
    setPasted(text)
    setSaved(false)
    tryParse(text)
  }

  // ── Auto-render existing raw JSON on mount ───────────────────────────────────
  // Re-runs the renderer on page load so saved quotes with stale HTML are always
  // shown with the current template (user just needs to Save to persist the update).
  useEffect(() => {
    if (pasted) tryParse(pasted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-generate (calls API directly when ANTHROPIC_API_KEY is set) ─────────
  async function handleAutoGenerate() {
    setGenerating(true)
    setGenError('')
    setPasted('')
    setSaved(false)
    setQuoteData(null)
    setRenderedHtml('')
    onQuoteDataChange?.(null)

    try {
      const res = await fetch('/api/generate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, next_quote_number: quoteNumber, include_competitive: includeCompetitive }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setPasted(accumulated)
      }

      tryParse(accumulated)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Auto-generate failed. Check ANTHROPIC_API_KEY in .env.local.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Copy prompt ──────────────────────────────────────────────────────────────
  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(buildPrompt(request, quoteNumber, includeCompetitive))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!pasted.trim() && !renderedHtml) return
    setSaving(true)
    setSaveError('')
    try {
      const supabase = createClient()

      // For deposit calc: use recommended option for multi-option, or the single quote
      const singleQuote = quoteData && !isMultiOption(quoteData) ? quoteData as QuoteData : null
      const multiRec = quoteData && isMultiOption(quoteData)
        ? (quoteData as MultiOptionQuoteData).options.find(o => o.tier === 'recommended') ?? (quoteData as MultiOptionQuoteData).options[0]
        : null
      const depositSource = singleQuote ?? multiRec

      const depositAmountCents = depositSource?.depositItems?.length
        ? Math.round(
            depositSource.depositItems
              .filter((i) => depositSelected.includes(i.name))
              .reduce((sum, i) => sum + i.amountRands, 0) * 100
          )
        : null

      const totalAmountCents = depositSource?.quoteTotalRands
        ? Math.round(depositSource.quoteTotalRands * 100)
        : null

      const { error } = await supabase.from('quote_requests').update({
        // v2 fields (structured)
        quote_html:     renderedHtml || null,
        quote_number:   quoteNumber  || null,
        quote_version:  'simplified',
        deposit_items:  depositSelected,
        deposit_amount: depositAmountCents,
        total_amount:   totalAmountCents,
        // v1 field (raw paste — keep for backward compat)
        generated_quote: pasted.trim() || null,
        generated_at:    new Date().toISOString(),
        status:          'generated',
      }).eq('id', requestId)

      if (error) throw error
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed — please try again')
    } finally {
      setSaving(false)
    }
  }

  const hasOutput = !!renderedHtml || !!pasted.trim()

  return (
    <div className="flex flex-col gap-6">

      {/* Quote number row */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-foreground">Quote #</label>
        <input
          type="text"
          value={quoteNumber}
          onChange={(e) => setQuoteNumber(e.target.value)}
          className="h-7 w-36 rounded border border-border bg-background px-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        />

        {/* Auto-generate button — primary action when API key is set */}
        <Button
          variant="accent"
          onClick={handleAutoGenerate}
          disabled={generating}
          className="ml-auto"
          title="Calls the Anthropic API directly — requires ANTHROPIC_API_KEY in .env.local"
        >
          {generating
            ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
            : <><Bot className="h-4 w-4" />Auto-generate</>}
        </Button>

        {/* Manual copy — fallback when no API key */}
        <Button variant="outline" onClick={handleCopyPrompt} title="Copy prompt to paste into Claude manually">
          {copied
            ? <><Check className="h-4 w-4" />Copied!</>
            : <><Zap className="h-4 w-4" />Copy Prompt</>}
        </Button>
      </div>

      {/* Competitive quotes toggle — only shown when a brand preference is set */}
      {hasSpecificEquipment && (
        <label className="flex items-center gap-2.5 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={includeCompetitive}
            onChange={(e) => setIncludeCompetitive(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          <span className="text-sm text-foreground">
            Include competitive quotes
          </span>
          <span className="text-xs text-muted-foreground">
            (customer&apos;s brand as Recommended, AI picks Premium &amp; Budget)
          </span>
        </label>
      )}

      {genError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
          {genError}
        </p>
      )}

      <div className="border-t border-border" />

      {/* Paste area (used by Auto-generate streaming output + manual paste) */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          {generating ? 'Streaming response…' : 'JSON output'}
        </p>
        {!generating && (
          <p className="text-sm text-muted-foreground">
            Auto-generate fills this automatically. Or paste the <code className="text-xs bg-muted px-1 py-0.5 rounded">```json</code> block from Claude manually.
          </p>
        )}
        <textarea
          value={pasted}
          onChange={(e) => handlePasteChange(e.target.value)}
          placeholder="Paste Claude's JSON output here…"
          rows={pasted ? 10 : 5}
          className="flex w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
        />
        {parseError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{parseError}</p>
        )}
        {quoteData && !parseError && (
          <p className="text-xs text-success flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            JSON parsed — {quoteData.quoteNumber}{isMultiOption(quoteData) ? ' · 3-option proposal' : ` · ${(quoteData as QuoteData).quoteTotal}`}
          </p>
        )}
      </div>

      {/* Step 3 — Preview & Deposit (shown after JSON parsed) */}
      {renderedHtml && (
        <>
          <div className="border-t border-border" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Step 3 — Review quote</p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setShowPreview((s) => !s)}
              >
                {showPreview
                  ? <><EyeOff className="h-3.5 w-3.5" />Hide preview</>
                  : <><Eye className="h-3.5 w-3.5" />Show preview</>}
              </Button>
            </div>

            {showPreview && (
              <iframe
                srcDoc={renderedHtml}
                title="Quote preview"
                className="w-full rounded-lg border border-border"
                style={{ height: '700px' }}
                sandbox="allow-same-origin"
              />
            )}

            {/* Deposit items — for single-option or from recommended option */}
            {(() => {
              const depositSrc = quoteData && !isMultiOption(quoteData)
                ? quoteData as QuoteData
                : quoteData && isMultiOption(quoteData)
                  ? ((quoteData as MultiOptionQuoteData).options.find(o => o.tier === 'recommended') ?? (quoteData as MultiOptionQuoteData).options[0])
                  : null
              if (!depositSrc?.depositItems?.length) return null
              return (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium text-foreground">
                    Deposit items{isMultiOption(quoteData!) ? ' (from Recommended option)' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">Choose which items require an upfront deposit.</p>
                  <DepositSelector
                    items={depositSrc.depositItems}
                    selected={depositSelected}
                    quoteTotalRands={depositSrc.quoteTotalRands}
                    onChange={setDepositSelected}
                  />
                </div>
              )
            })()}
          </div>
        </>
      )}

      {/* Step 4 — Save */}
      {hasOutput && (
        <>
          <div className="border-t border-border" />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="default" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                  : <><Save className="h-4 w-4" />Save Quote</>}
              </Button>
              {saved && !saveError && (
                <span className="text-sm text-success flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> Saved
                </span>
              )}
              {renderedHtml && saved && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => {
                      const w = window.open('', '_blank')
                      if (w) { w.document.write(renderedHtml); w.document.close() }
                    }}
                  >
                    Open detailed BOM (print)
                  </Button>
                  {quoteData && (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => {
                        const customerHtml = renderCustomerQuote(quoteData)
                        const w = window.open('', '_blank')
                        if (w) { w.document.write(customerHtml); w.document.close() }
                      }}
                    >
                      Open simplified (customer)
                    </Button>
                  )}
                </>
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
