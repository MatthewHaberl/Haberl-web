import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTestimonialByToken } from '@/lib/testimonials/server'

export const runtime = 'nodejs'

// A phone video is the whole point of this feature, so the cap is generous —
// but not so generous that a serverless upload times out.
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_PHOTOS = 6

const VIDEO_EXT: Record<string, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v',
}
const PHOTO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
}

/** Customer uploads a video or photos with their review. Private bucket. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await getTestimonialByToken(token)
  if (!ctx) return new Response('This review link is not valid', { status: 404 })
  if (ctx.testimonial.status === 'approved' || ctx.testimonial.status === 'declined') {
    return new Response('This review is already closed', { status: 409 })
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    const entry = form.get('file')
    if (entry instanceof File) file = entry
  } catch {
    /* falls through */
  }
  if (!file || file.size === 0) return new Response('No file received', { status: 400 })

  const isVideo = file.type.startsWith('video/')
  const ext = isVideo ? VIDEO_EXT[file.type] : PHOTO_EXT[file.type]
  if (!ext) return new Response('Please upload a photo (JPG/PNG) or a video (MP4/MOV)', { status: 400 })
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES
  if (file.size > max) {
    return new Response(`That file is too large — keep it under ${Math.round(max / 1024 / 1024)} MB`, { status: 400 })
  }
  if (!isVideo && (ctx.testimonial.photo_urls?.length ?? 0) >= MAX_PHOTOS) {
    return new Response(`You can add up to ${MAX_PHOTOS} photos`, { status: 400 })
  }

  const admin = createAdminClient()
  const path = `${ctx.testimonial.id}/${isVideo ? 'video' : 'photo'}-${Date.now()}.${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await admin.storage
    .from('testimonials')
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (uploadError) {
    console.error('[public/testimonial/media] upload', uploadError)
    return new Response('Upload failed — please try again', { status: 500 })
  }

  // One video per testimonial (a replacement supersedes the old object, which is
  // removed so we aren't storing footage nobody will ever watch).
  if (isVideo) {
    const previous = ctx.testimonial.video_url
    await admin.from('job_testimonials').update({ video_url: path }).eq('id', ctx.testimonial.id)
    if (previous && previous !== path) {
      await admin.storage.from('testimonials').remove([previous])
    }
  } else {
    await admin
      .from('job_testimonials')
      .update({ photo_urls: [...(ctx.testimonial.photo_urls ?? []), path] })
      .eq('id', ctx.testimonial.id)
  }

  return NextResponse.json({ ok: true, kind: isVideo ? 'video' : 'photo', path })
}
