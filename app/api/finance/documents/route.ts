import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf', 'csv', 'xls', 'xlsx'])
const DOC_TYPES = new Set(['supplier_invoice', 'receipt', 'sales_invoice', 'pro_forma', 'credit_note', 'supplier_statement', 'bank_statement', 'other'])

/** Upload a financial document into the private financial-docs bucket. Manager/admin only. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const entry = form.get('file')
  if (!(entry instanceof File) || entry.size === 0) {
    return new Response('No file received', { status: 400 })
  }
  if (entry.size > MAX_BYTES) {
    return new Response('File must be under 25 MB', { status: 400 })
  }
  const ext = (entry.name.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    return new Response('Unsupported file type — use an image, PDF, CSV or Excel file', { status: 400 })
  }

  const str = (k: string) => {
    const v = form.get(k)
    const s = typeof v === 'string' ? v.trim() : ''
    return s.length ? s : null
  }
  const docTypeRaw = String(form.get('doc_type') || 'other')
  const doc_type = DOC_TYPES.has(docTypeRaw) ? docTypeRaw : 'other'

  let total_cents: number | null = null
  const totalRaw = str('total')
  if (totalRaw) {
    const n = Number(totalRaw.replace(/[^0-9.]/g, ''))
    if (Number.isFinite(n)) total_cents = Math.round(n * 100)
  }

  const admin = createAdminClient()
  const path = `${crypto.randomUUID()}.${ext}`
  const bytes = Buffer.from(await entry.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from('financial-docs')
    .upload(path, bytes, { contentType: entry.type || undefined, upsert: false })
  if (upErr) {
    console.error('[finance/docs] upload', upErr)
    return new Response('Upload failed — please try again', { status: 500 })
  }

  const { data: row, error: insErr } = await admin
    .from('fin_documents')
    .insert({
      doc_type,
      supplier_name: str('supplier_name'),
      doc_number: str('doc_number'),
      doc_date: str('doc_date'),
      total_cents,
      notes: str('notes'),
      customer_id: str('customer_id'),
      file_url: path,
      file_name: entry.name,
      mime_type: entry.type || null,
      file_size: entry.size,
      uploaded_by: user.id,
    })
    .select('id')
    .single()
  if (insErr) {
    console.error('[finance/docs] insert', insErr)
    await admin.storage.from('financial-docs').remove([path]) // don't orphan the object
    return new Response('Could not save the document record', { status: 500 })
  }

  return NextResponse.json({ ok: true, id: row?.id })
}
