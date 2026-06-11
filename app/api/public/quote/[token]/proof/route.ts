import { NextResponse } from 'next/server'
import { sendAdminNotice } from '@/lib/email/quotes'
import { getBaseUrl, getCompanySettings, getQuoteByToken } from '@/lib/quotes/server'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/** Proof-of-payment upload into the private payment-proofs bucket. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { supabase, quote } = await getQuoteByToken(token)
  if (!quote) return new Response('Quote not found', { status: 404 })
  if (quote.status !== 'accepted') {
    return new Response('Accept the quote first, then upload proof of payment', { status: 409 })
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, deposit_confirmed_at')
    .eq('quote_request_id', quote.id)
    .maybeSingle()
  if (!job) return new Response('No job found for this quote yet — please contact us', { status: 409 })
  if (job.deposit_confirmed_at) {
    return new Response('Your deposit is already confirmed — nothing more to upload', { status: 409 })
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    const entry = form.get('file')
    if (entry instanceof File) file = entry
  } catch {
    /* falls through to the null check */
  }
  if (!file) return new Response('No file received', { status: 400 })
  if (file.size === 0 || file.size > MAX_BYTES) {
    return new Response('File must be under 10 MB', { status: 400 })
  }
  const ext = EXT_BY_TYPE[file.type]
  if (!ext) return new Response('Please upload a photo (JPG/PNG) or PDF', { status: 400 })

  const path = `${quote.id}/${Date.now()}.${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (uploadError) {
    console.error('[public/proof] upload', uploadError)
    return new Response('Upload failed — please try again', { status: 500 })
  }

  const { error: jobError } = await supabase
    .from('jobs')
    .update({
      deposit_proof_url: path,
      deposit_proof_uploaded_at: new Date().toISOString(),
    })
    .eq('id', job.id)
  if (jobError) {
    console.error('[public/proof] job update', jobError)
    return new Response('Upload saved but could not be linked — please contact us', { status: 500 })
  }

  try {
    const settings = await getCompanySettings(supabase)
    await sendAdminNotice(
      settings?.contact_email ?? null,
      `Proof of payment uploaded — ${quote.quote_number ?? quote.customer_name}`,
      [
        `<strong>${quote.customer_name}</strong> uploaded proof of payment for quote <strong>${quote.quote_number ?? ''}</strong>.`,
        'Review it on the job page and confirm the deposit to advance the pipeline.',
      ],
      `${getBaseUrl()}/portal/employee/jobs/${job.id}`,
      'Review & confirm deposit',
    )
  } catch (err) {
    console.error('[public/proof] admin notice failed', err)
  }

  return NextResponse.json({ ok: true })
}
