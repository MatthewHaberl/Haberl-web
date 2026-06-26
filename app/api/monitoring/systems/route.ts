import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { encryptCredentials, decryptCredentials } from '@/lib/monitoring/credentials'
import type { BrandCredentials } from '@/lib/monitoring/types'

/** GET /api/monitoring/systems?siteId=... — list systems for a site */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const siteId = req.nextUrl.searchParams.get('siteId')
  const supabase = await createClient()

  const query = supabase
    .from('monitoring_systems')
    .select('id, site_id, brand, label, plant_id, device_sn, capacity_kw, battery_kwh, enabled, last_polled_at, poll_error, created_at')
    .order('created_at')

  if (siteId) query.eq('site_id', siteId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

/** POST /api/monitoring/systems — create a new monitoring system */
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as {
    site_id: string
    brand: string
    label?: string
    plant_id?: string
    device_sn?: string
    credentials?: BrandCredentials
    brand_account_id?: string | null
    capacity_kw?: number
    battery_kwh?: number
  }

  // A system draws its key from EITHER a shared brand account OR its own
  // credentials. When an account is chosen, store null creds so the collector
  // falls back to the account.
  const usesAccount = !!body.brand_account_id
  const hasCreds = !!body.credentials &&
    Object.values(body.credentials).some((v) => (v ?? '').toString().trim() !== '')

  if (!usesAccount && !hasCreds) {
    return NextResponse.json(
      { error: 'Provide credentials or select a saved brand connection.' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('monitoring_systems')
    .insert({
      site_id:    body.site_id,
      brand:      body.brand,
      label:      body.label,
      plant_id:   body.plant_id,
      device_sn:  body.device_sn,
      credentials: usesAccount ? null : encryptCredentials(body.credentials ?? {}),
      brand_account_id: body.brand_account_id ?? null,
      capacity_kw: body.capacity_kw,
      battery_kwh: body.battery_kwh,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

/**
 * PATCH /api/monitoring/systems — update an existing monitoring system.
 *
 * Built for the common "I typed the wrong plant ID / API key" fix. Credentials
 * are write-only from the client's side: the form never receives the stored
 * secret, so an OMITTED or empty credential field means "keep the saved value".
 *  - Same brand  → provided credential fields are merged onto the stored ones.
 *  - Brand change → credentials are replaced wholesale (the old brand's keys
 *    don't apply), so the client must send a full set.
 * A successful edit clears any prior poll_error so the banner resets until the
 * next poll proves the fix.
 */
export async function PATCH(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as {
    id: string
    site_id?: string
    brand?: string
    label?: string | null
    plant_id?: string | null
    device_sn?: string | null
    credentials?: BrandCredentials
    brand_account_id?: string | null
    capacity_kw?: number | null
    battery_kwh?: number | null
    enabled?: boolean
  }

  if (!body.id) return NextResponse.json({ error: 'Missing system id' }, { status: 400 })

  // Load the current row so we can merge credentials and detect a brand change.
  const { data: existing, error: loadErr } = await supabase
    .from('monitoring_systems')
    .select('brand, credentials')
    .eq('id', body.id)
    .single()

  if (loadErr || !existing) {
    return NextResponse.json({ error: 'System not found' }, { status: 404 })
  }

  // An enable/disable toggle is a standalone PATCH: don't reset poll_error or
  // touch credentials when the caller is only flipping `enabled`.
  const enabledOnly =
    body.enabled !== undefined &&
    body.site_id === undefined && body.brand === undefined && body.label === undefined &&
    body.plant_id === undefined && body.device_sn === undefined &&
    body.capacity_kw === undefined && body.battery_kwh === undefined &&
    body.credentials === undefined && body.brand_account_id === undefined

  const updates: Record<string, unknown> = enabledOnly ? {} : { poll_error: null }
  if (body.site_id          !== undefined) updates.site_id          = body.site_id
  if (body.brand            !== undefined) updates.brand            = body.brand
  if (body.label            !== undefined) updates.label            = body.label
  if (body.plant_id         !== undefined) updates.plant_id         = body.plant_id
  if (body.device_sn        !== undefined) updates.device_sn        = body.device_sn
  if (body.capacity_kw      !== undefined) updates.capacity_kw      = body.capacity_kw
  if (body.battery_kwh      !== undefined) updates.battery_kwh      = body.battery_kwh
  if (body.brand_account_id !== undefined) updates.brand_account_id = body.brand_account_id
  if (body.enabled          !== undefined) updates.enabled          = body.enabled

  const brandChanged = body.brand !== undefined && body.brand !== existing.brand
  const incoming = body.credentials ?? {}
  const hasNewCreds = Object.values(incoming).some((v) => (v ?? '').toString().trim() !== '')
  const usesAccount = !!body.brand_account_id

  if (usesAccount) {
    // The system now draws its key from a shared brand account — drop any
    // per-system credential so the collector falls back to the account.
    updates.credentials = null
  } else if (brandChanged) {
    // A new brand's credentials replace the old set entirely.
    if (!hasNewCreds) {
      return NextResponse.json(
        { error: 'Changing the brand requires re-entering the credentials for the new brand, or selecting a saved connection.' },
        { status: 400 },
      )
    }
    updates.credentials = encryptCredentials(incoming)
    updates.brand_account_id = null
  } else if (hasNewCreds) {
    // Same brand: merge only the fields the user actually re-typed, and detach
    // any previously-linked account (a one-off key now lives on the system).
    let current: BrandCredentials = {}
    try {
      current = decryptCredentials(existing.credentials as string)
    } catch {
      current = {}  // unreadable (e.g. key rotated) — fall back to a clean overwrite
    }
    updates.credentials = encryptCredentials({ ...current, ...incoming })
    updates.brand_account_id = null
  }

  const { error } = await supabase
    .from('monitoring_systems')
    .update(updates)
    .eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: body.id }, { status: 200 })
}

/**
 * DELETE /api/monitoring/systems?id=... — permanently remove a system.
 * Readings, alert rules/events, baselines and permissions cascade away with it
 * (all FKs are ON DELETE CASCADE). To stop polling without losing history,
 * PATCH { enabled: false } instead.
 */
export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing system id' }, { status: 400 })

  const { error } = await supabase.from('monitoring_systems').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 200 })
}
