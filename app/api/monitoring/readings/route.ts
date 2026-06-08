import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * GET /api/monitoring/readings
 * ?systemId=...&latest=true  → single latest reading
 * ?systemId=...&hours=24     → last N hours of readings
 * ?systemId=...&hours=168    → last 7 days
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const systemId = searchParams.get('systemId')
  if (!systemId) return NextResponse.json({ error: 'systemId required' }, { status: 400 })

  const latest = searchParams.get('latest') === 'true'
  const hours  = parseInt(searchParams.get('hours') ?? '24', 10)

  const supabase = await createClient()

  if (latest) {
    const { data, error } = await supabase
      .from('monitoring_readings')
      .select('id, system_id, recorded_at, pv_power_w, battery_power_w, grid_power_w, load_power_w, battery_soc_pct, battery_voltage_v, grid_frequency_hz, inverter_temp_c, pv_strings, fault_codes, device_state')
      .eq('system_id', systemId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('monitoring_readings')
    .select('id, recorded_at, pv_power_w, battery_power_w, grid_power_w, load_power_w, battery_soc_pct, device_state')
    .eq('system_id', systemId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
