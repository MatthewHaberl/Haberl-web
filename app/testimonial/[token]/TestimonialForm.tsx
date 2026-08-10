'use client'

import { useRef, useState } from 'react'
import { Star, Video, ImagePlus, Loader2, Check, X } from 'lucide-react'

/**
 * The customer's side of S7. Deliberately short: stars, a few words, and an
 * optional phone video — the thing that actually persuades the next customer.
 *
 * Consent is opt-in and split, so someone can give honest private feedback
 * without it ending up on the website, and can approve the words but not their
 * name, or the words but not their face.
 */
export function TestimonialForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [displayName, setDisplayName] = useState(defaultName)
  const [consentPublish, setConsentPublish] = useState(false)
  const [consentName, setConsentName] = useState(false)
  const [consentVideo, setConsentVideo] = useState(false)

  const [videoName, setVideoName] = useState<string | null>(null)
  const [photoCount, setPhotoCount] = useState(0)
  const [uploading, setUploading] = useState<'video' | 'photo' | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const videoInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  async function upload(file: File, kind: 'video' | 'photo') {
    setUploading(kind)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/public/testimonial/${token}/media`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      if (kind === 'video') { setVideoName(file.name); setConsentVideo(true) }
      else setPhotoCount((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/public/testimonial/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: rating || undefined,
          headline, body, displayName,
          consentPublish, consentName, consentVideo,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your review')
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-success/40 bg-success/5 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 text-success" /> Sent — thank you.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {consentPublish
            ? 'We’ll have a look and let you know if we use it anywhere.'
            : 'We’ve kept this private, as you asked. It goes straight to Matthew.'}
        </p>
      </div>
    )
  }

  const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

  return (
    <div className="flex flex-col gap-5">
      {/* Stars */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">How did we do?</span>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className="p-1"
            >
              <Star
                className={`h-8 w-8 transition-colors ${
                  (hover || rating) >= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">In a sentence</span>
        <input
          className={field}
          value={headline}
          maxLength={140}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Load-shedding stopped being our problem"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Anything else you&apos;d like to say?</span>
        <textarea
          className={field}
          rows={5}
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What made the difference? How did the install go? Anything we could do better?"
        />
        <span className="text-xs text-muted-foreground">
          If something isn&apos;t right, please say so here — we&apos;d rather hear it from you.
        </span>
      </label>

      {/* Video — the ask that matters most */}
      <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/5 p-4">
        <p className="text-sm font-medium text-foreground">A quick video? (optional)</p>
        <p className="text-xs text-muted-foreground">
          Twenty seconds on your phone, standing next to the inverter, is worth more than anything
          we could write. No editing, no pressure — however it comes out is perfect.
        </p>
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, 'video') }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => videoInput.current?.click()}
            disabled={uploading !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-50"
          >
            {uploading === 'video' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {videoName ? 'Replace video' : 'Record or choose a video'}
          </button>
          {videoName && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3.5 w-3.5" /> {videoName}
            </span>
          )}
        </div>
      </div>

      {/* Photos */}
      <div className="flex flex-col gap-2">
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, 'photo') }}
        />
        <button
          type="button"
          onClick={() => photoInput.current?.click()}
          disabled={uploading !== null}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
        >
          {uploading === 'photo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Add a photo{photoCount > 0 ? ` (${photoCount} added)` : ''}
        </button>
      </div>

      {/* Consent — opt-in, and separable */}
      <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
        <p className="text-sm font-medium text-foreground">What may we do with this?</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consentPublish} onChange={(e) => setConsentPublish(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>You may use my review publicly (website, social media).</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consentName} onChange={(e) => setConsentName(e.target.checked)} className="mt-0.5 h-4 w-4" disabled={!consentPublish} />
          <span className={consentPublish ? '' : 'text-muted-foreground'}>You may use my name with it.</span>
        </label>
        {videoName && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={consentVideo} onChange={(e) => setConsentVideo(e.target.checked)} className="mt-0.5 h-4 w-4" disabled={!consentPublish} />
            <span className={consentPublish ? '' : 'text-muted-foreground'}>You may use my video.</span>
          </label>
        )}
        {consentName && (
          <label className="mt-1 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Name to credit</span>
            <input className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Michelle S., Fourways" />
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Leave these unticked and your feedback stays private — it just goes to Matthew.
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <X className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || uploading !== null}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Send my review
      </button>
    </div>
  )
}
