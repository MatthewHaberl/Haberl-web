'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Star, MessageSquareQuote, Loader2, Copy, Check, ThumbsUp, ThumbsDown, Video } from 'lucide-react'

export interface TestimonialSummary {
  id: string
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
  submitted_at: string | null
}

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  requested: 'warning', submitted: 'default', approved: 'success', declined: 'destructive',
}

/**
 * Testimonial step of the job journey (S7): ask at follow-up, then review what
 * came back. Publishing is gated on the customer's own consent — the API
 * refuses it regardless, and the button reflects that here so nobody is
 * surprised by a 409.
 */
export function TestimonialPanel({
  jobId, testimonial, baseUrl, videoSignedUrl,
}: {
  jobId: string
  testimonial: TestimonialSummary | null
  baseUrl: string
  /** Short-lived signed URL — the bucket is private. */
  videoSignedUrl: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const link = testimonial ? `${baseUrl.replace(/\/$/, '')}/testimonial/${testimonial.share_token}` : ''

  async function request() {
    setBusy(true); setError(''); setMessage('')
    try {
      const res = await fetch(`/api/jobs/${jobId}/testimonial`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setMessage(
        data.alreadySubmitted ? 'They have already left a review.'
        : data.emailed ? 'Review request emailed.'
        : data.reason ?? 'Request created — send the link yourself.',
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request')
    } finally {
      setBusy(false)
    }
  }

  async function review(patch: { status?: 'approved' | 'declined'; published?: boolean }) {
    setBusy(true); setError(''); setMessage('')
    try {
      const res = await fetch(`/api/jobs/${jobId}/testimonial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquareQuote className="h-4 w-4 text-accent" />
            <div>
              <p className="text-sm font-semibold">Customer review</p>
              <p className="text-xs text-muted-foreground">
                {testimonial
                  ? `Asked ${new Date(testimonial.requested_at).toLocaleDateString('en-ZA')}`
                  : 'Ask at follow-up, while they’re still pleased with it'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {testimonial && <Badge variant={STATUS_VARIANT[testimonial.status]}>{testimonial.status}</Badge>}
            {testimonial?.published && <Badge variant="success">published</Badge>}
            <Button variant={testimonial ? 'outline' : 'accent'} size="sm" onClick={request} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareQuote className="h-3.5 w-3.5" />}
              {testimonial ? 'Send a reminder' : 'Request a review'}
            </Button>
          </div>
        </div>

        {testimonial && (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              className="h-8 flex-1 rounded-md border border-border bg-muted px-2 font-mono text-[11px]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] hover:bg-muted"
              title="Copy the link to send on WhatsApp"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {testimonial && testimonial.status !== 'requested' && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
            {testimonial.rating != null && (
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`h-4 w-4 ${n <= testimonial.rating! ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                ))}
              </div>
            )}
            {testimonial.headline && <p className="text-sm font-semibold text-foreground">{testimonial.headline}</p>}
            {testimonial.body && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{testimonial.body}</p>}

            {videoSignedUrl && (
              <video controls preload="metadata" className="mt-1 w-full max-w-sm rounded-md border border-border" src={videoSignedUrl} />
            )}
            {testimonial.video_url && !videoSignedUrl && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Video className="h-3.5 w-3.5" /> Video attached — reload to play it.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <span className={`rounded-full px-2 py-0.5 font-medium ${testimonial.consent_publish ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                {testimonial.consent_publish ? 'may publish' : 'private — do not publish'}
              </span>
              {testimonial.consent_publish && (
                <span className={`rounded-full px-2 py-0.5 font-medium ${testimonial.consent_name ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {testimonial.consent_name ? `credit as ${testimonial.display_name || 'their name'}` : 'anonymous only'}
                </span>
              )}
              {testimonial.video_url && (
                <span className={`rounded-full px-2 py-0.5 font-medium ${testimonial.consent_video ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {testimonial.consent_video ? 'may use video' : 'video: internal only'}
                </span>
              )}
            </div>

            {testimonial.status === 'submitted' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="accent" size="sm" onClick={() => review({ status: 'approved' })} disabled={busy}>
                  <ThumbsUp className="h-3.5 w-3.5" /> Approve
                </Button>
                <Button variant="ghost" size="sm" onClick={() => review({ status: 'declined' })} disabled={busy}>
                  <ThumbsDown className="h-3.5 w-3.5" /> Decline
                </Button>
              </div>
            )}
            {testimonial.status === 'approved' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant={testimonial.published ? 'ghost' : 'accent'}
                  size="sm"
                  disabled={busy || !testimonial.consent_publish}
                  title={testimonial.consent_publish ? undefined : 'This customer did not agree to their review being published'}
                  onClick={() => review({ published: !testimonial.published })}
                >
                  {testimonial.published ? 'Unpublish' : 'Publish'}
                </Button>
              </div>
            )}
          </div>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
