'use client'

import { useCallback, useEffect, useState } from 'react'
import { ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Product photography, shared by everything that shows a catalog item (W53):
 * the quote BOM, the picker, the job material list, the public quote page.
 *
 * `primary_image_url` is the hero shot the web store already renders;
 * `gallery_image_urls` (migration 096) is everything else — other angles, the
 * terminal layout, the nameplate — so a customer can see what they're buying
 * and a technician can see what they're wiring.
 *
 * Images are plain URLs off the supplier's site, so any of them can 404. A
 * broken image hides itself rather than leaving a torn icon in the BOM.
 */

export interface ProductImageSource {
  primary_image_url?: string | null
  gallery_image_urls?: string[] | null
}

/** Hero first, then the gallery — blanks and duplicates dropped. */
export function productImages(item: ProductImageSource | null | undefined): string[] {
  if (!item) return []
  const all = [item.primary_image_url ?? '', ...(item.gallery_image_urls ?? [])]
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of all) {
    const url = (raw ?? '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/**
 * Small square thumbnail that opens the full gallery on click. Renders nothing
 * when the product has no images, so it never leaves a hole in a dense table.
 */
export function ProductThumb({
  item, alt, size = 28, className = '',
}: {
  item: ProductImageSource | null | undefined
  alt: string
  size?: number
  className?: string
}) {
  const images = productImages(item)
  const [open, setOpen] = useState(false)
  const [broken, setBroken] = useState(false)

  if (images.length === 0 || broken) return null

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        title={images.length > 1 ? `${alt} — ${images.length} photos` : alt}
        className={`group relative shrink-0 overflow-hidden rounded border border-border bg-muted ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- supplier URLs, arbitrary remote hosts */}
        <img
          src={images[0]}
          alt={alt}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-contain transition-transform group-hover:scale-110"
        />
        {images.length > 1 && (
          <span className="absolute bottom-0 right-0 rounded-tl bg-foreground/70 px-1 text-[8px] font-semibold leading-tight text-background">
            {images.length}
          </span>
        )}
      </button>
      {open && <ProductGallery images={images} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Full-screen gallery with keyboard paging. */
export function ProductGallery({
  images, alt, onClose,
}: {
  images: string[]
  alt: string
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const count = images.length
  const step = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, step])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} photos`}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black/80 p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex w-full max-w-4xl items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {count > 1 && (
          <button type="button" onClick={() => step(-1)} aria-label="Previous photo"
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- supplier URLs, arbitrary remote hosts */}
        <img
          src={images[index]}
          alt={`${alt} — photo ${index + 1} of ${count}`}
          className="max-h-[70vh] flex-1 rounded-lg bg-white object-contain"
        />
        {count > 1 && (
          <button type="button" onClick={() => step(1)} aria-label="Next photo"
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      <p className="text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        {alt}{count > 1 && <span className="text-white/50"> · {index + 1} / {count}</span>}
      </p>

      {count > 1 && (
        <div className="flex max-w-full gap-2 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1}`}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded border-2 bg-white ${i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- supplier URLs, arbitrary remote hosts */}
              <img src={url} alt="" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Inline strip of every photo — for detail pages, where space isn't tight. */
export function ProductImageStrip({
  item, alt, className = '',
}: {
  item: ProductImageSource | null | undefined
  alt: string
  className?: string
}) {
  const images = productImages(item)
  const [open, setOpen] = useState<number | null>(null)
  if (images.length === 0) return null

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {images.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen(i)}
            className="h-16 w-16 overflow-hidden rounded-md border border-border bg-white hover:border-accent"
            title={`${alt} — photo ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- supplier URLs, arbitrary remote hosts */}
            <img src={url} alt={`${alt} ${i + 1}`} loading="lazy" className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
      {open !== null && (
        <ProductGallery images={[...images.slice(open), ...images.slice(0, open)]} alt={alt} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

/** Empty-state hint for admin screens where no photo is attached yet. */
export function NoProductImage({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] text-muted-foreground ${className}`}>
      <ImageIcon className="h-3 w-3" /> no photo
    </span>
  )
}
