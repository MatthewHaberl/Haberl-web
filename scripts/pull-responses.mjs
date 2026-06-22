// pull-responses.mjs — bring the dashboard "What's next" replies back to the vault.
//
// Reverse of sync-plan.mjs. Reads plan_items that have an operator reply or a
// user_status set, and writes them to claude-obsidian/wiki/projects/plan-responses.md
// so they are visible in Obsidian AND so the next Claude session can read what
// Matthew decided on each item. Run on demand: `npm run pull-responses`
// (or double-click pull-responses.bat).
//
// Read-only against the DB except for nothing — it only SELECTs.

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const OUT_PATH = path.resolve(
  __dirname,
  '../../claude-obsidian/wiki/projects/plan-responses.md',
)

const STATUS_LABEL = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
  parked: 'Parked',
}

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in haberl-web/.env.local')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('plan_items')
    .select('code, track, title, priority, status, response, user_status, responded_at, response_handled')
    .or('response.not.is.null,user_status.not.is.null')
    .order('responded_at', { ascending: false })

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }

  const items = data ?? []
  const unhandled = items.filter((i) => i.response && !i.response_handled)

  const lines = [
    '---',
    'type: project',
    'title: "Dashboard Replies — What\'s Next"',
    `updated: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    '',
    '# Dashboard replies — what Matthew said on each "What\'s next" item',
    '',
    '> Pulled from the live `plan_items` table by `npm run pull-responses`. These are Matthew\'s',
    '> replies and status calls from the website dashboard. **Claude: read this at session start,',
    '> act on the unhandled ones, then set `response_handled = true` on the items you\'ve actioned',
    '> (and update `recommendations.md`).**',
    '',
    `Pulled: ${fmt(new Date().toISOString())} · ${items.length} item(s) with a reply or status · ${unhandled.length} unhandled.`,
    '',
  ]

  if (items.length === 0) {
    lines.push('_No replies yet._')
  } else {
    for (const i of items) {
      const status = i.user_status ? STATUS_LABEL[i.user_status] ?? i.user_status : '—'
      const handled = i.response_handled ? '✅ handled' : '🔵 needs action'
      lines.push(`## ${i.code} · ${i.track} — ${status} ${i.response ? `(${handled})` : ''}`.trimEnd())
      lines.push('')
      lines.push(`**Item:** ${i.title}`)
      lines.push('')
      if (i.response) {
        lines.push(`**Matthew's reply:** ${i.response}`)
      } else {
        lines.push('**Matthew\'s reply:** _(status only, no note)_')
      }
      lines.push('')
      lines.push(`_Replied ${fmt(i.responded_at) || 'n/a'} · plan priority: ${i.priority} · vault status: ${i.status}_`)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }

  await writeFile(OUT_PATH, lines.join('\n'), 'utf8')
  console.log(`Wrote ${items.length} reply item(s) (${unhandled.length} unhandled) to:`)
  console.log(`  ${OUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
