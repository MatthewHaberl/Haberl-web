'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { extractQuoteJson, renderQuote, renderCustomerQuote, isMultiOption, type QuoteData, type MultiOptionQuoteData, type AnyQuoteData } from '@/lib/solar/render-quote'
import { DepositSelector } from './DepositSelector'
import { Loader2, Zap, Copy, Check, Save, Eye, EyeOff } from 'lucide-react'

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Prompt builder ─────────────────────────────────────────────────────────────
function buildPrompt(r: Record<string, unknown>, nextQuoteNumber: string): string {
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

  return `Today's date: ${today}
Use quote number: ${nextQuoteNumber}

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

Output a single JSON object in a \`\`\`json code block using the web app JSON format from your instructions (camelCase fields: quoteNumber, customerName, inverterModel, panelCost, depositItems, monthlyGenTable, twentyYearTable, etc.). No other text.`
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
}

export function GenerateButton({
  requestId,
  request,
  existingQuote,
  existingHtml,
  existingDepositItems,
  existingQuoteNumber,
  nextQuoteNumber,
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

  // UI state
  const [copied,    setCopied]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(!!existingHtml || !!existingQuote)
  const [saveError, setSaveError] = useState('')

  // ── Parse JSON from pasted text ──────────────────────────────────────────────
  const tryParse = useCallback((text: string) => {
    if (!text.trim()) { setQuoteData(null); setParseError(''); setRenderedHtml(''); return }
    const parsed = extractQuoteJson(text)
    if (parsed) {
      setQuoteData(parsed)
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

  // ── Copy prompt ──────────────────────────────────────────────────────────────
  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(buildPrompt(request, quoteNumber))
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

      {/* Step 1 — Copy prompt */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-foreground">Step 1 — Copy the prompt</p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Quote #</label>
            <input
              type="text"
              value={quoteNumber}
              onChange={(e) => setQuoteNumber(e.target.value)}
              className="h-7 w-36 rounded border border-border bg-background px-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste into Claude Code or claude.ai. Claude will output a JSON quote — paste it back below.
        </p>
        <Button variant="accent" onClick={handleCopyPrompt} className="self-start">
          {copied
            ? <><Check className="h-4 w-4" />Copied!</>
            : <><Zap className="h-4 w-4" />Copy Prompt</>}
        </Button>
      </div>

      <div className="border-t border-border" />

      {/* Step 2 — Paste JSON */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Step 2 — Paste Claude&apos;s output</p>
        <p className="text-sm text-muted-foreground">
          Claude will output a <code className="text-xs bg-muted px-1 py-0.5 rounded">```json</code> block — paste the entire response here.
        </p>
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
