import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PDFDocument } from 'pdf-lib'
import { COMBINED_MARKER_RE } from '@/lib/finance/types'

export const runtime = 'nodejs'

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: new Response('Forbidden', { status: 403 }) }
  }
  return { user }
}

type DocRow = { id: string; file_url: string; file_name: string | null; mime_type: string | null }
type SourceKind = 'jpg' | 'png' | 'pdf' | 'unsupported'

function kindOf(doc: DocRow): SourceKind {
  const ext = (doc.file_name ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = doc.mime_type ?? ''
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (mime === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpg'
  if (mime === 'image/png' || ext === 'png') return 'png'
  return 'unsupported'
}

/** Append one source (image or PDF) as page(s) onto the merged document. */
async function appendSource(out: PDFDocument, bytes: Uint8Array, kind: SourceKind) {
  if (kind === 'pdf') {
    const src = await PDFDocument.load(bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
    return
  }
  const img = kind === 'jpg' ? await out.embedJpg(bytes) : await out.embedPng(bytes)
  // One page sized to the image so nothing is cropped or letterboxed.
  const page = out.addPage([img.width, img.height])
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
}

/**
 * Combine one or more scans into the primary document as a single multi-page
 * PDF. Page 1 + page 2 of the same invoice become one document, so it can only
 * be allocated / counted once.
 *
 * Body: { merge_ids: string[] }  — the OTHER documents to fold into `id`.
 * The primary keeps its supplier/total/date/line-items/allocation; the
 * absorbed scans' files are folded in and their rows deleted. We refuse if an
 * absorbed scan carries its own allocation or bank match, so nothing is lost.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const { id } = await params

  let body: { merge_ids?: unknown }
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
  const mergeIds = Array.isArray(body.merge_ids)
    ? [...new Set(body.merge_ids.filter((v): v is string => typeof v === 'string' && v !== id))]
    : []
  if (mergeIds.length === 0) return new Response('Pick at least one other page to combine', { status: 400 })

  const admin = createAdminClient()

  const { data: primary } = await admin
    .from('fin_documents').select('id, file_url, file_name, mime_type, notes').eq('id', id).maybeSingle()
  if (!primary) return new Response('Primary document not found', { status: 404 })

  const { data: secsRaw } = await admin
    .from('fin_documents').select('id, file_url, file_name, mime_type').in('id', mergeIds)
  const secondaries = (secsRaw ?? []) as DocRow[]
  if (secondaries.length !== mergeIds.length) {
    return new Response('One or more selected pages no longer exist', { status: 404 })
  }

  // Refuse if any absorbed scan carries data that would be lost on delete.
  const [{ data: allocs }, { data: matches }] = await Promise.all([
    admin.from('fin_allocations').select('document_id').in('document_id', mergeIds),
    admin.from('bank_transactions').select('id').in('matched_document_id', mergeIds),
  ])
  if ((allocs && allocs.length) || (matches && matches.length)) {
    return new Response(
      'One of the selected pages is already allocated or matched to a bank transaction. ' +
      'Clear that first, or make it the primary document instead.',
      { status: 409 },
    )
  }

  const ordered: DocRow[] = [primary as DocRow, ...mergeIds.map((mid) => secondaries.find((s) => s.id === mid)!)]

  // All sources must be embeddable (JPG / PNG / PDF).
  const bad = ordered.find((d) => kindOf(d) === 'unsupported')
  if (bad) {
    return new Response(
      `Combine supports JPG, PNG and PDF pages. "${bad.file_name ?? 'a selected file'}" is a different type — convert it first.`,
      { status: 422 },
    )
  }

  // Build the merged PDF in page order.
  let mergedBytes: Uint8Array
  let pageCount = 0
  try {
    const out = await PDFDocument.create()
    for (const d of ordered) {
      const { data: blob, error: dlErr } = await admin.storage.from('financial-docs').download(d.file_url)
      if (dlErr || !blob) throw new Error(`download ${d.id}`)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await appendSource(out, bytes, kindOf(d))
    }
    pageCount = out.getPageCount()
    mergedBytes = await out.save()
  } catch (e) {
    console.error('[finance/merge] build', e)
    return new Response('Could not combine the pages — check the files are valid', { status: 500 })
  }

  // Upload the merged PDF, then repoint the primary at it.
  const base = (primary.file_name ?? 'document').replace(/\.[^.]+$/, '')
  const mergedName = `${base}-combined.pdf`
  const mergedPath = `${crypto.randomUUID()}.pdf`
  const { error: upErr } = await admin.storage
    .from('financial-docs')
    .upload(mergedPath, Buffer.from(mergedBytes), { contentType: 'application/pdf', upsert: false })
  if (upErr) {
    console.error('[finance/merge] upload', upErr)
    return new Response('Could not save the combined document', { status: 500 })
  }

  // Rewrite the notes flags: the absorbed pages were the "duplicate", so drop
  // any duplicate warning, and stamp a (single, refreshed) combined marker with
  // the true page count. Other flags (e.g. low-confidence) are preserved.
  const existingFlags = ((primary as { notes?: string | null }).notes ?? '')
    .split('|').map((s) => s.trim()).filter(Boolean)
  const keptFlags = existingFlags.filter(
    (f) => !/duplicate/i.test(f) && !COMBINED_MARKER_RE.test(f),
  )
  const newNotes = [`📎 Combined — ${pageCount} pages`, ...keptFlags].join(' | ') || null

  const oldPrimaryPath = primary.file_url
  const { error: updErr } = await admin
    .from('fin_documents')
    .update({
      file_url: mergedPath,
      file_name: mergedName,
      mime_type: 'application/pdf',
      file_size: mergedBytes.length,
      notes: newNotes,
    })
    .eq('id', id)
  if (updErr) {
    console.error('[finance/merge] update', updErr)
    await admin.storage.from('financial-docs').remove([mergedPath]) // don't orphan the merged object
    return new Response('Could not update the document', { status: 500 })
  }

  // Point of no return passed — clean up old files and the absorbed rows.
  // Row deletes cascade to their line items; storage removal is best-effort.
  await admin.storage.from('financial-docs').remove([oldPrimaryPath, ...secondaries.map((s) => s.file_url)])
  const { error: delErr } = await admin.from('fin_documents').delete().in('id', mergeIds)
  if (delErr) {
    // The merge itself succeeded; surface but don't fail the request.
    console.error('[finance/merge] cleanup-delete', delErr)
  }

  return NextResponse.json({ ok: true, id, pages: ordered.length })
}
