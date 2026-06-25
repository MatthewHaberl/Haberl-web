// Dev-only: create one portal login per role so changes can be previewed as
// each audience (customer / field worker / manager / admin).
//
// Safe to re-run — idempotent. Uses the service-role key from .env.local and
// never prints it. Writes the resulting credentials back into .env.local
// (which is gitignored), so they are never committed.
//
//   cd haberl-web && node scripts/create-dev-users.mjs
//
// NOTE (2026-06-25): the SUPABASE_SERVICE_ROLE_KEY in the local .env.local is
// currently STALE/rejected ("Invalid API key"), so this admin-API script does
// not run here. The four dev users were instead seeded directly via the
// Supabase MCP (SQL insert into auth.users + auth.identities). Refresh the
// local service-role key (Supabase dashboard → Settings → API keys) to use
// this script — and to fix createAdminClient() locally (public /q/[token]
// quote pages, finance docs, monitoring collector all depend on it).

import { createClient } from '@supabase/supabase-js'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const envPath = join(scriptDir, '..', '.env.local')

// --- parse .env.local (no external deps, never logged) ---
function parseEnv(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const env = parseEnv(envPath)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const PASSWORD = env.DEV_PORTAL_PASSWORD || 'HaberlDev!2026'

const USERS = [
  { key: 'CUSTOMER', email: 'dev.customer@haberl.co.za', full_name: 'Dev Customer',     role: 'customer' },
  { key: 'FIELD',    email: 'dev.field@haberl.co.za',    full_name: 'Dev Field Worker', role: 'field_worker' },
  { key: 'MANAGER',  email: 'dev.manager@haberl.co.za',  full_name: 'Dev Manager',      role: 'manager' },
  { key: 'ADMIN',    email: 'dev.admin@haberl.co.za',    full_name: 'Dev Admin',        role: 'admin' },
]

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findUserByEmail(email) {
  // listUsers is paginated; dev projects are small so one page is plenty.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) || null
}

async function ensureUser({ email, full_name, role }) {
  let userId
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      const existing = await findUserByEmail(email)
      if (!existing) throw new Error(`exists but not found: ${email} (${error.message})`)
      await admin.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name },
      })
      userId = existing.id
    } else {
      throw error
    }
  } else {
    userId = data.user.id
  }

  // The on_auth_user_created trigger inserts the profile as role='customer';
  // upsert to set the intended role (service role bypasses RLS).
  const { error: upErr } = await admin
    .from('user_profiles')
    .upsert({ id: userId, email, full_name, role }, { onConflict: 'id' })
  if (upErr) throw upErr

  return userId
}

function writeCredsToEnv() {
  if (env.DEV_PORTAL_PASSWORD) return // already written on a previous run
  const block = [
    '',
    '# --- Dev portal preview logins (gitignored, created by scripts/create-dev-users.mjs) ---',
    `DEV_PORTAL_PASSWORD=${PASSWORD}`,
    ...USERS.map((u) => `DEV_PORTAL_EMAIL_${u.key}=${u.email}`),
    '',
  ].join('\n')
  appendFileSync(envPath, block)
  console.log('Wrote DEV_PORTAL_* credentials to .env.local')
}

console.log('Creating dev portal users…\n')
for (const u of USERS) {
  try {
    const id = await ensureUser(u)
    console.log(`  ✓ ${u.role.padEnd(13)} ${u.email.padEnd(30)} ${id}`)
  } catch (e) {
    console.error(`  ✗ ${u.role.padEnd(13)} ${u.email}  — ${e.message}`)
    process.exitCode = 1
  }
}
writeCredsToEnv()
console.log(`\nPassword for all dev logins: ${PASSWORD}`)
console.log('Done.')
