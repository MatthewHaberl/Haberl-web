// sync-plan.mjs — push the Haberl "what's next" list from the second brain into Supabase.
//
// Reads the vault's recommendations.md, keeps ONLY the allowlisted Haberl sections,
// cleans + parses each row, and upserts them into public.plan_items. The employee
// dashboard reads that table live. Run on demand: `npm run sync-plan` (or sync-plan.bat).
//
// PRIVACY: this is an ALLOWLIST by section heading. BMG, trading, vault/admin and
// personal sections are never read and never leave the vault. Adding a new section to
// recommendations.md does NOT expose it until its heading is added to ALLOWED_SECTIONS.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// haberl-web/scripts → ../../ = BMG root → claude-obsidian/wiki/projects/recommendations.md
const DEFAULT_SOURCE = path.resolve(
  __dirname,
  '../../claude-obsidian/wiki/projects/recommendations.md',
)
const SOURCE_PATH = process.env.PLAN_SOURCE_PATH || DEFAULT_SOURCE

// Heading prefix (text after "## ") → clean track label shown on the dashboard.
// Anything not listed here stays in the vault.
const ALLOWED_SECTIONS = [
  { prefix: 'Website & Tech', track: 'Website & Tech' },
  { prefix: 'Haberl Solar Automation', track: 'Solar Automation' },
  { prefix: 'Solar Platform', track: 'Solar Platform' },
]

const PRIORITY_RANK = { urgent: 0, highest: 1, high: 2, medium: 3, low: 4 }

// Defense-in-depth: even inside an allowlisted section, drop any item whose text
// mentions BMG / acquisition / trading topics. Catches stray references like a
// Website task described as "...BMG pipeline, investors...".
const DENY = /\b(bmg|acdc|arb electrical|investor|investors|acquisition|trading)\b/i

function trackFor(headingText) {
  const h = headingText.trim()
  const match = ALLOWED_SECTIONS.find((s) => h.startsWith(s.prefix))
  return match ? match.track : null
}

// Strip Obsidian/markdown noise so the title reads as plain text on the dashboard.
function cleanText(s) {
  return s
    .replace(/~~/g, '') // strikethrough markers (keep the words)
    .replace(/\*\*/g, '') // bold markers
    .replace(/`([^`]*)`/g, '$1') // inline code → inner text
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1') // [[Page|Alias]] → Alias
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[Page]] → Page
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePriority(cell) {
  const p = cleanText(cell).toLowerCase().trim()
  if (p in PRIORITY_RANK) return { priority: p, priority_rank: PRIORITY_RANK[p] }
  return { priority: 'medium', priority_rank: PRIORITY_RANK.medium }
}

function normalizeStatus(cell) {
  if (/\[x\]/i.test(cell)) return 'done'
  if (/\[~\]/.test(cell)) return 'in_progress'
  return 'pending' // "[ ]" or anything unrecognised
}

// W26, S3, SP1, AI1 … but not "#" or "-" (header / completed-section rows).
const ITEM_CODE = /^[A-Z]{1,3}\d+$/

function parse(markdown) {
  const lines = markdown.split(/\r?\n/)
  const items = []
  const redacted = []
  const seen = new Set()
  let track = null

  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line)
    if (heading) {
      track = trackFor(heading[1])
      continue
    }
    if (!track) continue
    if (!line.trimStart().startsWith('|')) continue

    // Leading/trailing "|" produce empty first/last cells; real cols are 1..5.
    const cells = line.split('|').map((c) => c.trim())
    const code = cells[1] ?? ''
    if (!ITEM_CODE.test(code) || seen.has(code)) continue
    seen.add(code)

    const title = cleanText(cells[2] ?? '')
    if (DENY.test(title)) {
      redacted.push(code) // sensitive mention inside an allowed section → skip
      continue
    }

    const { priority, priority_rank } = normalizePriority(cells[3] ?? '')
    const session = (cells[5] ?? '').trim()

    items.push({
      code,
      track,
      title,
      priority,
      priority_rank,
      status: normalizeStatus(cells[4] ?? ''),
      source_session: /^\d{4}-\d{2}-\d{2}$/.test(session) ? session : null,
    })
  }
  return { items, redacted }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error(
      'Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in haberl-web/.env.local',
    )
    process.exit(1)
  }

  let markdown
  try {
    markdown = await readFile(SOURCE_PATH, 'utf8')
  } catch {
    console.error(`Could not read source file: ${SOURCE_PATH}`)
    console.error('Set PLAN_SOURCE_PATH if your vault lives elsewhere.')
    process.exit(1)
  }

  const { items, redacted } = parse(markdown)
  if (items.length === 0) {
    console.error('No allowlisted items parsed — aborting so the table is not wiped.')
    process.exit(1)
  }

  const syncedAt = new Date().toISOString()
  const rows = items.map((it) => ({
    ...it,
    is_published: true,
    synced_at: syncedAt,
    updated_at: syncedAt,
  }))

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { error: upsertError } = await supabase
    .from('plan_items')
    .upsert(rows, { onConflict: 'code' })
  if (upsertError) {
    console.error('Upsert failed:', upsertError.message)
    process.exit(1)
  }

  // Anything in the table that was NOT in this run = removed from the file → hide it.
  const { error: pruneError, count } = await supabase
    .from('plan_items')
    .update({ is_published: false, updated_at: syncedAt }, { count: 'exact' })
    .neq('synced_at', syncedAt)
  if (pruneError) {
    console.error('Prune (unpublish) failed:', pruneError.message)
    process.exit(1)
  }

  const byTrack = rows.reduce((acc, r) => {
    acc[r.track] = (acc[r.track] ?? 0) + 1
    return acc
  }, {})
  const open = rows.filter((r) => r.status !== 'done').length

  console.log(`Synced ${rows.length} Haberl plan items (${open} open) from:`)
  console.log(`  ${SOURCE_PATH}`)
  for (const [t, n] of Object.entries(byTrack)) console.log(`  • ${t}: ${n}`)
  console.log(`Unpublished ${count ?? 0} stale item(s).`)
  if (redacted.length) {
    console.log(`Privacy filter skipped ${redacted.length} item(s) (BMG/trading mention): ${redacted.join(', ')}`)
  }
  console.log('Dashboard "What\'s next" now reflects the current plan.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
