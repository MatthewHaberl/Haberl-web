'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Zap, Copy, Check, Save, ClipboardPaste } from 'lucide-react'

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Prompt builder ────────────────────────────────────────────
function buildPrompt(r: Record<string, unknown>): string {
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
    return `\n\n## SITE PHOTOS\nThe following photos have been uploaded by the technician. Reference them for cable routing, DB board layout, shading analysis, and panel placement:\n${urls.map((u, i) => `  Photo ${i + 1}: ${u}`).join('\n')}`
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

Quote ONLY the new/replacement components. Clearly list what is being retained vs replaced. Explain the impact on system performance.
` : ''

  return `Today's date: ${today}

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

Please generate a complete, itemised quote following the standard Haberl quote format. Include all required components, run all validation checks, and calculate the 5-year ROI estimate. State all assumptions clearly.`
}

// ── Component ─────────────────────────────────────────────────
interface Props {
  requestId: string
  request: Record<string, unknown>
  existingQuote: string | null
}

export function GenerateButton({ requestId, request, existingQuote }: Props) {
  const [pasted,     setPasted]     = useState(existingQuote ?? '')
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(!!existingQuote)
  const [copied,     setCopied]     = useState(false)
  const [quoteCopied,setQuoteCopied]= useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(buildPrompt(request))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleCopyQuote() {
    await navigator.clipboard.writeText(pasted)
    setQuoteCopied(true)
    setTimeout(() => setQuoteCopied(false), 2000)
  }

  async function handleSave() {
    if (!pasted.trim()) return
    setSaving(true)
    try {
      const supabase = createClient()
      await supabase.from('quote_requests').update({
        generated_quote: pasted.trim(),
        generated_at:    new Date().toISOString(),
        status:          'generated',
      }).eq('id', requestId)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Step 1 — Copy the prompt</p>
        <p className="text-sm text-muted-foreground">
          Paste into Claude Code or claude.ai. If there are site photos, attach them to claude.ai alongside the prompt.
        </p>
        <Button variant="accent" onClick={handleCopyPrompt} className="self-start">
          {copied
            ? <><Check className="h-4 w-4" />Copied!</>
            : <><Zap className="h-4 w-4" />Copy Prompt</>}
        </Button>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Step 2 — Paste the generated quote</p>
        <p className="text-sm text-muted-foreground">Copy the output from Claude and paste it below, then save.</p>
        <textarea
          ref={textareaRef}
          value={pasted}
          onChange={(e) => { setPasted(e.target.value); setSaved(false) }}
          placeholder="Paste the quote from Claude here…"
          rows={pasted ? 20 : 6}
          className="flex w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="default" onClick={handleSave} disabled={saving || !pasted.trim()}>
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              : <><Save className="h-4 w-4" />Save Quote</>}
          </Button>
          {saved && (
            <span className="text-sm text-success flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {pasted && !saving && (
            <Button variant="outline" size="sm" onClick={handleCopyQuote}>
              {quoteCopied
                ? <><Check className="h-3.5 w-3.5 text-success" />Copied!</>
                : <><ClipboardPaste className="h-3.5 w-3.5" />Copy quote</>}
            </Button>
          )}
        </div>
      </div>

      {saved && pasted && (
        <>
          <div className="border-t border-border" />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-success">Quote saved ✓</p>
            <Card>
              <CardContent className="pt-4 pb-4">
                <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">{pasted}</pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
