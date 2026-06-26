import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { encryptCredentials, decryptCredentials } from '@/lib/monitoring/credentials'
import type { BrandCredentials } from '@/lib/monitoring/types'

/** Reusable, per-brand API credentials shared across many sites. Staff only.
 *  Secrets are never returned to the client — list responses omit `credentials`. */

async function requireStaff() {
  const user = await getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { supabase }
}

/** GET /api/monitoring/accounts?brand=... — list saved connections (no secrets). */
export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { supabase } = gate

  const brand = req.nextUrl.searchParams.get('brand')
  const query = supabase
    .from('monitoring_brand_accounts')
    .select('id, brand, name, created_at')
    .order('brand')
    .order('name')
  if (brand) query.eq('brand', brand)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** POST /api/monitoring/accounts — create a connection. */
export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = (await req.json()) as { brand: string; name: string; credentials: BrandCredentials }
  if (!body.brand || !body.name?.trim()) {
    return NextResponse.json({ error: 'Brand and a name are required.' }, { status: 400 })
  }
  const hasCreds = !!body.credentials &&
    Object.values(body.credentials).some((v) => (v ?? '').toString().trim() !== '')
  if (!hasCreds) return NextResponse.json({ error: 'Enter the credentials for this connection.' }, { status: 400 })

  const { data, error } = await supabase
    .from('monitoring_brand_accounts')
    .insert({ brand: body.brand, name: body.name.trim(), credentials: encryptCredentials(body.credentials) })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

/** PATCH /api/monitoring/accounts — rename and/or replace credentials.
 *  Blank credential fields keep the saved value (same convention as systems). */
export async function PATCH(req: NextRequest) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = (await req.json()) as { id: string; name?: string; credentials?: BrandCredentials }
  if (!body.id) return NextResponse.json({ error: 'Missing account id' }, { status: 400 })

  const { data: existing, error: loadErr } = await supabase
    .from('monitoring_brand_accounts')
    .select('credentials')
    .eq('id', body.id)
    .single()
  if (loadErr || !existing) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
    updates.name = body.name.trim()
  }

  const incoming = body.credentials ?? {}
  const hasNewCreds = Object.values(incoming).some((v) => (v ?? '').toString().trim() !== '')
  if (hasNewCreds) {
    let current: BrandCredentials = {}
    try { current = decryptCredentials(existing.credentials as string) } catch { current = {} }
    updates.credentials = encryptCredentials({ ...current, ...incoming })
  }

  const { error } = await supabase.from('monitoring_brand_accounts').update(updates).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: body.id }, { status: 200 })
}

/** DELETE /api/monitoring/accounts?id=... — remove a connection.
 *  Blocked while any system still relies on it. */
export async function DELETE(req: NextRequest) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { supabase } = gate

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing account id' }, { status: 400 })

  const { count } = await supabase
    .from('monitoring_systems')
    .select('id', { count: 'exact', head: true })
    .eq('brand_account_id', id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Still used by ${count} system${count === 1 ? '' : 's'}. Point them elsewhere first.` },
      { status: 409 },
    )
  }

  const { error } = await supabase.from('monitoring_brand_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 200 })
}
