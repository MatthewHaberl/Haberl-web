import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { SOLAR_SYSTEM_PROMPT } from '@/lib/solar/system-prompt'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes for long quotes

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: Request) {
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

function buildSurveyMessage(s: Record<string, string>): string {
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
