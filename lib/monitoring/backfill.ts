/**
 * Historical backfill — pulls each monitoring system's past readings from its
 * brand cloud and writes them into monitoring_readings (reading_source =
 * 'backfill'). Walks BACKWARDS one UTC day at a time from today; a run of
 * consecutive empty days means we've crossed the install date and the job is
 * done. State lives in monitoring_backfill_jobs so a long pull resumes across
 * serverless invocations — the worker processes a bounded chunk of days per
 * call and the caller loops until status !== 'running'.
 *
 * Idempotent: rows upsert on (system_id, recorded_at), so re-running or
 * overlapping with the live collector never duplicates.
 */
import { createClient } from '@supabase/supabase-js'
import { getAdapter, AdapterError } from './adapters/index'
import { decryptCredentialsLoose } from './credentials'
import type { BrandCredentials, MonitoringBrand, NormalisedReading } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = ReturnType<typeof createClient<any>>

/** Consecutive empty days that mean "we've gone past the install date". */
const EMPTY_STREAK_LIMIT = 14
/** Never walk earlier than this many years back, as a hard safety floor. */
const FLOOR_YEARS = 6

const SYSTEM_SELECT =
  'id, site_id, brand, plant_id, device_sn, credentials, brand_account_id, ' +
  'brand_account:monitoring_brand_accounts(credentials), enabled'

interface MonitoringSystem {
  id: string
  brand: MonitoringBrand
  plant_id: string | null
  device_sn: string | null
  credentials: string | null
  brand_account: { credentials: string | null } | { credentials: string | null }[] | null
}

interface BackfillJob {
  id: string
  system_id: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  cursor_day: string
  floor_day: string
  earliest_day: string | null
  empty_streak: number
  days_done: number
  rows_written: number
}

function resolveCredentials(system: MonitoringSystem): BrandCredentials {
  const account = Array.isArray(system.brand_account) ? system.brand_account[0] : system.brand_account
  const encrypted = system.credentials ?? account?.credentials ?? null
  if (!encrypted) {
    throw new AdapterError('No credentials — set a key on the system or its brand connection', system.brand, false)
  }
  const creds = decryptCredentialsLoose(encrypted)
  if (Object.keys(creds).length === 0) {
    throw new AdapterError('Failed to decrypt credentials', system.brand, false)
  }
  return creds
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10)
const dayStartUtc = (day: string) => new Date(`${day}T00:00:00.000Z`)
const addDays = (day: string, n: number) => dayStr(new Date(dayStartUtc(day).getTime() + n * 86_400_000))

async function loadSystem(supabase: AnySupabaseClient, systemId: string): Promise<MonitoringSystem> {
  const { data, error } = await supabase.from('monitoring_systems').select(SYSTEM_SELECT).eq('id', systemId).single()
  if (error || !data) throw new Error('System not found')
  return data as unknown as MonitoringSystem
}

/** Turn a day's normalised readings into upsertable rows. */
function toRows(systemId: string, readings: NormalisedReading[]) {
  return readings.map((r) => ({
    system_id: systemId,
    recorded_at: r.recorded_at,
    pv_power_w: r.pv_power_w,
    battery_power_w: r.battery_power_w,
    grid_power_w: r.grid_power_w,
    load_power_w: r.load_power_w,
    battery_soc_pct: r.battery_soc_pct,
    battery_voltage_v: r.battery_voltage_v,
    grid_frequency_hz: r.grid_frequency_hz,
    inverter_temp_c: r.inverter_temp_c,
    pv_strings: r.pv_strings,
    fault_codes: r.fault_codes,
    device_state: r.device_state,
    raw_payload: r.raw_payload,
    reading_source: 'backfill' as const,
  }))
}

/**
 * Fetch + store one day. Returns the number of rows written (0 = empty day).
 */
async function backfillOneDay(
  supabase: AnySupabaseClient,
  system: MonitoringSystem,
  credentials: BrandCredentials,
  day: string,
): Promise<number> {
  const adapter = getAdapter(system.brand)
  if (!adapter.fetchHistory) {
    throw new AdapterError(`${system.brand} has no historical-data endpoint`, system.brand, false)
  }
  const readings = await adapter.fetchHistory(credentials, system.plant_id, system.device_sn, dayStartUtc(day))
  if (readings.length === 0) return 0

  const { error } = await supabase
    .from('monitoring_readings')
    .upsert(toRows(system.id, readings), { onConflict: 'system_id,recorded_at' })
  if (error) throw new Error(`Failed to store ${day}: ${error.message}`)
  return readings.length
}

/**
 * Start (or resume) a backfill for a system. If a job is already running it is
 * returned as-is. Otherwise a fresh job is seeded at yesterday → floor.
 */
export async function startBackfill(
  supabase: AnySupabaseClient,
  systemId: string,
  createdBy: string | null,
): Promise<BackfillJob> {
  const { data: existing } = await supabase
    .from('monitoring_backfill_jobs')
    .select('*')
    .eq('system_id', systemId)
    .eq('status', 'running')
    .maybeSingle()
  if (existing) return existing as BackfillJob

  // Confirm the system supports history before creating a job.
  const system = await loadSystem(supabase, systemId)
  const adapter = getAdapter(system.brand)
  if (!adapter.fetchHistory) {
    throw new AdapterError(`${system.brand} has no historical-data endpoint to backfill from`, system.brand, false)
  }

  const today = dayStr(new Date())
  const floor = addDays(today, -FLOOR_YEARS * 366)
  const { data, error } = await supabase
    .from('monitoring_backfill_jobs')
    .insert({ system_id: systemId, status: 'running', cursor_day: today, floor_day: floor, created_by: createdBy })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Could not start backfill: ${error?.message ?? 'unknown'}`)
  return data as BackfillJob
}

/**
 * Process up to `maxDays` days of the system's running job. Returns the updated
 * job; when status flips to 'done' the history is complete. Safe to call
 * repeatedly — each call advances the cursor and persists progress.
 */
export async function runBackfillChunk(
  supabase: AnySupabaseClient,
  jobId: string,
  maxDays = 10,
): Promise<BackfillJob> {
  const { data: jobRow, error: jobErr } = await supabase
    .from('monitoring_backfill_jobs').select('*').eq('id', jobId).single()
  if (jobErr || !jobRow) throw new Error('Backfill job not found')
  let job = jobRow as BackfillJob
  if (job.status !== 'running') return job

  const system = await loadSystem(supabase, job.system_id)
  let credentials: BrandCredentials
  try {
    credentials = resolveCredentials(system)
  } catch (err) {
    return finish(supabase, job, 'error', err instanceof Error ? err.message : String(err))
  }

  for (let i = 0; i < maxDays; i++) {
    if (job.cursor_day < job.floor_day) return finish(supabase, job, 'done')
    if (job.empty_streak >= EMPTY_STREAK_LIMIT) return finish(supabase, job, 'done')

    const day = job.cursor_day
    try {
      const rows = await backfillOneDay(supabase, system, credentials, day)
      job.days_done += 1
      job.rows_written += rows
      if (rows > 0) { job.empty_streak = 0; job.earliest_day = day }
      else job.empty_streak += 1
    } catch (err) {
      // A non-retryable credential/endpoint failure aborts; transient day errors
      // count as empty so one bad day can't wedge the whole walk.
      if (err instanceof AdapterError && !err.retryable) {
        return finish(supabase, job, 'error', err.message)
      }
      job.empty_streak += 1
    }
    job.cursor_day = addDays(day, -1)
  }

  return persist(supabase, job)
}

async function persist(supabase: AnySupabaseClient, job: BackfillJob): Promise<BackfillJob> {
  await supabase.from('monitoring_backfill_jobs').update({
    cursor_day: job.cursor_day, earliest_day: job.earliest_day, empty_streak: job.empty_streak,
    days_done: job.days_done, rows_written: job.rows_written, updated_at: new Date().toISOString(),
  }).eq('id', job.id)
  return job
}

async function finish(
  supabase: AnySupabaseClient, job: BackfillJob,
  status: 'done' | 'error' | 'cancelled', error?: string,
): Promise<BackfillJob> {
  job.status = status
  await supabase.from('monitoring_backfill_jobs').update({
    status, error: error ?? null, cursor_day: job.cursor_day, earliest_day: job.earliest_day,
    empty_streak: job.empty_streak, days_done: job.days_done, rows_written: job.rows_written,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id)
  return job
}

/**
 * Dry-run a single day without writing — used to validate brand endpoints and
 * parsing before committing to a full backfill. Returns parsed reading count +
 * a small sample.
 */
export async function previewBackfillDay(
  supabase: AnySupabaseClient, systemId: string, day: string,
): Promise<{ day: string; count: number; sample: NormalisedReading[] }> {
  const system = await loadSystem(supabase, systemId)
  const adapter = getAdapter(system.brand)
  if (!adapter.fetchHistory) {
    throw new AdapterError(`${system.brand} has no historical-data endpoint`, system.brand, false)
  }
  const credentials = resolveCredentials(system)
  const readings = await adapter.fetchHistory(credentials, system.plant_id, system.device_sn, dayStartUtc(day))
  return { day, count: readings.length, sample: readings.slice(0, 5) }
}
