import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Server-side helpers for the tokenized testimonial capture page (S7).
 *
 * The capture page is public — the customer follows a link from an email and is
 * never logged in — so every read and write goes through the service-role client
 * and is gated on the unguessable share_token, exactly like /q/[token].
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidTestimonialToken(token: string): boolean {
  return UUID_RE.test(token)
}

export interface TestimonialRow {
  id: string
  job_id: string
  customer_id: string | null
  share_token: string
  status: 'requested' | 'submitted' | 'approved' | 'declined'
  published: boolean
  rating: number | null
  headline: string | null
  body: string | null
  video_url: string | null
  photo_urls: string[]
  consent_publish: boolean
  consent_name: boolean
  consent_video: boolean
  display_name: string | null
  requested_at: string
  reminded_at: string | null
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  internal_notes: string | null
}

export interface TestimonialContext {
  testimonial: TestimonialRow
  /** Who the job was for, for the "Hi <name>" line. */
  customerName: string | null
  siteName: string | null
}

/** Load a testimonial by its public token, plus enough context to greet them. */
export async function getTestimonialByToken(token: string): Promise<TestimonialContext | null> {
  if (!isValidTestimonialToken(token)) return null
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('job_testimonials')
    .select('*')
    .eq('share_token', token)
    .maybeSingle()
  if (error || !data) return null
  const testimonial = data as TestimonialRow

  const { data: job } = await admin
    .from('jobs')
    .select('id, quote_request_id, site:sites(name)')
    .eq('id', testimonial.job_id)
    .maybeSingle()

  let customerName: string | null = null
  if (job?.quote_request_id) {
    const { data: req } = await admin
      .from('quote_requests')
      .select('customer_name')
      .eq('id', job.quote_request_id)
      .maybeSingle()
    customerName = req?.customer_name ?? null
  }

  const site = job?.site as { name?: string } | { name?: string }[] | null
  const siteName = (Array.isArray(site) ? site[0]?.name : site?.name) ?? null

  return { testimonial, customerName, siteName }
}

/** Customer contact for a job, resolved through its quote request. */
export async function getJobCustomerContact(jobId: string): Promise<{
  name: string | null
  email: string | null
  customerId: string | null
}> {
  const admin = createAdminClient()
  const { data: job } = await admin
    .from('jobs')
    .select('quote_request_id')
    .eq('id', jobId)
    .maybeSingle()
  if (!job?.quote_request_id) return { name: null, email: null, customerId: null }

  const { data: req } = await admin
    .from('quote_requests')
    .select('customer_name, customer_email, customer_id')
    .eq('id', job.quote_request_id)
    .maybeSingle()
  return {
    name: req?.customer_name ?? null,
    email: req?.customer_email ?? null,
    customerId: req?.customer_id ?? null,
  }
}
