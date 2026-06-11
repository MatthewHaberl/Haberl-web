import { createClient } from '@/lib/supabase/server'
import type {
  ContentBlock,
  ContentBlockParam,
  MessageParam,
  TextBlock,
  ToolResultBlockParam,
  ToolUseBlock,
  WebSearchTool20250305,
} from '@anthropic-ai/sdk/resources/messages/messages'

export const runtime = 'nodejs'
export const maxDuration = 180

// ─── Types ────────────────────────────────────────────────────────────────────

type ResearchItem = {
  resource_type: string
  title: string
  url: string | null
  content: string | null
  thumbnail_url: string | null
  file_type: string | null
  source_domain: string | null
  confidence: number
}

type CatalogResearchSource = Record<string, unknown>

const VALID_TYPES = new Set([
  'description', 'datasheet', 'photo', 'sld', 'model_3d', 'manual', 'compatibility', 'spec_table',
])

// ─── Anthropic AI path (full research with descriptions) ──────────────────────

const RESEARCH_SYSTEM_PROMPT = `You are a product research agent for Haberl Electrical & Solar, a South African solar/electrical installer.

Your task: research a specific electrical/solar product and return structured JSON findings covering:
- description: A professional product description (300–400 words) for an e-commerce product page
- spec_table: Key technical specifications as a markdown table
- datasheet: Manufacturer or distributor PDF datasheet URLs
- photo: High-quality official product photos (prefer manufacturer or SA distributor sites; avoid Alibaba/AliExpress)
- sld: Single Line Diagrams or wiring/connection diagrams showing how the product connects
- manual: Installation or user manual PDFs
- compatibility: Which other products this works with (inverters, batteries, meters, combiner boxes) and any relevant docs
- model_3d: 3D model files if available (STEP, DXF, OBJ, SolidWorks)

Search strategy:
1. Start with the official manufacturer website
2. Check South African distributors: Voltex, Warp Energy, RS Components, PV Cables, Solar Advice
3. Check technical documentation sites, GitHub repos, and forums
4. For SLDs: check the manual PDF first, then manufacturer application notes

Output format: a JSON array inside a single \`\`\`json code block. Each item:
{
  "resource_type": "description|spec_table|datasheet|photo|sld|manual|compatibility|model_3d",
  "title": "concise descriptive title (max 80 chars)",
  "url": "https://full-url or null for description/spec_table",
  "content": "full text, markdown table, or written description — null if no text to include",
  "thumbnail_url": "direct image URL for photos only — null otherwise",
  "file_type": "pdf|png|jpg|step|html|etc or null",
  "source_domain": "example.com or null",
  "confidence": 85
}

Confidence guide: 95 = official manufacturer page, 80 = reputable SA distributor, 65 = third-party tech site, 45 = uncertain source.
Aim for: 1 description, 1 spec_table, 2–4 datasheets, 3–6 photos, 1–3 SLDs, 1–2 manuals, 1–2 compatibility notes.
Output ONLY the JSON array in a \`\`\`json code block. No preamble or explanation.`

function extractJsonArray(text: string): ResearchItem[] | null {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text'
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use'
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function runAnthropicResearch(userMessage: string): Promise<ResearchItem[]> {
  // Dynamic import so module load doesn't fail when no API key is present
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const webSearchTool: WebSearchTool20250305 = { type: 'web_search_20250305', name: 'web_search' }
  let messages: MessageParam[] = [{ role: 'user', content: userMessage }]
  let finalText = ''

  for (let i = 0; i < 10; i++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      tools: [webSearchTool],
      system: RESEARCH_SYSTEM_PROMPT,
      messages,
    })

    const textContent = response.content
      .filter(isTextBlock)
      .map((b) => b.text)
      .join('')

    if (response.stop_reason === 'end_turn') {
      finalText = textContent
      break
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: ToolResultBlockParam[] = response.content
        .filter(isToolUseBlock)
        .map((b) => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: '',
        }))

      messages = [
        ...messages,
        { role: 'assistant', content: response.content as ContentBlockParam[] },
        {
          role: 'user',
          content: toolResults,
        },
      ]
    } else {
      finalText = textContent
      break
    }
  }

  return extractJsonArray(finalText) ?? []
}

// ─── DuckDuckGo fallback (no API key required) ────────────────────────────────

type DDGResult = { title: string; url: string; snippet: string }

async function ddgSearch(query: string): Promise<DDGResult[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!res.ok) return []
    const html = await res.text()

    const results: DDGResult[] = []

    // DDG lite wraps destination URLs in /l/?uddg=ENCODED or uses direct hrefs
    const linkRe = /class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

    const snippets: string[] = []
    let sm: RegExpExecArray | null
    while ((sm = snippetRe.exec(html)) !== null) {
      snippets.push(sm[1].replace(/<[^>]+>/g, '').trim())
    }

    let lm: RegExpExecArray | null
    let idx = 0
    while ((lm = linkRe.exec(html)) !== null && results.length < 8) {
      const rawHref = lm[1]
      const rawTitle = lm[2].replace(/<[^>]+>/g, '').trim()

      // Unwrap DDG redirect URL
      let url = rawHref
      const uddg = rawHref.match(/[?&]uddg=([^&]+)/)
      if (uddg) {
        url = decodeURIComponent(uddg[1])
      }

      if (!url.startsWith('http') || !rawTitle) { idx++; continue }

      results.push({ title: rawTitle, url, snippet: snippets[idx] ?? '' })
      idx++
    }

    return results
  } catch {
    return []
  }
}

function fileTypeFromUrl(url: string): string | null {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (!ext || ext.length > 5) return null
  return ext
}

function sourceDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function categorise(title: string, url: string, snippet: string): string | null {
  const t = (title + ' ' + snippet).toLowerCase()
  const u = url.toLowerCase()

  if (u.endsWith('.step') || u.endsWith('.stp') || u.endsWith('.obj') || u.endsWith('.dxf') || t.includes('3d model') || t.includes('cad model') || t.includes('solidworks')) return 'model_3d'
  if (t.includes('wiring diagram') || t.includes('single line') || t.includes(' sld ') || t.includes('connection diagram') || t.includes('schematic')) return 'sld'
  if (t.includes('installation manual') || t.includes('user manual') || t.includes('user guide') || t.includes('installation guide')) return 'manual'
  if (u.endsWith('.pdf') || t.includes('datasheet') || t.includes('data sheet') || t.includes('product specification')) return 'datasheet'
  if (u.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) return 'photo'
  if (t.includes('compatible') || t.includes('compatibility') || t.includes('works with') || t.includes('combination')) return 'compatibility'
  return null
}

function buildTemplateDescription(item: CatalogResearchSource): ResearchItem {
  const brand = asText(item.brand)
  const sku = asText(item.sku)
  const description = asText(item.description)
  const category = asText(item.category)
  const phase = asText(item.phase)
  const notes = asText(item.notes)
  const wattsAc = asNumber(item.watts_ac)
  const wattsDc = asNumber(item.watts_dc)
  const kwh = asNumber(item.kwh)

  const spec = [
    wattsAc ? `${(wattsAc / 1000).toFixed(1)} kW AC output` : null,
    wattsDc ? `${wattsDc} Wp DC input` : null,
    kwh ? `${kwh} kWh capacity` : null,
    phase && phase !== 'any' ? `${phase}-phase` : null,
  ].filter(Boolean).join(', ')

  const content = [
    `## ${brand} ${sku}`,
    '',
    description,
    '',
    spec ? `**Key specifications:** ${spec}` : null,
    '',
    `The ${brand} ${sku} is a ${category} designed for South African solar installations.`,
    notes ? `\n**Notes:** ${notes}` : null,
    '',
    '_Description auto-generated from catalog data. Accept a researched description to replace this._',
  ].filter((line) => line !== null).join('\n')

  return {
    resource_type: 'description',
    title: `${item.brand} ${item.sku} — product description`,
    url: null,
    content,
    thumbnail_url: null,
    file_type: null,
    source_domain: null,
    confidence: 40,
  }
}

async function runDDGResearch(item: CatalogResearchSource): Promise<ResearchItem[]> {
  const brand = asText(item.brand)
  const sku = asText(item.sku)
  const q = `"${brand}" "${sku}"`

  const searches = await Promise.allSettled([
    ddgSearch(`${q} datasheet filetype:pdf`),
    ddgSearch(`${q} datasheet specifications`),
    ddgSearch(`${q} wiring diagram single line installation`),
    ddgSearch(`${q} installation manual`),
    ddgSearch(`${q} product image`),
    ddgSearch(`${q} compatible inverter battery`),
    ddgSearch(`${q} 3D model STEP CAD`),
  ])

  const allResults = searches.flatMap((s) => s.status === 'fulfilled' ? s.value : [])

  // Deduplicate by URL
  const seen = new Set<string>()
  const deduped = allResults.filter((r) => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })

  const items: ResearchItem[] = [buildTemplateDescription(item)]

  for (const r of deduped) {
    const type = categorise(r.title, r.url, r.snippet)
    if (!type) continue

    const ft = fileTypeFromUrl(r.url)
    items.push({
      resource_type: type,
      title: r.title.slice(0, 160),
      url: r.url,
      content: r.snippet || null,
      thumbnail_url: type === 'photo' ? r.url : null,
      file_type: ft,
      source_domain: sourceDomain(r.url),
      confidence: brand && r.url.toLowerCase().includes(brand.toLowerCase()) ? 75 : 55,
    })
  }

  return items
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 })

  const { id: catalogId } = await params

  const { data: item, error: itemError } = await supabase
    .from('equipment_catalog')
    .select('*')
    .eq('id', catalogId)
    .single()

  if (itemError || !item) return new Response('Catalog item not found', { status: 404 })

  const specLines = [
    item.watts_ac ? `AC Output: ${item.watts_ac}W` : null,
    item.watts_dc ? `DC / Wp: ${item.watts_dc}W` : null,
    item.kwh ? `Capacity: ${item.kwh}kWh` : null,
    item.phase !== 'any' ? `Phase: ${item.phase}-phase` : null,
    item.isc_amps ? `Isc: ${item.isc_amps}A` : null,
    item.voc_volts ? `Voc: ${item.voc_volts}V` : null,
    item.notes ? `Notes: ${item.notes}` : null,
  ].filter(Boolean).join('\n')

  const anthropicMessage = `Research this South African solar/electrical product for a product page:

Brand: ${item.brand}
Model / SKU: ${item.sku}
Short description: ${item.description}
Category: ${item.category}
${specLines}

Find all datasheets, photos, SLDs, manuals, compatibility docs, 3D models, and write a detailed product description suitable for an online shop.`

  // Choose research path based on whether an Anthropic key is configured
  const useAI = !!process.env.ANTHROPIC_API_KEY

  let found: ResearchItem[]
  try {
    found = useAI
      ? await runAnthropicResearch(anthropicMessage)
      : await runDDGResearch(item)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Research failed' },
      { status: 500 },
    )
  }

  if (found.length === 0) {
    return Response.json({ error: 'No results found. Try again or check the product name/SKU.' }, { status: 500 })
  }

  // Replace all pending research for this catalog item with fresh results
  await supabase.from('product_research').delete().eq('catalog_id', catalogId).eq('status', 'pending')

  const rows = found
    .filter((r) => VALID_TYPES.has(r.resource_type))
    .map((r) => ({
      catalog_id: catalogId,
      resource_type: r.resource_type,
      title: String(r.title ?? '').slice(0, 200),
      url: r.url ?? null,
      content: r.content ?? null,
      thumbnail_url: r.thumbnail_url ?? null,
      file_type: r.file_type ?? null,
      source_domain: r.source_domain ?? null,
      confidence: Math.min(100, Math.max(0, Number(r.confidence) || 60)),
      status: 'pending',
    }))

  const { error: insertError } = await supabase.from('product_research').insert(rows)
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 })

  await supabase
    .from('equipment_catalog')
    .update({ research_ran_at: new Date().toISOString() })
    .eq('id', catalogId)

  return Response.json({ count: rows.length, mode: useAI ? 'ai' : 'ddg' })
}
