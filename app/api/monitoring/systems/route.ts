import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { encryptCredentials } from '@/lib/monitoring/credentials'
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
    credentials: BrandCredentials
    capacity_kw?: number
    battery_kwh?: number
  }

  const encryptedCreds = encryptCredentials(body.credentials)

  const { data, error } = await supabase
    .from('monitoring_systems')
    .insert({
      site_id:    body.site_id,
      brand:      body.brand,
      label:      body.label,
      plant_id:   body.plant_id,
      device_sn:  body.device_sn,
      credentials: encryptedCreds,
      capacity_kw: body.capacity_kw,
      battery_kwh: body.battery_kwh,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
