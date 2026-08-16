import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SUPPLIER_QUOTES_BUCKET,
  parseAndStoreLines,
} from '@/lib/quotes/supplier-quote-parse'

export const runtime = 'nodejs'
// The table reader is fast; the AI fallback (scans only) needs the headroom.
export const maxDuration = 180

const MAX_BYTES = 25 * 1024 * 1024
const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Upload a supplier quote (PDF or photo) against a quote_request and parse it
 * into supplier_quote_lines. With no file, creates a manual (typed-in) supplier
 * quote. Manager/admin only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { id: quoteId } = await params
  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('quote_requests').select('id').eq('id', quoteId).maybeSingle()
  if (!quote) return new Response('Quote not found', { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return new Response('Invalid form data', { status: 400 })
  }
  const str = (k: string) => {
    const v = form.get(k)
    const s = typeof v === 'string' ? v.trim() : ''
    return s.length ? s : null
  }
  const supplier = str('supplier')
  const entry = form.get('file')

  // No file → a manual supplier quote the user types lines into.
  if (!(entry instanceof File) || entry.size === 0) {
    if (!supplier) return new Response('Give the supplier a name or attach the quote file', { status: 400 })
    const { data: row, error } = await admin
      .from('supplier_quotes')
      .insert({ quote_request_id: quoteId, supplier, status: 'manual', created_by: user.id })
      .select('*')
      .single()
    if (error) {
      console.error('[supplier-quotes] manual insert', error)
      return new Response('Could not create the supplier quote', { status: 500 })
    }
    return NextResponse.json({ ok: true, quote: row, lines: [] })
  }

  if (entry.size > MAX_BYTES) return new Response('File must be under 25 MB', { status: 400 })
  const mime = entry.type || 'application/pdf'
  const ext = EXT_BY_MIME[mime]
  if (!ext) return new Response('Unsupported file type — upload a PDF or a photo (JPG/PNG/WebP)', { status: 400 })

  const path = `${quoteId}/${crypto.randomUUID()}.${ext}`
  const bytes = Buffer.from(await entry.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from(SUPPLIER_QUOTES_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false })
  if (upErr) {
    console.error('[supplier-quotes] upload', upErr)
    return new Response('Upload failed — please try again', { status: 500 })
  }

  const { data: row, error: insErr } = await admin
    .from('supplier_quotes')
    .insert({
      quote_request_id: quoteId,
      supplier: supplier ?? '',
      source_filename: entry.name,
      storage_path: path,
      mime_type: mime,
      status: 'uploaded',
      created_by: user.id,
    })
    .select('*')
    .single()
  if (insErr || !row) {
    console.error('[supplier-quotes] insert', insErr)
    await admin.storage.from(SUPPLIER_QUOTES_BUCKET).remove([path]) // don't orphan the object
    return new Response('Could not save the supplier quote record', { status: 500 })
  }

  // Read the document inline: PDFs go through the table reader (no API key
  // needed); scans/photos fall back to AI when it's configured.
  await parseAndStoreLines(admin, row)

  const [{ data: fresh }, { data: lines }] = await Promise.all([
    admin.from('supplier_quotes').select('*').eq('id', row.id).single(),
    admin.from('supplier_quote_lines').select('*').eq('supplier_quote_id', row.id).order('line_no'),
  ])
  return NextResponse.json({ ok: true, quote: fresh ?? row, lines: lines ?? [] })
}
