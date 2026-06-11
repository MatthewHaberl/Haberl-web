import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { SOLAR_SYSTEM_PROMPT } from '@/lib/solar/system-prompt'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes for long quotes

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: Request) {
  // Legacy path: the deterministic calculator replaced AI generation in the
  // UI (2026-06-09). Kept behind an explicit flag for experimentation only.
  if (process.env.ENABLE_AI_QUOTES !== 'true') {
    return new Response(
      'AI generation is disabled — quotes use the deterministic calculator. Set ENABLE_AI_QUOTES=true to re-enable this endpoint.',
      { status: 403 }
    )
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      'AI generation is not configured — add ANTHROPIC_API_KEY to .env.local',
      { status: 503 }
    )
  }

  // Only admins may call the AI quote generator
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return new Response('Forbidden — only admins can generate quotes', { status: 403 })
  }

  const survey = await req.json()

  // Build the user message from the site survey form
  const userMessage = buildSurveyMessage(survey)

  // Create a streaming response using Anthropic SDK
  // claude-sonnet-4-6 with prompt caching — the large system prompt is cached
  // after the first call, cutting cost ~90% on subsequent quotes
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: [
      {
        type: 'text',
        text: SOLAR_SYSTEM_PROMPT,
        // Prompt caching: the large reference file is stable across all quotes
        // First call: ~1.25x cost (writes cache). Subsequent calls: ~0.1x (reads cache)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cache_control: { type: 'ephemeral' } as any,
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  })

  // Return a ReadableStream so the UI can stream the response
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(new TextEncoder().encode(event.delta.text))
          }
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// Accepts DB snake_case record (customer_name, grid_supply, etc.)
// Also accepts camelCase (customerName, gridSupply) as fallback for future API callers
function buildSurveyMessage(s: Record<string, unknown>): string {
  const v = (snake: string, camel?: string) =>
    String(s[snake] ?? (camel ? s[camel] : undefined) ?? '')
  const today = new Date().toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const quoteNum = v('next_quote_number', 'nextQuoteNumber') || v('quote_number', 'quoteNumber')
  const isAmendment = !!(s.is_amendment)

  // Usage block — handle advanced (12-month) or simple average
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const usageBlock = s.usage_mode === 'advanced'
    ? 'Monthly breakdown:\n' + MONTHS.map((m, i) =>
        s[`monthly_kwh_${m}`] ? `  - ${MONTH_LABELS[i]}: ${s[`monthly_kwh_${m}`]} kWh` : null
      ).filter(Boolean).join('\n') + (s.monthly_kwh ? `\n  - Average: ${s.monthly_kwh} kWh/month` : '')
    : `Average monthly usage: ${v('monthly_kwh', 'monthlyKwh') || 'TBC'} kWh`

  const amendmentBlock = isAmendment ? `
## EXISTING SYSTEM (Amendment job)
- Current inverter: ${v('existing_inverter') || 'TBC'}
- Current batteries: ${v('existing_batteries') || 'TBC'}
- Current panels: ${v('existing_panels') || 'TBC'}
- Current monthly usage: ${v('existing_monthly_usage') || 'TBC'} kWh
- Current monthly generation: ${v('existing_monthly_gen') || 'TBC'} kWh
- Scope of amendment: ${v('amendment_scope') || 'TBC'}

Quote ONLY the new/replacement components. State what is retained vs replaced.
` : ''

  const hasSpecificEquipment = !!(v('inverter_brand', 'inverterBrand') || v('battery_brand', 'batteryBrand') || v('panel_brand', 'panelBrand'))
  const includeCompetitive = !!(s.include_competitive)

  const MULTI_OPTION_FORMAT = `Output a single JSON object in a \`\`\`json code block using the multi-option format:
{ "type": "multi-option", "quoteNumber": "...", "dateIssued": "...", "dateExpires": "...", "customerName": "...", "municipality": "...", "customerPhone": "...", "customerEmail": "...", "siteAddress": "...", "monthlyUsageKwh": "...", "comparisonTable": [...], "options": [{ "tier": "premium", "tierLabel": "★★★ Premium", "supplierBom": [...], ... }, { "tier": "recommended", "tierLabel": "★★☆ Recommended", "recommended": true, "supplierBom": [...], ... }, { "tier": "budget", "tierLabel": "★☆☆ Budget", "supplierBom": [...], ... }] }
Each option carries all QuoteData fields. No other text.`

  let outputInstruction: string
  if (!hasSpecificEquipment) {
    outputInstruction = `Generate the DEFAULT THREE-OPTION proposal (Premium ★★★ / Recommended ★★☆ / Budget ★☆☆).
${MULTI_OPTION_FORMAT}`
  } else if (includeCompetitive) {
    outputInstruction = `The customer has specified equipment preferences. Generate a THREE-OPTION proposal where:
- Recommended (★★☆): Use the customer's preferred brands exactly.
- Premium (★★★): Best premium alternative from your catalogue (ignore their brand preference for this tier).
- Budget (★☆☆): Most cost-effective alternative from your catalogue (ignore their brand preference for this tier).
${MULTI_OPTION_FORMAT}`
  } else {
    outputInstruction = `The customer has specified equipment preferences — generate a SINGLE-OPTION quote matching those preferences exactly.
Output a single JSON object in a \`\`\`json code block using the single-option format (camelCase fields: quoteNumber, customerName, inverterModel, panelCost, depositItems, supplierBom, monthlyGenTable, twentyYearTable, etc.). No other text.`
  }

  return `Today's date: ${today}${quoteNum ? `\nUse quote number: ${quoteNum}` : ''}

Please generate a complete solar ${isAmendment ? 'amendment/upgrade' : 'installation'} quote based on the following site survey:
${amendmentBlock}
## CUSTOMER DETAILS
- Name: ${v('customer_name', 'customerName') || 'Unknown'}
- Phone: ${v('customer_phone', 'customerPhone') || 'TBC'}
- Email: ${v('customer_email', 'customerEmail') || 'TBC'}
- Address: ${v('address') || 'TBC'}
- Municipality: ${v('municipality') || 'TBC'}

## SITE INFORMATION
- Grid supply: ${v('grid_supply', 'gridSupply') || 'Single Phase'}
- Roof type: ${v('roof_type', 'roofType') || 'TBC'}
- Number of storeys: ${v('storeys') || '1'}

## ENERGY USAGE
${usageBlock}

## SYSTEM REQUIREMENTS
- System type: ${v('system_type', 'systemType') || 'Hybrid'}
- Battery backup: ${v('battery_hours', 'batteryHours') || 'AI will determine'}
- Essential load during backup: ${v('essential_load', 'essentialLoad') || 'TBC'} kW
- Target off-grid percentage: ${s.target_offgrid_pct != null ? `${s.target_offgrid_pct}%` : '100%'}
- EV charger required: ${v('ev_charger', 'evCharger') || 'No'}

## EQUIPMENT PREFERENCES
- Inverter brand: ${v('inverter_brand', 'inverterBrand') || 'No preference — AI will recommend'}
- Battery brand: ${v('battery_brand', 'batteryBrand') || 'No preference — AI will recommend'}
- Panel brand: ${v('panel_brand', 'panelBrand') || 'No preference — AI will recommend'}

## ADDITIONAL NOTES
${v('notes') || 'None'}

---

${outputInstruction}`
}
