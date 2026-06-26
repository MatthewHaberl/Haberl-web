/**
 * Monitoring collector — called by the cron endpoint every 5 minutes.
 * Reads all enabled monitoring_systems, fetches data from each brand adapter,
 * writes a normalised reading to monitoring_readings, runs the alert engine.
 */
import { createClient } from '@supabase/supabase-js'
import { getAdapter, AdapterError } from './adapters/index'
import { decryptCredentialsLoose } from './credentials'
import { runAlertEngine } from './alert-engine'
import type { BrandCredentials, MonitoringBrand, NormalisedReading, SettingsReadResult } from './types'

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

/** Columns a poll needs, including the shared brand-account credentials fallback. */
const SYSTEM_SELECT =
  'id, site_id, brand, plant_id, device_sn, credentials, brand_account_id, brand_account:monitoring_brand_accounts(credentials), enabled'

export async function runCollector(): Promise<CollectorResult[]> {
  // Use service role to bypass RLS for server-side collection
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: systems, error } = await supabase
    .from('monitoring_systems')
    .select(SYSTEM_SELECT)
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

/**
 * Poll a single system on demand (e.g. the "Poll now" button), using whatever
 * Supabase client the caller provides — typically the logged-in staff user's
 * client, so it relies on RLS rather than the service-role key. Records the
 * poll_error on the row if the fetch fails (mirroring the cron collector).
 */
export async function pollSystemNow(
  supabase: AnySupabaseClient,
  systemId: string
): Promise<CollectorResult> {
  const { data: system, error } = await supabase
    .from('monitoring_systems')
    .select(SYSTEM_SELECT)
    .eq('id', systemId)
    .single()

  if (error || !system) throw new Error('System not found')

  const typed = system as MonitoringSystem
  try {
    return await processSingleSystem(supabase, typed)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('monitoring_systems')
      .update({ poll_error: message, last_polled_at: new Date().toISOString() })
      .eq('id', systemId)
    return { systemId, brand: typed.brand, ok: false, error: message }
  }
}

/**
 * Poll every enabled system on demand (the fleet-page "Poll all" button), using
 * the caller's Supabase client so it runs under the staff user's RLS rather than
 * the service-role key. Batches to avoid hammering brand APIs at once. Each
 * system records its own poll_error via pollSystemNow, so one failure never
 * blocks the rest.
 */
export async function pollAllNow(supabase: AnySupabaseClient): Promise<CollectorResult[]> {
  const { data: systems, error } = await supabase
    .from('monitoring_systems')
    .select('id, brand')
    .eq('enabled', true)

  if (error) throw new Error(`Failed to fetch monitoring systems: ${error.message}`)
  if (!systems?.length) return []

  const rows = systems as { id: string; brand: MonitoringBrand }[]
  const results: CollectorResult[] = []
  const batchSize = 5
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const settled = await Promise.allSettled(batch.map((s) => pollSystemNow(supabase, s.id)))
    for (let j = 0; j < batch.length; j++) {
      const r = settled[j]
      if (r.status === 'fulfilled') {
        results.push(r.value)
      } else {
        results.push({
          systemId: batch[j].id,
          brand: batch[j].brand,
          ok: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        })
      }
    }
  }
  return results
}

/** Resolve a system's credentials (own key, else linked brand account). */
function resolveCredentials(system: MonitoringSystem): BrandCredentials {
  const account = Array.isArray(system.brand_account) ? system.brand_account[0] : system.brand_account
  const encrypted = system.credentials ?? account?.credentials ?? null
  if (!encrypted) {
    throw new AdapterError('No credentials — set a key on the system or its brand connection', system.brand, false)
  }
  const credentials = decryptCredentialsLoose(encrypted)
  if (Object.keys(credentials).length === 0) {
    throw new AdapterError('Failed to decrypt credentials', system.brand, false)
  }
  return credentials
}

/**
 * Read a system's current CONFIGURATION from its brand cloud (the "Refresh from
 * cloud" action). Throws AdapterError when the brand has no settings-read
 * adapter — the caller falls back to manual capture.
 */
export async function fetchSystemSettings(
  supabase: AnySupabaseClient,
  systemId: string,
): Promise<SettingsReadResult> {
  const { data: system, error } = await supabase
    .from('monitoring_systems')
    .select(SYSTEM_SELECT)
    .eq('id', systemId)
    .single()

  if (error || !system) throw new Error('System not found')
  const typed = system as MonitoringSystem
  const adapter = getAdapter(typed.brand)
  if (!adapter.fetchSettings) {
    throw new AdapterError(`Reading settings from the ${typed.brand} cloud isn't supported yet — capture them manually`, typed.brand, false)
  }
  const credentials = resolveCredentials(typed)
  return adapter.fetchSettings(credentials, typed.plant_id, typed.device_sn)
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

  // Persist reading. Upsert on (system_id, recorded_at) so it can never collide
  // with a backfilled/imported row at the same instant.
  const { error: insertError } = await supabase
    .from('monitoring_readings')
    .upsert({
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
      reading_source:   'live',
    }, { onConflict: 'system_id,recorded_at' })

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
