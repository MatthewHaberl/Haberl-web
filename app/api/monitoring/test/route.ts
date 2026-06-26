import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { getAdapter, AdapterError } from '@/lib/monitoring/adapters/index'
import { decryptCredentialsLoose } from '@/lib/monitoring/credentials'
import type { BrandCredentials, MonitoringBrand } from '@/lib/monitoring/types'

export const maxDuration = 30  // brand APIs can be slow; allow a generous timeout

/**
 * POST /api/monitoring/test — do a one-shot live fetch against a brand API
 * WITHOUT saving anything. Lets an admin verify credentials before creating
 * the system. Credentials are sent in the request body (HTTPS, admin-only)
 * and never persisted here.
 */
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
    brand: MonitoringBrand
    credentials: BrandCredentials
    plant_id?: string | null
    device_sn?: string | null
    // When editing an existing system, the form keeps stored secrets blank.
    // Pass its id so we can fall back to the saved credentials / locators for
    // any field the user left untouched.
    systemId?: string
    // When connecting via a shared brand account, pass its id to test with the
    // account's saved key (no per-site credentials entered).
    brand_account_id?: string
  }

  let credentials: BrandCredentials = body.credentials ?? {}
  let plantId = body.plant_id?.trim() || null
  let deviceSn = body.device_sn?.trim() || null

  if (body.systemId) {
    const { data: stored } = await supabase
      .from('monitoring_systems')
      .select('brand, credentials, plant_id, device_sn')
      .eq('id', body.systemId)
      .single()

    if (stored) {
      // Only reuse stored secrets when the brand is unchanged — a different
      // brand's saved keys don't apply to this adapter.
      if (stored.brand === body.brand) {
        const savedCreds = decryptCredentialsLoose(stored.credentials as string | null)
        credentials = { ...savedCreds, ...credentials }
      }
      plantId = plantId ?? (stored.plant_id as string | null)
      deviceSn = deviceSn ?? (stored.device_sn as string | null)
    }
  }

  if (body.brand_account_id) {
    const { data: account } = await supabase
      .from('monitoring_brand_accounts')
      .select('brand, credentials')
      .eq('id', body.brand_account_id)
      .single()

    // Account's saved key underlies anything explicitly typed in this request.
    if (account && account.brand === body.brand) {
      credentials = { ...decryptCredentialsLoose(account.credentials as string | null), ...credentials }
    }
  }

  const adapter = getAdapter(body.brand)

  try {
    const reading = await adapter.fetchReading(credentials, plantId, deviceSn)
    // Return a trimmed, non-sensitive snapshot the form can show as proof.
    return NextResponse.json({
      ok: true,
      sample: {
        recorded_at:     reading.recorded_at,
        device_state:    reading.device_state,
        pv_power_w:       reading.pv_power_w,
        battery_soc_pct:  reading.battery_soc_pct,
        grid_power_w:     reading.grid_power_w,
        load_power_w:     reading.load_power_w,
        pv_string_count:  reading.pv_strings?.length ?? 0,
      },
    })
  } catch (err) {
    // 200 with ok:false — a credential/plant mismatch is an expected outcome
    // of "test", not an HTTP error, so the client shows the message inline.
    const message =
      err instanceof AdapterError ? err.message
        : err instanceof Error ? err.message
          : String(err)
    return NextResponse.json({ ok: false, error: message })
  }
}
