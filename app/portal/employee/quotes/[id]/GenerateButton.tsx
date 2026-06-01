'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { Copy, Check, Save, Loader2, ClipboardPaste } from 'lucide-react'

interface Props {
  requestId: string
  survey: Record<string, string>
  existingQuote: string | null
}

function buildPrompt(s: Record<string, string>): string {
  const today = new Date().toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return `Today's date: ${today}

Please generate a complete solar installation quote based on the following site survey:

**CUSTOMER DETAILS**
- Name: ${s.customerName || 'Unknown'}
- Phone: ${s.customerPhone || 'TBC'}
- Email: ${s.customerEmail || 'TBC'}
- Address: ${s.address || 'TBC'}
- Municipality: ${s.municipality || 'TBC'}

**SITE INFORMATION**
- Grid supply: ${s.gridSupply || 'Single Phase'}
- Roof type: ${s.roofType || 'TBC'}
- Number of storeys: ${s.storeys || '1'}
- Average monthly kWh usage: ${s.monthlyKwh || 'TBC'} kWh

**SYSTEM REQUIREMENTS**
- System type: ${s.systemType || 'Hybrid'}
- Battery backup required: ${s.batteryHours || '4'} hours
- Essential load during backup: ${s.essentialLoad || '3'} kW
- EV charger required: ${s.evCharger || 'No'}
- Equipment preference: ${s.equipmentPreference || 'Any — recommend best value'}

**ADDITIONAL NOTES**
${s.notes || 'None'}

---

Please generate a complete, itemised quote following the standard Haberl quote format. Include all required components, run all validation checks, and calculate the 5-year ROI estimate. State all assumptions clearly.`
}

export function GenerateButton({ requestId, survey, existingQuote }: Props) {
  const [pasted, setPasted] = useState(existingQuote ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(!!existingQuote)
  const [copied, setCopied] = useState(false)
  const [quoteCopied, setQuoteCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(buildPrompt(survey))
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
      await supabase
        .from('quote_requests')
        .update({
          generated_quote: pasted.trim(),
          generated_at: new Date().toISOString(),
          status: 'generated',
        })
        .eq('id', requestId)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Step 1 — Copy prompt */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          Step 1 — Copy the prompt
        </p>
        <p className="text-sm text-muted-foreground">
          Paste it into Claude Code or claude.ai and let the solar agent generate the quote.
        </p>
        <Button
          variant="accent"
          onClick={handleCopyPrompt}
          className="self-start"
        >
          {copied
            ? <><Check className="h-4 w-4" />Copied!</>
            : <><Copy className="h-4 w-4" />Copy Prompt</>}
        </Button>
      </div>

      <div className="border-t border-border" />

      {/* Step 2 — Paste result */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          Step 2 — Paste the generated quote
        </p>
        <p className="text-sm text-muted-foreground">
          Copy the output from Claude and paste it below, then save.
        </p>
        <textarea
          ref={textareaRef}
          value={pasted}
          onChange={(e) => { setPasted(e.target.value); setSaved(false) }}
          placeholder="Paste the quote from Claude here…"
          rows={pasted ? 20 : 6}
          className="flex w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="default"
            onClick={handleSave}
            disabled={saving || !pasted.trim()}
          >
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

      {/* Saved quote display (read-only, non-edit view) */}
      {saved && pasted && (
        <>
          <div className="border-t border-border" />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-success">Quote saved ✓</p>
            <Card>
              <CardContent className="pt-4 pb-4">
                <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {pasted}
                </pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}

    </div>
  )
}
