import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess, canAccess } from '@/lib/auth/permissions'
import { parseZarAmount } from '@/lib/utils'
import { FIN_PAID_BY } from '@/lib/finance/types'

export const runtime = 'nodejs'

const MAX_BYTES = 25 * 1024 * 1024
// Phone camera output only — a receipt is a photo. PDFs and spreadsheets are a
// desk job and belong in Finance → Upload a document.
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic'])
const MAX_FILES = 10
const PAID_BY = new Set(FIN_PAID_BY.map((p) => p.value as string))

/**
 * Capture receipts from the field. Each photo becomes its own `fin_documents`
 * row with doc_type='receipt', so the office picks them up in the existing
 * Finance pipeline with nothing extra to build there.
 *
 * Storage writes go through the service role because the financial-docs bucket
 * is private and carries no storage policies (the pattern set in migration 047).
 * The *record* is written with the caller's own client, so the migration-139 RLS
 * policy is what actually decides whether a field worker may file it.
 *
 * A weak signal on site should not cost the whole batch: each photo is uploaded
 * independently and the response reports which ones failed, so the app can keep
 * the successes and ask only for the rest again.
 */
export async function POST(req: Request) {
  const access = await getUserAccess()
  if (!access) return new Response('Unauthorized', { status: 401 })
  if (!canAccess(access, 'receipts')) return new Response('Forbidden', { status: 403 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return new Response('Add at least one photo', { status: 400 })
  if (files.length > MAX_FILES) {
    return new Response(`Up to ${MAX_FILES} photos at a time`, { status: 400 })
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) return new Response(`${f.name} is over 25 MB`, { status: 400 })
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return new Response(`${f.name} is not a photo — use your camera, or a JPG/PNG/HEIC`, { status: 400 })
    }
  }

  const str = (k: string) => {
    const v = form.get(k)
    const s = typeof v === 'string' ? v.trim() : ''
    return s.length ? s : null
  }

  const paidByRaw = String(form.get('paid_by') || 'unknown')
  const paid_by = PAID_BY.has(paidByRaw) ? paidByRaw : 'unknown'

  // The amount belongs to one slip. On a batch upload it is left blank and
  // filled in per receipt afterwards, rather than stamped onto all of them.
  let total_cents: number | null = null
  const totalRaw = str('total')
  if (totalRaw && files.length === 1) {
    // en-ZA amounts use a comma decimal ("1 500,50") — parseZarAmount handles it.
    const n = parseZarAmount(totalRaw)
    if (Number.isFinite(n)) total_cents = Math.round(n * 100)
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const ids: string[] = []
  const failed: string[] = []

  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `receipts/${crypto.randomUUID()}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await admin.storage
      .from('financial-docs')
      .upload(path, bytes, { contentType: file.type || undefined, upsert: false })
    if (upErr) {
      console.error('[receipts] upload', upErr)
      failed.push(file.name)
      continue
    }

    const { data: row, error: insErr } = await supabase
      .from('fin_documents')
      .insert({
        doc_type: 'receipt',
        supplier_name: str('supplier_name'),
        doc_date: str('doc_date'),
        total_cents,
        notes: str('notes'),
        job_id: str('job_id'),
        paid_by,
        file_url: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        uploaded_by: access.user.id,
      })
      .select('id')
      .single()

    if (insErr || !row) {
      console.error('[receipts] insert', insErr)
      // Don't leave the photo orphaned in the bucket with no record pointing at it.
      await admin.storage.from('financial-docs').remove([path])
      failed.push(file.name)
      continue
    }
    ids.push(row.id)
  }

  if (ids.length === 0) {
    return new Response('Could not save the receipt — check your signal and try again', { status: 500 })
  }
  return NextResponse.json({ ok: true, ids, failed })
}
