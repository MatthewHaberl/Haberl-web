import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStaffDocType } from '@/lib/staff/documents'

export const runtime = 'nodejs'

const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf', 'doc', 'docx'])

/**
 * Upload one piece of a staff member's paperwork into the private staff-docs
 * bucket. Manager/admin only — this table holds IDs, medicals and warnings.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const staffId = String(form.get('staff_id') || '')
  if (!staffId) return new Response('Missing staff member', { status: 400 })

  const entry = form.get('file')
  if (!(entry instanceof File) || entry.size === 0) {
    return new Response('Choose a file to upload', { status: 400 })
  }
  if (entry.size > MAX_BYTES) {
    return new Response('File must be under 25 MB', { status: 400 })
  }
  const ext = (entry.name.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    return new Response('Unsupported file type — use a photo, PDF or Word document', { status: 400 })
  }

  const str = (k: string) => {
    const v = form.get(k)
    const s = typeof v === 'string' ? v.trim() : ''
    return s.length ? s : null
  }
  const docTypeRaw = String(form.get('doc_type') || 'other')
  const doc_type = isStaffDocType(docTypeRaw) ? docTypeRaw : 'other'

  const admin = createAdminClient()

  // The staff row must exist before a file is parked against it, or a typo'd
  // id leaves an orphan object in the bucket that nothing ever cleans up.
  const { data: person } = await admin
    .from('staff')
    .select('id')
    .eq('id', staffId)
    .maybeSingle()
  if (!person) return new Response('Staff member not found', { status: 404 })

  // Foldered per person so the bucket stays navigable in the Supabase console.
  const path = `${staffId}/${crypto.randomUUID()}.${ext}`
  const bytes = Buffer.from(await entry.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from('staff-docs')
    .upload(path, bytes, { contentType: entry.type || undefined, upsert: false })
  if (upErr) {
    console.error('[staff/docs] upload', upErr)
    return new Response('Upload failed — please try again', { status: 500 })
  }

  const { data: row, error: insErr } = await admin
    .from('staff_documents')
    .insert({
      staff_id: staffId,
      doc_type,
      // Never nameless: fall back to the file's own name.
      title: str('title') ?? entry.name,
      doc_number: str('doc_number'),
      issued_on: str('issued_on'),
      expires_on: str('expires_on'),
      notes: str('notes'),
      file_url: path,
      file_name: entry.name,
      mime_type: entry.type || null,
      file_size: entry.size,
      uploaded_by: user.id,
    })
    .select('id')
    .single()
  if (insErr) {
    console.error('[staff/docs] insert', insErr)
    await admin.storage.from('staff-docs').remove([path]) // don't orphan the object
    return new Response('Could not save the document record', { status: 500 })
  }

  return NextResponse.json({ ok: true, id: row?.id })
}
