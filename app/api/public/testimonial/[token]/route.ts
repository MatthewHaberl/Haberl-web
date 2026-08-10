import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl, getCompanySettings } from '@/lib/quotes/server'
import { getTestimonialByToken } from '@/lib/testimonials/server'
import { sendTestimonialSubmittedNotice } from '@/lib/email/testimonials'

export const runtime = 'nodejs'

const MAX_BODY = 4000
const MAX_HEADLINE = 140

/**
 * The customer submitting their review (S7). Public — no session; the
 * unguessable token in the URL is the authorisation, same as /q/[token].
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await getTestimonialByToken(token)
  if (!ctx) return new Response('This review link is not valid', { status: 404 })

  // Once reviewed, the record is closed — a customer can't quietly rewrite a
  // testimonial that has already been approved and published.
  if (ctx.testimonial.status === 'approved' || ctx.testimonial.status === 'declined') {
    return new Response('This review has already been submitted — thank you!', { status: 409 })
  }

  const body = await req.json().catch(() => null) as {
    rating?: number
    headline?: string
    body?: string
    displayName?: string
    consentPublish?: boolean
    consentName?: boolean
    consentVideo?: boolean
  } | null
  if (!body) return new Response('Could not read your review', { status: 400 })

  const rating = Number.isFinite(body.rating) ? Math.round(Number(body.rating)) : null
  if (rating !== null && (rating < 1 || rating > 5)) {
    return new Response('Rating must be between 1 and 5', { status: 400 })
  }
  const text = (body.body ?? '').trim()
  const hasMedia = Boolean(ctx.testimonial.video_url) || (ctx.testimonial.photo_urls?.length ?? 0) > 0
  // Something has to have been said — words, a star rating, or a video.
  if (!text && rating === null && !hasMedia) {
    return new Response('Please add a rating, a few words, or a video', { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('job_testimonials')
    .update({
      rating,
      headline: (body.headline ?? '').trim().slice(0, MAX_HEADLINE) || null,
      body: text.slice(0, MAX_BODY) || null,
      display_name: (body.displayName ?? '').trim() || null,
      consent_publish: body.consentPublish === true,
      consent_name: body.consentName === true,
      consent_video: body.consentVideo === true,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', ctx.testimonial.id)
    .select('id, rating')
    .single()
  if (error) {
    console.error('[public/testimonial] submit', error)
    return new Response('Could not save your review — please try again', { status: 500 })
  }

  // Tell the office, best-effort — a failed notification must not lose the review.
  try {
    const settings = await getCompanySettings(admin)
    const recipients: string[] = settings?.briefing_emails?.length
      ? settings.briefing_emails
      : settings?.contact_email ? [settings.contact_email] : []
    if (recipients.length > 0) {
      await sendTestimonialSubmittedNotice({
        to: recipients,
        customerName: ctx.customerName,
        rating: data.rating,
        jobId: ctx.testimonial.job_id,
        baseUrl: getBaseUrl(),
      })
    }
  } catch (e) {
    console.error('[public/testimonial] notice', e)
  }

  return NextResponse.json({ ok: true })
}
