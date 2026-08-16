import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { getAdapter } from '@/lib/monitoring/adapters/index'
import { decryptCredentialsLoose } from '@/lib/monitoring/credentials'
import type { BrandCredentials, MonitoringBrand } from '@/lib/monitoring/types'

export const maxDuration = 60   // enumerating devices is several brand-API calls

/** True when the BMS figure differs enough to be a real change, not BMS drift. */
function shouldReplaceBatteryKwh(stored: number | null, fresh: number): boolean {
  if (stored == null || !(stored > 0)) return true
  return Math.abs(fresh - stored) / stored > 0.1
}

/**
 * POST /api/monitoring/systems/[systemId]/devices — re-read the installed
 * hardware from the brand cloud and store the totals on the system.
 *
 * This is what makes a parallel bank visible: the cloud reports "three units
 * configured in parallel", so the site's real rating (45 kVA, not 15) is read
 * rather than typed. Staff-only, and every column it writes is derived, so a
 * refresh never overwrites something a human entered — except `battery_kwh`,
 * which the BMS knows better than we do.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: system, error } = await supabase
    .from('monitoring_systems')
    .select('id, brand, plant_id, device_sn, battery_kwh, credentials, brand_account:monitoring_brand_accounts(credentials)')
    .eq('id', systemId)
    .single()
  if (error || !system) return NextResponse.json({ error: 'System not found' }, { status: 404 })

  const adapter = getAdapter(system.brand as MonitoringBrand)
  if (!adapter?.fetchDevices) {
    return NextResponse.json(
      { ok: false, error: `Device list not available for ${system.brand} — the brand's API doesn't enumerate hardware.` },
      { status: 200 },
    )
  }

  const account = Array.isArray(system.brand_account) ? system.brand_account[0] : system.brand_account
  const credentials: BrandCredentials = decryptCredentialsLoose(system.credentials ?? account?.credentials ?? null)
  if (Object.keys(credentials).length === 0) {
    return NextResponse.json({ ok: false, error: 'No usable credentials for this system' }, { status: 200 })
  }

  try {
    const inv = await adapter.fetchDevices(credentials, system.plant_id, system.device_sn)

    const updates: Record<string, unknown> = {
      inverter_kva: inv.inverter_kva,
      inverter_kw: inv.inverter_kw,
      inverter_count: inv.inverter_count || null,
      mppt_kw: inv.mppt_kw,
      pv_inverter_count: inv.pv_inverter_count || null,
      device_summary: inv.summary,
      device_inventory: inv.devices,
      devices_synced_at: new Date().toISOString(),
    }
    // The BMS knows the pack better than a typed figure — but some BMSs (BSL, for
    // one) report a LIVE capacity that drifts a few percent between reads, so
    // rewriting on every refresh would make the stored kWh wander. Only take the
    // new number when it is genuinely different (>10%), i.e. a module was added
    // or removed, or when nothing is stored yet.
    if (inv.battery_kwh != null && shouldReplaceBatteryKwh(system.battery_kwh, inv.battery_kwh)) {
      updates.battery_kwh = inv.battery_kwh
    }

    const { error: upErr } = await supabase.from('monitoring_systems').update(updates).eq('id', systemId)
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, inventory: inv })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 200 })
  }
}
