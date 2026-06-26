import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { parseReadingsCsv } from '@/lib/monitoring/import-readings'

export const maxDuration = 60  // large CSV exports can hold months of per-minute rows

/**
 * POST (multipart) — import a per-minute readings CSV exported from the brand
 * portal. Returns the column mapping we inferred plus how many rows landed.
 * Pass ?dryRun=1 to validate the mapping without writing.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a CSV file to import' }, { status: 400 })
  }

  const text = await file.text()
  const { rows, headers, mapping, unmapped, skipped } = parseReadingsCsv(text)

  const mappedFields = Object.keys(mapping).filter((k) => k !== 'time')
  if (!mapping.time || mappedFields.length === 0) {
    return NextResponse.json({
      ok: false,
      error: 'Could not recognise a timestamp column and at least one data column',
      headers, mapping, unmapped,
    }, { status: 422 })
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, parsed: rows.length, skipped, mapping, unmapped, sample: rows.slice(0, 5) })
  }

  // Upsert in batches so one big file doesn't blow the statement size.
  let written = 0
  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map((r) => ({ ...r, system_id: systemId }))
    const { error } = await supabase
      .from('monitoring_readings')
      .upsert(batch, { onConflict: 'system_id,recorded_at' })
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, written, mapping }, { status: 500 })
    }
    written += batch.length
  }

  return NextResponse.json({ ok: true, written, skipped, mapping, unmapped })
}
