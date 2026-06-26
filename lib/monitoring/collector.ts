/**
 * Monitoring collector — called by the cron endpoint every 5 minutes.
 * Reads all enabled monitoring_systems, fetches data from each brand adapter,
 * writes a normalised reading to monitoring_readings, runs the alert engine.
 */
import { createClient } from '@supabase/supabase-js'
import { getAdapter, AdapterError } from './adapters/index'
import { decryptCredentialsLoose } from './credentials'
import { runAlertEngine } from './alert-engine'
import type { BrandCredentials, MonitoringBrand, NormalisedReading } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = ReturnType<typeof createClient<any>>

interface MonitoringSystem {
  id: string
  site_id: string | null
  brand: MonitoringBrand
  plant_id: string | null
  device_sn: string | null
  credentials: string | null  // encrypted JSON string, or null when using an account
  brand_account_id: string | null
  // Joined shared brand account (to-one). May arrive as an object or 1-element array.
  brand_account: { credentials: string | null } | { credentials: string | null }[] | null
  enabled: boolean
}

export interface CollectorResult {
  systemId: string
  brand: MonitoringBrand
  ok: boolean
  error?: string
}

export async function runCollector(): Promise<CollectorResult[]> {
  // Use service role to bypass RLS for server-side collection
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: systems, error } = await supabase
    .from('monitoring_systems')
    .select('id, site_id, brand, plant_id, device_sn, credentials, brand_account_id, brand_account:monitoring_brand_accounts(credentials), enabled')
    .eq('enabled', true)

  if (error) throw new Error(`Failed to fetch monitoring systems: ${error.message}`)
  if (!systems?.length) return []

  const typedSupabase = supabase as AnySupabaseClient
  const results: CollectorResult[] = []

  // Process in batches of 5 to avoid overwhelming brand APIs simultaneously
  const batchSize = 5
  for (let i = 0; i < systems.length; i += batchSize) {
    const batch = (systems as MonitoringSystem[]).slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map((system) => processSingleSystem(typedSupabase, system))
    )

    for (let j = 0; j < batch.length; j++) {
      const settled = batchResults[j]
      if (settled.status === 'fulfilled') {
        results.push(settled.value)
      } else {
        results.push({
          systemId: batch[j].id,
          brand: batch[j].brand,
          ok: false,
          error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
        })
        // Record poll error on the system row
        await typedSupabase
          .from('monitoring_systems')
          .update({
            poll_error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            last_polled_at: new Date().toISOString(),
          })
          .eq('id', batch[j].id)
      }
    }
  }

  return results
}

async function processSingleSystem(
  supabase: AnySupabaseClient,
  system: MonitoringSystem
): Promise<CollectorResult> {
  const adapter = getAdapter(system.brand)

  // Resolve credentials: the system's own key wins; otherwise fall back to the
  // shared brand account it links to.
  const account = Array.isArray(system.brand_account) ? system.brand_account[0] : system.brand_account
  const encrypted = system.credentials ?? account?.credentials ?? null
  if (!encrypted) {
    throw new AdapterError('No credentials — set a key on the system or its brand connection', system.brand, false)
  }
  const credentials: BrandCredentials = decryptCredentialsLoose(encrypted)
  if (Object.keys(credentials).length === 0) {
    throw new AdapterError('Failed to decrypt credentials', system.brand, false)
  }

  // Fetch from brand API
  const reading: NormalisedReading = await adapter.fetchReading(
    credentials,
    system.plant_id,
    system.device_sn
  )

  // Persist reading
  const { error: insertError } = await supabase
    .from('monitoring_readings')
    .insert({
      system_id:        system.id,
      recorded_at:      reading.recorded_at,
      pv_power_w:       reading.pv_power_w,
      battery_power_w:  reading.battery_power_w,
      grid_power_w:     reading.grid_power_w,
      load_power_w:     reading.load_power_w,
      battery_soc_pct:  reading.battery_soc_pct,
      battery_voltage_v: reading.battery_voltage_v,
      grid_frequency_hz: reading.grid_frequency_hz,
      inverter_temp_c:   reading.inverter_temp_c,
      pv_strings:       reading.pv_strings,
      fault_codes:      reading.fault_codes,
      device_state:     reading.device_state,
      raw_payload:      reading.raw_payload,
    })

  if (insertError) throw new Error(`Failed to insert reading: ${insertError.message}`)

  // Update last_polled_at and clear any previous error
  await supabase
    .from('monitoring_systems')
    .update({ last_polled_at: reading.recorded_at, poll_error: null })
    .eq('id', system.id)

  // Run alert checks for this system
  await runAlertEngine(supabase, system.id, reading)

  return { systemId: system.id, brand: system.brand, ok: true }
}
