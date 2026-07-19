// Drive a full Key Electric refresh sweep NOW instead of waiting for the daily
// cron: calls /api/cron/key-refresh repeatedly until it reports done. Works
// against production or a local dev server (both need CRON_SECRET set).
//
//   node scripts/key-electric-refresh.mjs https://haberl.co.za "$CRON_SECRET"
//
// The route (and the DB functions it calls — migration 091) do all the work;
// this is just a loop so a manual refresh finishes in one command.

const [base, secret] = process.argv.slice(2)
if (!base || !secret) {
  console.error('usage: node scripts/key-electric-refresh.mjs <baseUrl> <cronSecret>')
  process.exit(1)
}

const url = `${base.replace(/\/$/, '')}/api/cron/key-refresh?secret=${encodeURIComponent(secret)}`
for (let round = 1; ; round++) {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  console.log(`round ${round}: HTTP ${res.status}`, JSON.stringify(body).slice(0, 500))
  if (!res.ok) process.exit(2)
  if (body.done) break
}
console.log('sweep complete — see supplier_refresh_state.last_run_summary for the full report')
