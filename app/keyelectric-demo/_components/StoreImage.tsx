'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'

interface Props {
  src: string
  alt: string
  /** extra classes for the <img> element */
  className?: string
}

/**
 * Image with graceful fallback. Product/category images are hot-linked from the
 * live keyelectric.co.za CDN; if any URL 404s we render a neutral placeholder
 * instead of a broken image. Fills its parent — size via the wrapper.
 */
export function StoreImage({ src, alt, className = 'object-contain p-3' }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--ke-soft)] text-gray-300">
        <ImageOff className="h-8 w-8" />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`h-full w-full ${className}`}
    />
  )
}
